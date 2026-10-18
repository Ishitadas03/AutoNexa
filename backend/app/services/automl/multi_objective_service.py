"""Multi-Objective AutoML Optimization and Resource-Aware Model Selection Service."""

from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import platform
import time
import tracemalloc
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.base import BaseEstimator
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import KFold, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from app.core.config import Settings, get_settings
from app.schemas.analysis import TaskType
from app.schemas.multi_objective import (
    CandidateMeasurement,
    ModelComplexityMetadata,
    MultiObjectiveExperimentRequest,
    MultiObjectiveExperimentResponse,
    MultiObjectiveSelectionRequest,
    MultiObjectiveSelectionResult,
    ObjectiveDefinition,
    ObjectiveDirection,
    ParetoCandidateResult,
    ResourceConstraints,
    SelectionPolicy,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.evaluator import ModelEvaluator, sanitize_float
from app.services.automl.pareto import ParetoFrontierCalculator
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.registry import ModelRegistry
from app.services.automl.resource_profiler import ResourceProfiler
from app.services.automl.tracker import compute_dataset_fingerprint

logger = logging.getLogger(__name__)


class MultiObjectiveService:
    """Orchestrates multi-objective candidate model evaluation, Pareto analysis, and resource-aware selection."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
        analysis_service: Optional[AnalysisService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or self.settings.resolved_upload_dir
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.analysis_service = analysis_service or AnalysisService(upload_dir=self.upload_dir)
        self.multi_objective_experiments_dir = self.experiments_dir / "multi_objective_experiments"
        self.multi_objective_experiments_dir.mkdir(parents=True, exist_ok=True)
        self.registry = ModelRegistry()

    def _resolve_candidate_specs(
        self,
        task_type: TaskType,
        include_hpo: bool,
        candidate_models: Optional[List[str]],
        random_state: int,
    ) -> List[Tuple[str, str, Dict[str, Any], BaseEstimator]]:
        """Generate structured candidate specifications: (candidate_id, model_name, hyperparameters, estimator_instance)."""
        specs: List[Tuple[str, str, Dict[str, Any], BaseEstimator]] = []

        is_reg = task_type == TaskType.REGRESSION

        if is_reg:
            # Standard registry baselines
            specs.append((
                "linear_regression_baseline",
                "Ridge Linear Regression",
                {"alpha": 1.0},
                Ridge(alpha=1.0, random_state=random_state),
            ))
            specs.append((
                "decision_tree_default",
                "Decision Tree Regressor (Depth 10)",
                {"max_depth": 10},
                DecisionTreeRegressor(max_depth=10, random_state=random_state),
            ))
            specs.append((
                "random_forest_default",
                "Random Forest Regressor (50 Trees)",
                {"n_estimators": 50, "max_depth": 10},
                RandomForestRegressor(n_estimators=50, max_depth=10, n_jobs=1, random_state=random_state),
            ))
            specs.append((
                "hist_gradient_boosting_default",
                "HistGradientBoosting Regressor (50 Iter)",
                {"max_iter": 50},
                HistGradientBoostingRegressor(max_iter=50, random_state=random_state),
            ))

            if include_hpo:
                # Fast / Light variants
                specs.append((
                    "dt_shallow_fast",
                    "Decision Tree Regressor (Shallow, Depth 4)",
                    {"max_depth": 4},
                    DecisionTreeRegressor(max_depth=4, random_state=random_state),
                ))
                specs.append((
                    "rf_compact_fast",
                    "Random Forest Regressor (Compact, 15 Trees)",
                    {"n_estimators": 15, "max_depth": 6},
                    RandomForestRegressor(n_estimators=15, max_depth=6, n_jobs=1, random_state=random_state),
                ))
                specs.append((
                    "rf_deep_accurate",
                    "Random Forest Regressor (High Capacity, 80 Trees)",
                    {"n_estimators": 80, "max_depth": 16},
                    RandomForestRegressor(n_estimators=80, max_depth=16, n_jobs=1, random_state=random_state),
                ))
                specs.append((
                    "hgb_fast",
                    "HistGradientBoosting Regressor (Fast, 25 Iter)",
                    {"max_iter": 25, "max_leaf_nodes": 15},
                    HistGradientBoostingRegressor(max_iter=25, max_leaf_nodes=15, random_state=random_state),
                ))
                specs.append((
                    "hgb_deep_accurate",
                    "HistGradientBoosting Regressor (Deep, 100 Iter)",
                    {"max_iter": 100, "max_leaf_nodes": 31},
                    HistGradientBoostingRegressor(max_iter=100, max_leaf_nodes=31, random_state=random_state),
                ))
                specs.append((
                    "ridge_strong_regularization",
                    "Ridge Regressor (Strong Regularization, alpha=10.0)",
                    {"alpha": 10.0},
                    Ridge(alpha=10.0, random_state=random_state),
                ))
        else:
            # Classification specifications
            specs.append((
                "logistic_regression_baseline",
                "Logistic Regression",
                {"C": 1.0, "max_iter": 1000},
                LogisticRegression(C=1.0, max_iter=1000, random_state=random_state),
            ))
            specs.append((
                "decision_tree_default",
                "Decision Tree Classifier (Depth 10)",
                {"max_depth": 10},
                DecisionTreeClassifier(max_depth=10, random_state=random_state),
            ))
            specs.append((
                "random_forest_default",
                "Random Forest Classifier (50 Trees)",
                {"n_estimators": 50, "max_depth": 10},
                RandomForestClassifier(n_estimators=50, max_depth=10, n_jobs=1, random_state=random_state),
            ))
            specs.append((
                "hist_gradient_boosting_default",
                "HistGradientBoosting Classifier (50 Iter)",
                {"max_iter": 50},
                HistGradientBoostingClassifier(max_iter=50, random_state=random_state),
            ))

            if include_hpo:
                # Fast / Light variants
                specs.append((
                    "dt_shallow_fast",
                    "Decision Tree Classifier (Shallow, Depth 4)",
                    {"max_depth": 4},
                    DecisionTreeClassifier(max_depth=4, random_state=random_state),
                ))
                specs.append((
                    "rf_compact_fast",
                    "Random Forest Classifier (Compact, 15 Trees)",
                    {"n_estimators": 15, "max_depth": 6},
                    RandomForestClassifier(n_estimators=15, max_depth=6, n_jobs=1, random_state=random_state),
                ))
                specs.append((
                    "rf_deep_accurate",
                    "Random Forest Classifier (High Capacity, 80 Trees)",
                    {"n_estimators": 80, "max_depth": 16},
                    RandomForestClassifier(n_estimators=80, max_depth=16, n_jobs=1, random_state=random_state),
                ))
                specs.append((
                    "hgb_fast",
                    "HistGradientBoosting Classifier (Fast, 25 Iter)",
                    {"max_iter": 25, "max_leaf_nodes": 15},
                    HistGradientBoostingClassifier(max_iter=25, max_leaf_nodes=15, random_state=random_state),
                ))
                specs.append((
                    "hgb_deep_accurate",
                    "HistGradientBoosting Classifier (Deep, 100 Iter)",
                    {"max_iter": 100, "max_leaf_nodes": 31},
                    HistGradientBoostingClassifier(max_iter=100, max_leaf_nodes=31, random_state=random_state),
                ))
                specs.append((
                    "lr_light_regularization",
                    "Logistic Regression (Light Regularization, C=10.0)",
                    {"C": 10.0, "max_iter": 1000},
                    LogisticRegression(C=10.0, max_iter=1000, random_state=random_state),
                ))

        # Filter by candidate_models if explicitly requested
        if candidate_models:
            filtered_specs = []
            req_set = set(candidate_models)
            for cid, mname, hparams, est in specs:
                # Match candidate_id or estimator class name or base family
                m_cls = est.__class__.__name__.lower()
                if cid in req_set or any(req in cid or req in m_cls for req in req_set):
                    filtered_specs.append((cid, mname, hparams, est))
            if filtered_specs:
                return filtered_specs

        return specs

    def run_multi_objective_experiment(
        self,
        request: MultiObjectiveExperimentRequest,
    ) -> MultiObjectiveExperimentResponse:
        """Execute a full multi-objective AutoML experiment across candidate models with strict test leakage prevention."""
        start_wall_clock = time.perf_counter()
        experiment_id = str(uuid.uuid4())

        # 1. Resolve dataset file and compute fingerprint
        dataset_key = request.dataset_id[:-4] if request.dataset_id.endswith(".csv") else request.dataset_id
        file_path = self.analysis_service.resolve_dataset_file(dataset_key)
        dataset_fingerprint = compute_dataset_fingerprint(file_path)
        df = self.analysis_service.load_dataset(file_path)

        target_col = request.target_column.strip()
        if target_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset '{request.dataset_id}'.",
            )

        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 15:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset has insufficient non-null rows ({len(valid_df)}). Minimum 15 required.",
            )

        # 2. Detect task type
        rec, _ = self.analysis_service.detect_task_for_target(
            df=valid_df,
            target_column=target_col,
            task_override=request.task_type,
        )
        task_type = rec.task_type

        # 3. Determine primary metric and direction
        if request.primary_metric:
            primary_metric = request.primary_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(primary_metric)
        else:
            primary_metric, greater_is_better = ModelEvaluator.get_default_metric(task_type)

        predictive_direction: ObjectiveDirection = "maximize" if greater_is_better else "minimize"

        # 4. Formulate multi-objective definitions
        objectives: List[ObjectiveDefinition] = [
            ObjectiveDefinition(
                name=f"Predictive Score ({primary_metric.upper()})",
                key="predictive_metric",
                direction=predictive_direction,
                unit="score" if predictive_direction == "maximize" else "error",
                description="Cross-validation out-of-fold generalization performance",
            ),
            ObjectiveDefinition(
                name="Inference Latency",
                key="inference_latency_ms",
                direction="minimize",
                unit="ms/sample",
                description="Monotonic repeated benchmark prediction latency per individual sample",
            ),
            ObjectiveDefinition(
                name="Training Duration",
                key="training_duration_seconds",
                direction="minimize",
                unit="seconds",
                description="High-resolution wall-clock training time for the full pipeline",
            ),
            ObjectiveDefinition(
                name="Model Artifact Size",
                key="artifact_size_bytes",
                direction="minimize",
                unit="bytes",
                description="Serialized joblib compressed pipeline footprint on disk",
            ),
            ObjectiveDefinition(
                name="Structural Complexity",
                key="model_complexity",
                direction="minimize",
                unit="structural_units",
                description="Estimator-specific structural complexity (total nodes, non-zero weights, or parameter count)",
            ),
        ]

        # 5. SCIENTIFIC INTEGRITY: Partition data into Train/Validation and Untouched Holdout Test
        # The test set is held out completely and NEVER used during CV or candidate selection.
        X = valid_df.drop(columns=[target_col])
        y = valid_df[target_col]

        stratify = None
        if task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
            class_counts = y.value_counts()
            if (class_counts >= 2).all():
                stratify = y

        X_train_val, X_test, y_train_val, y_test = train_test_split(
            X,
            y,
            test_size=request.test_size,
            random_state=request.random_state,
            stratify=stratify,
        )

        numeric_features = [c for c in X.columns if pd.api.types.is_numeric_dtype(X[c])]
        categorical_features = [c for c in X.columns if c not in numeric_features]

        # 6. Resolve Candidate Specifications
        candidate_specs = self._resolve_candidate_specs(
            task_type=task_type,
            include_hpo=request.include_hpo_candidates,
            candidate_models=request.candidate_models,
            random_state=request.random_state,
        )

        # 7. Evaluate and Profile Each Candidate on Train/Validation partition
        measurements: List[CandidateMeasurement] = []
        fitted_pipelines: Dict[str, Pipeline] = {}

        # Set up cross-validation splitter
        if task_type in (TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION):
            splitter = StratifiedKFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_state)
            cv_splits = list(splitter.split(X_train_val, y_train_val))
        else:
            splitter = KFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_state)
            cv_splits = list(splitter.split(X_train_val, y_train_val))

        for cand_id, m_name, hparams, estimator in candidate_specs:
            try:
                # A. Cross-validation evaluation: strictly fit preprocessor inside each fold
                fold_metrics: List[Dict[str, Any]] = []

                for train_idx, val_idx in cv_splits:
                    X_f_tr = X_train_val.iloc[train_idx]
                    y_f_tr = y_train_val.iloc[train_idx]
                    X_f_val = X_train_val.iloc[val_idx]
                    y_f_val = y_train_val.iloc[val_idx]

                    # Fresh preprocessor per fold to prevent leakage
                    fold_preprocessor = build_preprocessor(numeric_features, categorical_features)
                    fold_pipe = Pipeline([
                        ("preprocessor", fold_preprocessor),
                        ("model", sklearn.base.clone(estimator)),
                    ])

                    fold_pipe.fit(X_f_tr, y_f_tr)

                    if task_type == TaskType.REGRESSION:
                        eval_dict = ModelEvaluator.evaluate_regression(fold_pipe, X_f_val, y_f_val)
                    else:
                        eval_dict = ModelEvaluator.evaluate_classification(fold_pipe, X_f_val, y_f_val)

                    fold_metrics.append(eval_dict)

                # Aggregate cross-validation metrics
                _, cv_scores, cv_mean, cv_std, _ = ModelEvaluator.aggregate_cv_results(
                    fold_metrics_list=fold_metrics,
                    primary_metric=primary_metric,
                )

                # B. Fit full pipeline on full train_val partition with monotonic clock and memory tracking
                full_preprocessor = build_preprocessor(numeric_features, categorical_features)
                candidate_pipeline = Pipeline([
                    ("preprocessor", full_preprocessor),
                    ("model", sklearn.base.clone(estimator)),
                ])

                tracemalloc.start()
                t0_train = time.perf_counter()
                candidate_pipeline.fit(X_train_val, y_train_val)
                train_duration = round(time.perf_counter() - t0_train, 4)
                _, peak_mem = tracemalloc.get_traced_memory()
                tracemalloc.stop()

                fitted_pipelines[cand_id] = candidate_pipeline

                # C. Operational Profiling
                lat_ms, tput_sec = ResourceProfiler.profile_inference_latency(
                    candidate_pipeline,
                    X_train_val,
                    n_passes=5,
                    max_batch_size=100,
                )
                artifact_size = ResourceProfiler.measure_artifact_size_bytes(candidate_pipeline)
                complexity = ResourceProfiler.extract_model_complexity(candidate_pipeline)

                measurement = CandidateMeasurement(
                    candidate_id=cand_id,
                    model_id=estimator.__class__.__name__.lower(),
                    model_name=m_name,
                    hyperparameters=hparams,
                    status="completed",
                    error_message=None,
                    predictive_metric=primary_metric,
                    predictive_direction=predictive_direction,
                    validation_score=cv_mean,
                    cv_std=cv_std,
                    training_duration_seconds=train_duration,
                    inference_latency_ms_per_sample=lat_ms,
                    inference_throughput_samples_per_sec=tput_sec,
                    model_artifact_size_bytes=artifact_size,
                    peak_memory_bytes=peak_mem,
                    complexity=complexity,
                    test_score=None,
                    test_metrics=None,
                )
                measurements.append(measurement)

            except Exception as exc:
                logger.error("Profiling failed for candidate '%s': %s", cand_id, exc, exc_info=True)
                fail_complexity = ModelComplexityMetadata(
                    estimator_type=estimator.__class__.__name__,
                    tree_count=None,
                    max_depth=None,
                    total_tree_nodes=None,
                    leaf_count=None,
                    n_parameters=None,
                    n_nonzero_coefficients=None,
                    summary_complexity_score=0.0,
                    complexity_unit="none",
                    notes="Failed evaluation",
                )
                measurements.append(
                    CandidateMeasurement(
                        candidate_id=cand_id,
                        model_id=estimator.__class__.__name__.lower(),
                        model_name=m_name,
                        hyperparameters=hparams,
                        status="failed",
                        error_message=str(exc),
                        predictive_metric=primary_metric,
                        predictive_direction=predictive_direction,
                        validation_score=None,
                        cv_std=None,
                        training_duration_seconds=0.0,
                        inference_latency_ms_per_sample=0.0,
                        inference_throughput_samples_per_sec=0.0,
                        model_artifact_size_bytes=0,
                        peak_memory_bytes=None,
                        complexity=fail_complexity,
                        test_score=None,
                        test_metrics=None,
                    )
                )

        # 8. Compute Pareto-Dominance and Feasibility across Objectives
        candidates, pareto_ids = ParetoFrontierCalculator.compute_pareto_frontier(
            measurements=measurements,
            objectives=objectives,
            constraints=request.constraints,
        )

        # 9. Perform Resource-Aware Selection
        selection = ParetoFrontierCalculator.select_model(
            candidates=candidates,
            policy=request.selection_policy,
        )

        # 10. SCIENTIFIC VALIDATION: Evaluate Selected Model on Untouched Holdout Test Set
        if selection.selected_candidate_id and selection.selected_candidate_id in fitted_pipelines:
            selected_pipe = fitted_pipelines[selection.selected_candidate_id]
            if task_type == TaskType.REGRESSION:
                test_eval = ModelEvaluator.evaluate_regression(selected_pipe, X_test, y_test)
            else:
                test_eval = ModelEvaluator.evaluate_classification(selected_pipe, X_test, y_test)

            test_score = test_eval.get(primary_metric)
            selection.untouched_test_evaluation = test_eval

            # Attach test results to selected candidate record
            for c in candidates:
                if c.measurement.candidate_id == selection.selected_candidate_id:
                    c.measurement.test_score = test_score
                    c.measurement.test_metrics = test_eval
                    break
            if selection.selected_candidate:
                selection.selected_candidate.measurement.test_score = test_score
                selection.selected_candidate.measurement.test_metrics = test_eval

        # 11. Hardware / Platform Metadata
        exec_platform = {
            "os": platform.system(),
            "os_release": platform.release(),
            "python_version": platform.python_version(),
            "scikit_learn_version": sklearn.__version__,
            "cpu_architecture": platform.machine(),
            "processor": platform.processor(),
            "monotonic_clock": "time.perf_counter()",
            "memory_profiler": "tracemalloc (Python-heap allocation tracking; excludes external C/C++ library buffers)",
        }

        # 12. Create Full Response
        response = MultiObjectiveExperimentResponse(
            experiment_id=experiment_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            dataset_id=request.dataset_id,
            dataset_name=Path(file_path).name,
            dataset_fingerprint=dataset_fingerprint,
            task_type=task_type.value,
            primary_metric=primary_metric,
            objectives_evaluated=objectives,
            candidates=candidates,
            pareto_frontier_candidate_ids=pareto_ids,
            selection=selection,
            execution_platform=exec_platform,
            profiling_methodology_disclaimer=(
                "Measurements recorded using a dedicated warm-up inference pass followed by repeated timing. "
                "Training time measured with a monotonic high-resolution clock (time.perf_counter). "
                "Memory profiled via tracemalloc (tracking Python heap allocations only; excludes external C-level BLAS/OpenMP buffers). "
                "Preprocessing fitted strictly within folds. Test set held out and evaluated only post-selection."
            ),
            csv_export_url=f"/api/v1/benchmarks/multi-objective/{experiment_id}/export-csv",
        )

        # 13. Persist Manifest to disk
        self._save_experiment(response, X_test, y_test, fitted_pipelines)

        return response

    def _save_experiment(
        self,
        response: MultiObjectiveExperimentResponse,
        X_test: Optional[pd.DataFrame] = None,
        y_test: Optional[pd.Series] = None,
        fitted_pipelines: Optional[Dict[str, Pipeline]] = None,
    ) -> None:
        """Persist experiment JSON manifest to disk and cache holdout evaluation data."""
        exp_path = self.multi_objective_experiments_dir / f"{response.experiment_id}.json"
        with open(exp_path, "w", encoding="utf-8") as f:
            f.write(response.model_dump_json(indent=2))

        if X_test is not None and y_test is not None and fitted_pipelines is not None:
            cache_path = self.multi_objective_experiments_dir / f"{response.experiment_id}_holdout.joblib"
            try:
                joblib.dump(
                    {
                        "X_test": X_test,
                        "y_test": y_test,
                        "fitted_pipelines": fitted_pipelines,
                        "primary_metric": response.primary_metric,
                        "task_type": response.task_type,
                    },
                    cache_path,
                    compress=3,
                )
            except Exception as exc:
                logger.warning("Could not cache holdout test data for dynamic re-selection: %s", exc)

    def get_multi_objective_experiment(self, experiment_id: str) -> MultiObjectiveExperimentResponse:
        """Load a stored multi-objective experiment report."""
        exp_file = self.multi_objective_experiments_dir / f"{experiment_id}.json"
        if not exp_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Multi-objective experiment '{experiment_id}' not found.",
            )
        try:
            with open(exp_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return MultiObjectiveExperimentResponse.model_validate(data)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to load experiment: {exc}",
            ) from exc

    def get_pareto_frontier(self, experiment_id: str) -> List[ParetoCandidateResult]:
        """Retrieve only the non-dominated Pareto-optimal candidates for an experiment."""
        exp = self.get_multi_objective_experiment(experiment_id)
        return [c for c in exp.candidates if c.is_pareto_optimal]

    def select_model_for_experiment(
        self,
        experiment_id: str,
        request: MultiObjectiveSelectionRequest,
    ) -> MultiObjectiveSelectionResult:
        """Apply dynamic resource constraints and a new selection policy to an existing experiment."""
        exp = self.get_multi_objective_experiment(experiment_id)

        # Recompute Pareto frontier with newly provided constraints if constraints are specified
        raw_measurements = [c.measurement for c in exp.candidates]
        recomputed_candidates, _ = ParetoFrontierCalculator.compute_pareto_frontier(
            measurements=raw_measurements,
            objectives=exp.objectives_evaluated,
            constraints=request.constraints,
        )

        # Select model under requested policy
        result = ParetoFrontierCalculator.select_model(
            candidates=recomputed_candidates,
            policy=request.policy,
            custom_weights=request.custom_weights,
        )

        # Ensure selected model has untouched holdout test metrics evaluated
        if result.selected_candidate_id:
            # First check if the original manifest already holds test metrics for this candidate
            for c in exp.candidates:
                if c.measurement.candidate_id == result.selected_candidate_id and c.measurement.test_score is not None:
                    result.untouched_test_evaluation = c.measurement.test_metrics
                    if result.selected_candidate:
                        result.selected_candidate.measurement.test_score = c.measurement.test_score
                        result.selected_candidate.measurement.test_metrics = c.measurement.test_metrics
                    break

            # If not yet evaluated, evaluate on cached untouched holdout partition
            if result.untouched_test_evaluation is None:
                cache_path = self.multi_objective_experiments_dir / f"{experiment_id}_holdout.joblib"
                if cache_path.exists():
                    try:
                        cached = joblib.load(cache_path)
                        pipelines = cached.get("fitted_pipelines", {})
                        if result.selected_candidate_id in pipelines:
                            pipe = pipelines[result.selected_candidate_id]
                            X_t = cached["X_test"]
                            y_t = cached["y_test"]
                            task_t = cached.get("task_type", exp.task_type)
                            if "regression" in str(task_t).lower():
                                test_eval = ModelEvaluator.evaluate_regression(pipe, X_t, y_t)
                            else:
                                test_eval = ModelEvaluator.evaluate_classification(pipe, X_t, y_t)

                            test_score = test_eval.get(exp.primary_metric)
                            result.untouched_test_evaluation = test_eval
                            if result.selected_candidate:
                                result.selected_candidate.measurement.test_score = test_score
                                result.selected_candidate.measurement.test_metrics = test_eval

                            # Update the persisted experiment JSON so this candidate's test metrics are recorded
                            for c in exp.candidates:
                                if c.measurement.candidate_id == result.selected_candidate_id:
                                    c.measurement.test_score = test_score
                                    c.measurement.test_metrics = test_eval
                                    break
                            exp_path = self.multi_objective_experiments_dir / f"{experiment_id}.json"
                            with open(exp_path, "w", encoding="utf-8") as f:
                                f.write(exp.model_dump_json(indent=2))
                    except Exception as exc:
                        logger.warning("Could not evaluate holdout on re-selected model: %s", exc)

        return result

    def export_csv(self, experiment_id: str) -> str:
        """Export all candidate measurements, Pareto status, and violations as a CSV string."""
        exp = self.get_multi_objective_experiment(experiment_id)
        rows: List[Dict[str, Any]] = []

        for c in exp.candidates:
            m = c.measurement
            violations_str = "; ".join(f"{v.constraint_name} ({v.actual_value} > {v.threshold})" for v in c.constraint_violations)
            dom_by_str = "; ".join(c.dominated_by)
            dom_str = "; ".join(c.dominates)

            row = {
                "experiment_id": exp.experiment_id,
                "dataset_name": exp.dataset_name,
                "candidate_id": m.candidate_id,
                "model_name": m.model_name,
                "status": m.status,
                "is_feasible": c.is_feasible,
                "is_pareto_optimal": c.is_pareto_optimal,
                "validation_score": m.validation_score,
                "cv_std": m.cv_std,
                "predictive_metric": m.predictive_metric,
                "predictive_direction": m.predictive_direction,
                "training_duration_seconds": m.training_duration_seconds,
                "inference_latency_ms_per_sample": m.inference_latency_ms_per_sample,
                "inference_throughput_samples_per_sec": m.inference_throughput_samples_per_sec,
                "model_artifact_size_bytes": m.model_artifact_size_bytes,
                "peak_memory_bytes": m.peak_memory_bytes if m.peak_memory_bytes is not None else "",
                "complexity_score": m.complexity.summary_complexity_score,
                "complexity_unit": m.complexity.complexity_unit,
                "distance_to_utopia": c.distance_to_utopia if c.distance_to_utopia is not None else "",
                "test_score": m.test_score if m.test_score is not None else "",
                "constraint_violations": violations_str,
                "dominated_by": dom_by_str,
                "dominates": dom_str,
                "status_explanation": c.status_explanation,
            }
            rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False)


def get_multi_objective_service() -> MultiObjectiveService:
    """Dependency provider for MultiObjectiveService."""
    return MultiObjectiveService()
