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
from sklearn.model_selection import train_test_split
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

logger = logging.getLogger(__name__)


class TrainingService:
    """Orchestrates model selection, training, evaluation, and experiment artifact persistence."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
    ) -> None:
        settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or settings.resolved_upload_dir
        self.experiments_dir: Path = experiments_dir or settings.resolved_experiments_dir
        self.analysis_service = AnalysisService(upload_dir=self.upload_dir)
        self.registry = ModelRegistry()
        self.max_dataset_rows = settings.max_dataset_rows
        self.max_dataset_columns = settings.max_dataset_columns
        self.max_training_budget_seconds = settings.max_training_budget_seconds

        self.experiments_dir.mkdir(parents=True, exist_ok=True)

    def train_experiment(
        self,
        dataset_id: str,
        request: TrainingRequest,
    ) -> TrainingResponse:
        """Execute a resource-bounded AutoML training run on the specified dataset."""
        experiment_start_time = time.monotonic()

        # 1. Resolve and load dataset file safely
        file_path = self.analysis_service.resolve_dataset_file(dataset_id)
        df = self.analysis_service.load_dataset(file_path)

        rows = len(df)
        cols = len(df.columns)

        if rows == 0 or cols == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable rows or columns.",
            )

        # 2. Resource constraint checks
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

        # 3. Target column validation
        target_col = request.target_column.strip()
        if target_col not in df.columns:
            available = list(df.columns)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset. Available columns: {available}",
            )

        # Drop rows with missing target values prior to training
        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' has insufficient valid samples ({len(valid_df)} non-null rows). Minimum 5 required.",
            )

        # Verify target is non-constant
        if valid_df[target_col].nunique() <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' has only 1 distinct value and cannot support supervised learning.",
            )

        # 4. Task detection and validation
        rec, _ = self.analysis_service.detect_task_for_target(
            df=valid_df,
            target_column=target_col,
            task_override=request.task_type,
        )
        task_type = rec.task_type

        # 5. Feature extraction and splitting
        y = valid_df[target_col]
        X = valid_df.drop(columns=[target_col])

        # Separate numeric and categorical features
        num_cols = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c]) and not pd.api.types.is_bool_dtype(X[c])]
        cat_cols = [c for c in X.columns if c not in num_cols]

        if not num_cols and not cat_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset contains no usable feature columns after target extraction.",
            )

        # Handle train-test holdout split with stratification fallback
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
                # Fallback to non-stratified split if stratification fails due to sample distribution
                X_train, X_test, y_train, y_test = train_test_split(
                    X, y,
                    test_size=request.test_size,
                    random_state=request.random_state,
                )
        else:
            # Regression task
            y_numeric = pd.to_numeric(y, errors="coerce")
            if y_numeric.isna().any():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Target column '{target_col}' contains non-numeric values incompatible with regression.",
                )
            X_train, X_test, y_train, y_test = train_test_split(
                X, y_numeric,
                test_size=request.test_size,
                random_state=request.random_state,
            )

        # 6. Resolve Candidate Models and Primary Metric
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

        # Resolve primary metric
        if request.primary_metric:
            primary_metric = request.primary_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(primary_metric)
        else:
            primary_metric, greater_is_better = ModelEvaluator.get_default_metric(task_type)

        # 7. Preprocessing and Model Training Loop
        preprocessor = build_preprocessor(num_cols, cat_cols)
        results: List[ModelEvaluationResult] = []
        fitted_pipelines: Dict[str, Pipeline] = {}
        time_limit = request.time_budget_seconds

        for candidate in candidates:
            elapsed_time = time.monotonic() - experiment_start_time
            if elapsed_time >= time_limit:
                results.append(ModelEvaluationResult(
                    model_id=candidate.id,
                    model_name=candidate.name,
                    status=ModelStatus.SKIPPED_TIMEOUT,
                    metrics={},
                    duration_seconds=0.0,
                    error_message=f"Training budget of {time_limit}s exceeded (elapsed {elapsed_time:.2f}s).",
                ))
                continue

            model_start = time.monotonic()
            try:
                estimator = candidate.factory(request.random_state)
                pipeline = Pipeline(steps=[
                    ("preprocessor", preprocessor),
                    ("estimator", estimator),
                ])

                # Fit pipeline strictly on training split (no leakage)
                pipeline.fit(X_train, y_train)
                model_duration = round(time.monotonic() - model_start, 3)

                # Evaluate holdout metrics
                if task_type == TaskType.REGRESSION:
                    eval_metrics = ModelEvaluator.evaluate_regression(pipeline, X_test, y_test)
                else:
                    eval_metrics = ModelEvaluator.evaluate_classification(pipeline, X_test, y_test)

                fitted_pipelines[candidate.id] = pipeline
                results.append(ModelEvaluationResult(
                    model_id=candidate.id,
                    model_name=candidate.name,
                    status=ModelStatus.SUCCESSFUL,
                    metrics=eval_metrics,
                    duration_seconds=model_duration,
                ))
            except Exception as exc:
                model_duration = round(time.monotonic() - model_start, 3)
                logger.warning("Estimator '%s' failed to train: %s", candidate.id, type(exc).__name__)
                results.append(ModelEvaluationResult(
                    model_id=candidate.id,
                    model_name=candidate.name,
                    status=ModelStatus.FAILED,
                    metrics={},
                    duration_seconds=model_duration,
                    error_message=f"Fitting failed: {type(exc).__name__}",
                ))

        # 8. Model Ranking
        ranked_model_ids = ModelEvaluator.rank_models(results, primary_metric, greater_is_better)
        best_model_id = ranked_model_ids[0] if ranked_model_ids else None
        total_duration = round(time.monotonic() - experiment_start_time, 3)

        # 9. Experiment Persistence (Safe Metadata & Atomic Binary Serialization)
        experiment_id = str(uuid.uuid4())
        exp_dir = (self.experiments_dir / experiment_id).resolve()

        if not exp_dir.is_relative_to(self.experiments_dir.resolve()):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Security violation: experiment directory path escapes root.",
            )

        exp_dir.mkdir(parents=True, exist_ok=True)
        artifacts_saved = False

        try:
            # Serialize metadata JSON
            metadata_dict = {
                "experiment_id": experiment_id,
                "dataset_id": dataset_id,
                "target_column": target_col,
                "task_type": task_type.value,
                "primary_metric": primary_metric,
                "primary_metric_greater_is_better": greater_is_better,
                "random_state": request.random_state,
                "test_size": request.test_size,
                "train_rows": len(X_train),
                "test_rows": len(X_test),
                "features_count": X.shape[1],
                "ranked_models": ranked_model_ids,
                "best_model": best_model_id,
                "total_duration_seconds": total_duration,
                "models_evaluated": [r.model_dump() for r in results],
                "package_versions": {
                    "scikit-learn": sklearn.__version__,
                    "pandas": pd.__version__,
                    "numpy": np.__version__,
                },
            }

            metadata_file = exp_dir / "metadata.json"
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

        logger.info(
            "Experiment %s finished in %.2fs. Evaluated %d models. Best model: %s",
            experiment_id,
            total_duration,
            len(results),
            best_model_id,
        )

        return TrainingResponse(
            experiment_id=experiment_id,
            dataset_id=dataset_id,
            target_column=target_col,
            task_type=task_type.value,
            primary_metric=primary_metric,
            primary_metric_greater_is_better=greater_is_better,
            random_state=request.random_state,
            test_size=request.test_size,
            train_rows=len(X_train),
            test_rows=len(X_test),
            features_count=X.shape[1],
            models_evaluated=results,
            ranked_models=ranked_model_ids,
            best_model=best_model_id,
            total_duration_seconds=total_duration,
            artifacts_saved=artifacts_saved,
        )


def get_training_service() -> TrainingService:
    """Dependency provider for TrainingService."""
    return TrainingService()
