"""AutoML training orchestrator, leakage-safe data splitting, and experiment persistence."""

import json
import logging
from pathlib import Path
import tempfile
import time
from typing import Dict, List, Optional
import uuid

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.model_selection import KFold, StratifiedKFold, train_test_split
import sklearn

from app.core.config import Settings, get_settings
from app.schemas.analysis import TaskType
from app.schemas.training import (
    ModelEvaluationResult,
    ModelStatus,
    TrainingRequest,
    TrainingResponse,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.registry import ModelRegistry
from app.services.automl.tracker import MLflowTracker, compute_dataset_fingerprint

logger = logging.getLogger(__name__)


class TrainingService:
    """Orchestrates model selection, training, evaluation, and experiment artifact persistence."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or self.settings.resolved_upload_dir
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.analysis_service = AnalysisService(upload_dir=self.upload_dir)
        self.registry = ModelRegistry()
        self.max_dataset_rows = self.settings.max_dataset_rows
        self.max_dataset_columns = self.settings.max_dataset_columns
        self.max_training_budget_seconds = self.settings.max_training_budget_seconds

        self.experiments_dir.mkdir(parents=True, exist_ok=True)

    def train_experiment(
        self,
        dataset_id: str,
        request: TrainingRequest,
    ) -> TrainingResponse:
        """Execute a resource-bounded AutoML training run on the specified dataset."""
        experiment_start_time = time.monotonic()
        experiment_id = str(uuid.uuid4())

        # 1. Resolve dataset file and compute content fingerprint
        file_path = self.analysis_service.resolve_dataset_file(dataset_id)
        dataset_fingerprint = compute_dataset_fingerprint(file_path)

        # 2. Load dataset
        df = self.analysis_service.load_dataset(file_path)
        rows = len(df)
        cols = len(df.columns)

        if rows == 0 or cols == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable rows or columns.",
            )

        # 3. Resource constraint checks
        if rows > self.max_dataset_rows:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset rows ({rows}) exceed maximum supported training limit of {self.max_dataset_rows}.",
            )
        if cols > self.max_dataset_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset columns ({cols}) exceed maximum supported training limit of {self.max_dataset_columns}.",
            )

        if request.time_budget_seconds > self.max_training_budget_seconds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested time budget ({request.time_budget_seconds}s) exceeds maximum allowed budget ({self.max_training_budget_seconds}s).",
            )

        # 4. Target column validation
        target_col = request.target_column.strip()
        if target_col not in df.columns:
            available = list(df.columns)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset. Available columns: {available}",
            )

        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' has insufficient valid samples ({len(valid_df)} non-null rows). Minimum 5 required.",
            )

        if valid_df[target_col].nunique() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' has only 1 distinct value and cannot support supervised learning.",
            )

        # 5. Task detection and validation
        rec, _ = self.analysis_service.detect_task_for_target(
            df=valid_df,
            target_column=target_col,
            task_override=request.task_type,
        )
        task_type = rec.task_type

        # 6. Feature extraction
        y = valid_df[target_col]
        X = valid_df.drop(columns=[target_col])

        num_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c]) and not pd.api.types.is_bool_dtype(X[c])]
        cat_cols = [c for c in X.columns if c not in num_cols]

        if not num_cols and not cat_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable feature columns after target extraction.",
            )

        if task_type == TaskType.REGRESSION:
            y_numeric = pd.to_numeric(y, errors="coerce")
            if y_numeric.isna().any():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Target column '{target_col}' contains non-numeric values incompatible with regression.",
                )
            y = y_numeric

        # 7. Resolve Candidate Models and Primary Metric
        try:
            candidates = self.registry.resolve_candidates(task_type, request.models)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"No compatible candidate models found for task '{task_type.value}'.",
            )

        if request.primary_metric:
            primary_metric = request.primary_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(primary_metric)
        else:
            primary_metric, greater_is_better = ModelEvaluator.get_default_metric(task_type)

        # 8. Initialize MLflow Tracker
        tracker = MLflowTracker(
            tracking_uri=self.settings.mlflow_tracking_uri,
            enabled=self.settings.enable_mlflow_tracking,
            experiments_dir=self.experiments_dir,
        )
        parent_run_id, mlflow_exp_id, tracking_status, tracking_warning = tracker.start_parent_run(
            experiment_id=experiment_id,
            dataset_id=dataset_id,
            dataset_fingerprint=dataset_fingerprint,
            target_column=target_col,
            task_type=task_type.value,
            evaluation_strategy=request.evaluation_strategy,
            cv_folds=request.cv_folds if request.evaluation_strategy == "cross_validation" else None,
            test_size=request.test_size,
            random_state=request.random_state,
            primary_metric=primary_metric,
            time_budget_seconds=request.time_budget_seconds,
        )

        results: List[ModelEvaluationResult] = []
        fitted_pipelines: Dict[str, Pipeline] = {}
        time_limit = request.time_budget_seconds
        test_metrics: Optional[Dict[str, Any]] = None

        # 9. Execute Evaluation Strategy
        if request.evaluation_strategy == "holdout":
            # --- Holdout Evaluation (Backward Compatible) ---
            if task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
                min_class_count = y.value_counts().min()
                can_stratify = min_class_count >= 2
                try:
                    if can_stratify:
                        X_train, X_test, y_train, y_test = train_test_split(
                            X, y,
                            test_size=request.test_size,
                            random_state=request.random_state,
                            stratify=y,
                        )
                    else:
                        X_train, X_test, y_train, y_test = train_test_split(
                            X, y,
                            test_size=request.test_size,
                            random_state=request.random_state,
                        )
                except Exception:
                    X_train, X_test, y_train, y_test = train_test_split(
                        X, y,
                        test_size=request.test_size,
                        random_state=request.random_state,
                    )
            else:
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y,
                    test_size=request.test_size,
                    random_state=request.random_state,
                )

            train_rows = len(X_train)
            test_rows = len(X_test)
            evaluation_protocol = (
                "Holdout evaluation: candidates were fitted on the training split and evaluated on the holdout test split. "
                "Note: selecting candidates based on holdout performance is an empirical estimate; generalization may vary."
            )

            for candidate in candidates:
                elapsed_time = time.monotonic() - experiment_start_time
                if elapsed_time >= time_limit:
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.SKIPPED_TIMEOUT,
                        metrics={},
                        duration_seconds=0.0,
                        error_message=f"Training budget of {time_limit}s exceeded (elapsed {elapsed_time:.2f}s).",
                    )
                    results.append(res)
                    tracker.log_candidate_child_run(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=res.status.value,
                        duration_seconds=0.0,
                        metrics={},
                        error_message=res.error_message,
                    )
                    continue

                model_start = time.monotonic()
                try:
                    estimator = candidate.factory(request.random_state)
                    pipeline = Pipeline(steps=[
                        ("preprocessor", build_preprocessor(num_cols, cat_cols)),
                        ("estimator", estimator),
                    ])
                    pipeline.fit(X_train, y_train)
                    model_duration = round(time.monotonic() - model_start, 3)

                    if task_type == TaskType.REGRESSION:
                        eval_metrics = ModelEvaluator.evaluate_regression(pipeline, X_test, y_test)
                    else:
                        eval_metrics = ModelEvaluator.evaluate_classification(pipeline, X_test, y_test)

                    fitted_pipelines[candidate.id] = pipeline
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.SUCCESSFUL,
                        metrics=eval_metrics,
                        duration_seconds=model_duration,
                    )
                    results.append(res)
                    tracker.log_candidate_child_run(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=res.status.value,
                        duration_seconds=model_duration,
                        metrics=eval_metrics,
                    )
                except Exception as exc:
                    model_duration = round(time.monotonic() - model_start, 3)
                    logger.warning("Estimator '%s' failed to train: %s", candidate.id, type(exc).__name__)
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.FAILED,
                        metrics={},
                        duration_seconds=model_duration,
                        error_message=f"Fitting failed: {type(exc).__name__}",
                    )
                    results.append(res)
                    tracker.log_candidate_child_run(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=res.status.value,
                        duration_seconds=model_duration,
                        metrics={},
                        error_message=res.error_message,
                    )

        else:
            # --- Cross-Validation Evaluation (Step 6) ---
            # Separate untouched test set if requested
            if request.holdout_test and request.test_size > 0:
                can_stratify = False
                if task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
                    can_stratify = y.value_counts().min() >= 2

                try:
                    if can_stratify:
                        X_train_full, X_test_holdout, y_train_full, y_test_holdout = train_test_split(
                            X, y,
                            test_size=request.test_size,
                            random_state=request.random_state,
                            stratify=y,
                        )
                    else:
                        X_train_full, X_test_holdout, y_train_full, y_test_holdout = train_test_split(
                            X, y,
                            test_size=request.test_size,
                            random_state=request.random_state,
                        )
                except Exception:
                    X_train_full, X_test_holdout, y_train_full, y_test_holdout = train_test_split(
                        X, y,
                        test_size=request.test_size,
                        random_state=request.random_state,
                    )
                train_rows = len(X_train_full)
                test_rows = len(X_test_holdout)
            else:
                X_train_full, y_train_full = X, y
                X_test_holdout, y_test_holdout = None, None
                train_rows = len(X_train_full)
                test_rows = 0

            # Validate minimum sample count for folds
            if train_rows < request.cv_folds:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Training partition has insufficient samples ({train_rows}) for requested {request.cv_folds} cross-validation folds.",
                )

            # Determine CV fold splitter
            strat_warning = None
            if task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
                min_class_count = y_train_full.value_counts().min()
                if min_class_count >= request.cv_folds:
                    cv_splitter = StratifiedKFold(
                        n_splits=request.cv_folds,
                        shuffle=True,
                        random_state=request.random_state,
                    )
                    cv_protocol_desc = f"StratifiedKFold({request.cv_folds} folds, shuffle=True, seed={request.random_state})"
                else:
                    if request.cv_rare_class_fallback:
                        cv_splitter = KFold(
                            n_splits=request.cv_folds,
                            shuffle=True,
                            random_state=request.random_state,
                        )
                        cv_protocol_desc = (
                            f"Non-stratified KFold({request.cv_folds} folds, shuffle=True, seed={request.random_state}) "
                            f"[Fallback: minority class has only {min_class_count} sample(s) < cv_folds {request.cv_folds}]"
                        )
                        strat_warning = f"Stratification impossible: minority class has only {min_class_count} sample(s). Fallback to standard KFold."
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=(
                                f"StratifiedKFold impossible: minority class count ({min_class_count}) is less than "
                                f"cv_folds ({request.cv_folds}). Set cv_rare_class_fallback=true to permit non-stratified KFold."
                            ),
                        )
            else:
                cv_splitter = KFold(
                    n_splits=request.cv_folds,
                    shuffle=True,
                    random_state=request.random_state,
                )
                cv_protocol_desc = f"KFold({request.cv_folds} folds, shuffle=True, seed={request.random_state})"

            if X_test_holdout is not None:
                evaluation_protocol = (
                    f"Cross-validation ({cv_protocol_desc}) on training partition ({train_rows} samples) was used for "
                    f"candidate selection. The selected model was evaluated once on an independent holdout test set ({test_rows} samples) "
                    f"that was completely untouched during candidate selection and hyperparameter decisions."
                )
            else:
                evaluation_protocol = (
                    f"Pure cross-validation ({cv_protocol_desc}) across all available data ({train_rows} samples). "
                    f"No independent final test set was reserved."
                )
            if strat_warning:
                evaluation_protocol += f" Warning: {strat_warning}"

            for candidate in candidates:
                elapsed_time = time.monotonic() - experiment_start_time
                if elapsed_time >= time_limit:
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.SKIPPED_TIMEOUT,
                        metrics={},
                        duration_seconds=0.0,
                        error_message=f"Training budget of {time_limit}s exceeded (elapsed {elapsed_time:.2f}s).",
                    )
                    results.append(res)
                    tracker.log_candidate_child_run(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=res.status.value,
                        duration_seconds=0.0,
                        metrics={},
                        error_message=res.error_message,
                    )
                    continue

                model_start = time.monotonic()
                fold_metrics_list: List[Dict[str, Any]] = []
                fold_failure_err = None

                for fold_idx, (tr_idx, val_idx) in enumerate(cv_splitter.split(X_train_full, y_train_full)):
                    # Check best-effort time budget before each fold
                    if time.monotonic() - experiment_start_time >= time_limit:
                        fold_failure_err = f"Time budget of {time_limit}s reached during fold {fold_idx + 1}."
                        break

                    X_tr, y_tr = X_train_full.iloc[tr_idx], y_train_full.iloc[tr_idx]
                    X_val, y_val = X_train_full.iloc[val_idx], y_train_full.iloc[val_idx]

                    # Leakage prevention: construct fresh pipeline fitted strictly on fold training data
                    fold_pipeline = Pipeline(steps=[
                        ("preprocessor", build_preprocessor(num_cols, cat_cols)),
                        ("estimator", candidate.factory(request.random_state)),
                    ])

                    try:
                        fold_pipeline.fit(X_tr, y_tr)
                        if task_type == TaskType.REGRESSION:
                            f_metrics = ModelEvaluator.evaluate_regression(fold_pipeline, X_val, y_val)
                        else:
                            f_metrics = ModelEvaluator.evaluate_classification(fold_pipeline, X_val, y_val)
                        fold_metrics_list.append(f_metrics)
                    except Exception as exc:
                        fold_failure_err = f"Fold {fold_idx + 1} fit failed: {type(exc).__name__}"
                        logger.warning("Estimator '%s' failed on fold %d: %s", candidate.id, fold_idx + 1, exc)
                        break

                model_duration = round(time.monotonic() - model_start, 3)
                mean_metrics, cv_scores, cv_mean, cv_std, valid_folds = ModelEvaluator.aggregate_cv_results(
                    fold_metrics_list,
                    primary_metric,
                )

                if valid_folds > 0:
                    status_val = ModelStatus.SUCCESSFUL
                    # Refit pipeline on the full training partition so winning model can be persisted & evaluated
                    try:
                        full_pipeline = Pipeline(steps=[
                            ("preprocessor", build_preprocessor(num_cols, cat_cols)),
                            ("estimator", candidate.factory(request.random_state)),
                        ])
                        full_pipeline.fit(X_train_full, y_train_full)
                        fitted_pipelines[candidate.id] = full_pipeline
                    except Exception as exc:
                        logger.warning("Full refit for '%s' failed: %s", candidate.id, exc)

                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=status_val,
                        metrics=mean_metrics,
                        cv_scores=cv_scores,
                        cv_mean=cv_mean,
                        cv_std=cv_std,
                        valid_folds_count=valid_folds,
                        fold_metrics=fold_metrics_list,
                        duration_seconds=model_duration,
                        error_message=fold_failure_err,
                    )
                elif fold_failure_err and "Time budget" in fold_failure_err:
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.SKIPPED_TIMEOUT,
                        metrics={},
                        duration_seconds=model_duration,
                        error_message=fold_failure_err,
                    )
                else:
                    res = ModelEvaluationResult(
                        model_id=candidate.id,
                        model_name=candidate.name,
                        status=ModelStatus.FAILED,
                        metrics={},
                        duration_seconds=model_duration,
                        error_message=fold_failure_err or "All cross-validation folds failed.",
                    )

                results.append(res)
                tracker.log_candidate_child_run(
                    model_id=candidate.id,
                    model_name=candidate.name,
                    status=res.status.value,
                    duration_seconds=model_duration,
                    metrics=mean_metrics,
                    cv_scores=cv_scores,
                    cv_mean=cv_mean,
                    cv_std=cv_std,
                    valid_folds_count=valid_folds,
                    error_message=res.error_message,
                )

        # 10. Model Ranking
        ranked_model_ids = ModelEvaluator.rank_models(results, primary_metric, greater_is_better)
        best_model_id = ranked_model_ids[0] if ranked_model_ids else None
        best_score = None
        if best_model_id:
            for r in results:
                if r.model_id == best_model_id:
                    best_score = r.cv_mean if r.cv_mean is not None else r.metrics.get(primary_metric)
                    break

        # 11. Independent Final Test Evaluation (Only after model selection!)
        if request.evaluation_strategy == "cross_validation" and request.holdout_test and X_test_holdout is not None:
            if best_model_id and best_model_id in fitted_pipelines:
                best_pipeline = fitted_pipelines[best_model_id]
                if task_type == TaskType.REGRESSION:
                    test_metrics = ModelEvaluator.evaluate_regression(best_pipeline, X_test_holdout, y_test_holdout)
                else:
                    test_metrics = ModelEvaluator.evaluate_classification(best_pipeline, X_test_holdout, y_test_holdout)

        total_duration = round(time.monotonic() - experiment_start_time, 3)

        # 12. Experiment Persistence (Safe Metadata & Atomic Binary Serialization)
        exp_dir = (self.experiments_dir / experiment_id).resolve()
        if not exp_dir.is_relative_to(self.experiments_dir.resolve()):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security violation: experiment directory path escapes root.",
            )

        exp_dir.mkdir(parents=True, exist_ok=True)
        artifacts_saved = False
        metadata_file = exp_dir / "metadata.json"

        try:
            metadata_dict = {
                "experiment_id": experiment_id,
                "dataset_id": dataset_id,
                "dataset_fingerprint": dataset_fingerprint,
                "target_column": target_col,
                "task_type": task_type.value,
                "evaluation_strategy": request.evaluation_strategy,
                "cv_folds": request.cv_folds if request.evaluation_strategy == "cross_validation" else None,
                "primary_metric": primary_metric,
                "primary_metric_greater_is_better": greater_is_better,
                "random_state": request.random_state,
                "test_size": request.test_size,
                "train_rows": train_rows,
                "test_rows": test_rows,
                "features_count": X.shape[1],
                "ranked_models": ranked_model_ids,
                "best_model": best_model_id,
                "best_score": best_score,
                "test_metrics": test_metrics,
                "evaluation_protocol": evaluation_protocol,
                "mlflow_run_id": parent_run_id,
                "mlflow_experiment_id": mlflow_exp_id,
                "tracking_status": tracking_status,
                "tracking_warning": tracking_warning,
                "total_duration_seconds": total_duration,
                "models_evaluated": [r.model_dump() for r in results],
                "package_versions": {
                    "scikit-learn": sklearn.__version__,
                    "pandas": pd.__version__,
                    "numpy": np.__version__,
                    "mlflow": getattr(tracker._mlflow, "__version__", "unknown") if tracker._mlflow else "not_installed",
                },
            }

            # Atomic write to temporary file then replace
            with tempfile.NamedTemporaryFile("w", dir=exp_dir, delete=False, encoding="utf-8") as tf:
                json.dump(metadata_dict, tf, indent=2)
                temp_meta_path = Path(tf.name)
            temp_meta_path.replace(metadata_file)

            # Persist best model binary if available
            if best_model_id and best_model_id in fitted_pipelines:
                model_file = exp_dir / "best_model.joblib"
                with tempfile.NamedTemporaryFile("wb", dir=exp_dir, delete=False) as tf:
                    temp_model_path = Path(tf.name)
                joblib.dump(fitted_pipelines[best_model_id], temp_model_path)
                temp_model_path.replace(model_file)
                artifacts_saved = True

        except Exception as exc:
            logger.error("Failed to persist experiment artifacts for %s: %s", experiment_id, exc)
            artifacts_saved = False

        # 13. Finalize MLflow Parent Run
        tracker.finalize_parent_run(
            best_model=best_model_id,
            best_score=best_score,
            test_metrics=test_metrics,
            total_duration_seconds=total_duration,
            metadata_file=metadata_file,
        )

        logger.info(
            "Experiment %s finished in %.2fs. Evaluated %d models. Strategy: %s. Best model: %s",
            experiment_id,
            total_duration,
            len(results),
            request.evaluation_strategy,
            best_model_id,
        )

        return TrainingResponse(
            experiment_id=experiment_id,
            dataset_id=dataset_id,
            dataset_fingerprint=dataset_fingerprint,
            target_column=target_col,
            task_type=task_type.value,
            evaluation_strategy=request.evaluation_strategy,
            cv_folds=request.cv_folds if request.evaluation_strategy == "cross_validation" else None,
            primary_metric=primary_metric,
            primary_metric_greater_is_better=greater_is_better,
            random_state=request.random_state,
            test_size=request.test_size,
            train_rows=train_rows,
            test_rows=test_rows,
            features_count=X.shape[1],
            models_evaluated=results,
            ranked_models=ranked_model_ids,
            best_model=best_model_id,
            test_metrics=test_metrics,
            total_duration_seconds=total_duration,
            artifacts_saved=artifacts_saved,
            mlflow_run_id=parent_run_id,
            mlflow_experiment_id=mlflow_exp_id,
            tracking_status=tracking_status,
            tracking_warning=tracking_warning,
            evaluation_protocol=evaluation_protocol,
        )


def get_training_service() -> TrainingService:
    """Dependency provider for TrainingService."""
    return TrainingService()
