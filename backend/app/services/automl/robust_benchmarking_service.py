"""Robust AutoML Benchmarking Service (Phase 11): Multi-seed matched evaluation, statistical reliability, and leakage-proof holdout testing."""

from datetime import datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import platform
import time
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
import psutil
import scipy
import sklearn
from sklearn.base import clone
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
from app.schemas.robust_benchmark import (
    DatasetCatalogEntry,
    MethodAggregateStatistics,
    PairedComparisonResult,
    RobustBenchmarkRequest,
    RobustBenchmarkResponse,
    SeedRunRecord,
)
from app.services.automl.dataset_catalog import (
    DatasetCatalogService,
    get_dataset_catalog_service,
)
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.preprocessor import build_preprocessor
from app.services.automl.resource_profiler import ResourceProfiler
from app.services.automl.statistical_engine import StatisticalEngine

logger = logging.getLogger(__name__)


class RobustBenchmarkingService:
    """Orchestrates multi-seed matched experimental evaluations and statistical reliability analysis."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
        dataset_catalog: Optional[DatasetCatalogService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.upload_dir: Path = (
            upload_dir if upload_dir is not None else self.settings.resolved_upload_dir
        )
        self.experiments_dir: Path = (
            experiments_dir
            if experiments_dir is not None
            else self.settings.resolved_experiments_dir
        )
        self.dataset_catalog = dataset_catalog or get_dataset_catalog_service()
        self.robust_benchmarks_dir = self.experiments_dir / "robust_benchmarks"
        self.robust_benchmarks_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_candidate_estimators(
        self,
        task_type: TaskType,
        candidate_keys: Optional[List[str]],
        random_state: int,
    ) -> List[Tuple[str, str, Any]]:
        """Return list of (strategy_id, human_name, uninitialized_or_seeded_estimator)."""
        candidates: List[Tuple[str, str, Any]] = []

        if task_type == TaskType.REGRESSION:
            all_specs = [
                (
                    "ridge",
                    "Ridge Regressor (L2 Regularized Linear)",
                    Ridge(alpha=1.0, random_state=random_state),
                ),
                (
                    "decision_tree",
                    "Decision Tree Regressor (Depth 6)",
                    DecisionTreeRegressor(max_depth=6, random_state=random_state),
                ),
                (
                    "random_forest",
                    "Random Forest Regressor (30 Trees)",
                    RandomForestRegressor(
                        n_estimators=30, max_depth=8, n_jobs=1, random_state=random_state
                    ),
                ),
                (
                    "hist_gradient_boosting",
                    "HistGradientBoosting Regressor (40 Iter)",
                    HistGradientBoostingRegressor(
                        max_iter=40, random_state=random_state
                    ),
                ),
            ]
        else:
            all_specs = [
                (
                    "logistic_regression",
                    "Logistic Regression",
                    LogisticRegression(
                        C=1.0, max_iter=1000, random_state=random_state
                    ),
                ),
                (
                    "decision_tree",
                    "Decision Tree Classifier (Depth 6)",
                    DecisionTreeClassifier(max_depth=6, random_state=random_state),
                ),
                (
                    "random_forest",
                    "Random Forest Classifier (30 Trees)",
                    RandomForestClassifier(
                        n_estimators=30, max_depth=8, n_jobs=1, random_state=random_state
                    ),
                ),
                (
                    "hist_gradient_boosting",
                    "HistGradientBoosting Classifier (40 Iter)",
                    HistGradientBoostingClassifier(
                        max_iter=40, random_state=random_state
                    ),
                ),
            ]

        if candidate_keys:
            requested = {k.lower().strip() for k in candidate_keys}
            filtered = [s for s in all_specs if s[0] in requested]
            if filtered:
                return filtered

        return all_specs

    def run_robust_benchmark(
        self,
        request: RobustBenchmarkRequest,
    ) -> RobustBenchmarkResponse:
        """Execute multi-seed matched experimental benchmark across configured seeds."""
        benchmark_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()

        # 1. Load dataset & catalog profile
        df, catalog_entry = self.dataset_catalog.load_dataset_dataframe(
            request.dataset_id
        )

        target_col = (request.target_column or catalog_entry.target_column).strip()
        if target_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Target column '{target_col}' not found in dataset '{request.dataset_id}'.",
            )

        valid_df = df.dropna(subset=[target_col])
        if len(valid_df) < 15:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset has insufficient non-null instances ({len(valid_df)}). Minimum 15 required.",
            )

        # 2. Resolve task type
        raw_task = request.task_type or catalog_entry.task_type
        if "regress" in raw_task.lower():
            task_type = TaskType.REGRESSION
        elif "multi" in raw_task.lower():
            task_type = TaskType.MULTICLASS_CLASSIFICATION
        else:
            task_type = TaskType.BINARY_CLASSIFICATION

        # 3. Resolve primary metric & direction
        if request.primary_metric:
            primary_metric = request.primary_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(primary_metric)
        else:
            primary_metric, greater_is_better = ModelEvaluator.get_default_metric(
                task_type
            )

        # 4. Resolve seeds: ensure distinct and >= 2
        seeds = list(dict.fromkeys(request.seeds))
        if len(seeds) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 distinct random seeds are required for robust benchmarking (recommended >= 5).",
            )

        # 5. Baseline strategy definition
        baseline_strat = (
            request.baseline_strategy.lower().strip()
            if request.baseline_strategy
            else ("ridge" if task_type == TaskType.REGRESSION else "logistic_regression")
        )

        # 6. Prepare feature definitions
        X_all = valid_df.drop(columns=[target_col])
        y_all = valid_df[target_col]

        stratify_all = None
        if task_type in (
            TaskType.BINARY_CLASSIFICATION,
            TaskType.MULTICLASS_CLASSIFICATION,
        ):
            class_counts = y_all.value_counts()
            if (class_counts >= 2).all():
                stratify_all = y_all

        # 7. Multi-Seed Matched Execution Loop
        raw_runs: List[SeedRunRecord] = []
        method_runs_map: Dict[str, List[SeedRunRecord]] = {}

        for seed in seeds:
            logger.info("Executing robust benchmark seed %d...", seed)
            # PARTITION ISOLATION: 80% Train/Val, 20% untouched holdout test partition
            X_train_val, X_test, y_train_val, y_test = train_test_split(
                X_all,
                y_all,
                test_size=request.test_size,
                random_state=seed,
                stratify=stratify_all,
            )

            numeric_features = [
                c for c in X_train_val.columns if pd.api.types.is_numeric_dtype(X_train_val[c])
            ]
            categorical_features = [
                c for c in X_train_val.columns if c not in numeric_features
            ]

            # Cross-validation folds for model tuning / validation score on X_train_val
            if task_type in (
                TaskType.BINARY_CLASSIFICATION,
                TaskType.MULTICLASS_CLASSIFICATION,
            ):
                cv_splitter = StratifiedKFold(
                    n_splits=request.cv_folds, shuffle=True, random_state=seed
                )
                cv_splits = list(cv_splitter.split(X_train_val, y_train_val))
            else:
                cv_splitter = KFold(
                    n_splits=request.cv_folds, shuffle=True, random_state=seed
                )
                cv_splits = list(cv_splitter.split(X_train_val, y_train_val))

            candidate_specs = self._resolve_candidate_estimators(
                task_type=task_type,
                candidate_keys=request.candidate_strategies,
                random_state=seed,
            )

            # Ensure baseline_strategy is included in candidate_specs
            spec_keys = [s[0] for s in candidate_specs]
            if baseline_strat not in spec_keys:
                # Add default baseline
                if task_type == TaskType.REGRESSION:
                    candidate_specs.insert(
                        0,
                        (
                            baseline_strat,
                            "Baseline Ridge",
                            Ridge(alpha=1.0, random_state=seed),
                        ),
                    )
                else:
                    candidate_specs.insert(
                        0,
                        (
                            baseline_strat,
                            "Baseline Logistic Regression",
                            LogisticRegression(
                                C=1.0, max_iter=1000, random_state=seed
                            ),
                        ),
                    )

            for strat_id, human_name, estimator in candidate_specs:
                run_id = f"{strat_id}-seed{seed}-{uuid.uuid4().hex[:6]}"
                try:
                    # A. Cross-validation: fit preprocessor strictly inside each fold (Zero Leakage)
                    fold_metrics: List[Dict[str, Any]] = []
                    for train_idx, val_idx in cv_splits:
                        X_f_tr = X_train_val.iloc[train_idx]
                        y_f_tr = y_train_val.iloc[train_idx]
                        X_f_val = X_train_val.iloc[val_idx]
                        y_f_val = y_train_val.iloc[val_idx]

                        fold_preprocessor = build_preprocessor(
                            numeric_features, categorical_features
                        )
                        fold_pipe = Pipeline([
                            ("preprocessor", fold_preprocessor),
                            ("model", clone(estimator)),
                        ])
                        fold_pipe.fit(X_f_tr, y_f_tr)

                        if task_type == TaskType.REGRESSION:
                            eval_dict = ModelEvaluator.evaluate_regression(
                                fold_pipe, X_f_val, y_f_val
                            )
                        else:
                            eval_dict = ModelEvaluator.evaluate_classification(
                                fold_pipe, X_f_val, y_f_val
                            )
                        fold_metrics.append(eval_dict)

                    # Extract aggregated CV primary metric score
                    _, cv_scores, cv_mean, _, _ = ModelEvaluator.aggregate_cv_results(
                        fold_metrics_list=fold_metrics,
                        primary_metric=primary_metric,
                    )
                    val_score = cv_mean if cv_mean is not None else float("nan")

                    # B. Full Pipeline Fit on Train_Val partition with Resource Profiling
                    full_preprocessor = build_preprocessor(
                        numeric_features, categorical_features
                    )
                    pipeline = Pipeline([
                        ("preprocessor", full_preprocessor),
                        ("model", clone(estimator)),
                    ])

                    duration_sec, peak_heap, peak_rss, rss_delta = (
                        ResourceProfiler.profile_training_execution(
                            lambda: pipeline.fit(X_train_val, y_train_val)
                        )
                    )

                    # C. Operational Profiling
                    lat_ms, tput_sec = ResourceProfiler.profile_inference_latency(
                        pipeline, X_train_val, n_passes=5, max_batch_size=100
                    )
                    artifact_size = ResourceProfiler.measure_artifact_size_bytes(
                        pipeline
                    )
                    complexity_meta = ResourceProfiler.extract_model_complexity(
                        pipeline.named_steps["model"]
                    )
                    complexity = complexity_meta.summary_complexity_score
                    comp_unit = complexity_meta.complexity_unit

                    # D. Untouched Holdout Test Partition Evaluation (Post-Selection)
                    if task_type == TaskType.REGRESSION:
                        test_eval = ModelEvaluator.evaluate_regression(
                            pipeline, X_test, y_test
                        )
                    else:
                        test_eval = ModelEvaluator.evaluate_classification(
                            pipeline, X_test, y_test
                        )
                    test_score = float(test_eval.get(primary_metric) or 0.0)

                    record = SeedRunRecord(
                        run_id=run_id,
                        seed=seed,
                        method_name=strat_id,
                        status="completed",
                        validation_score=round(val_score, 4),
                        holdout_test_score=round(test_score, 4),
                        training_duration_seconds=round(duration_sec, 4),
                        inference_latency_ms=round(lat_ms, 4),
                        inference_throughput_sec=round(tput_sec, 1),
                        model_artifact_size_bytes=artifact_size,
                        peak_heap_bytes=peak_heap,
                        peak_process_rss_bytes=peak_rss,
                        rss_delta_bytes=rss_delta,
                        complexity_score=round(complexity, 2),
                        complexity_unit=comp_unit,
                        error_message=None,
                    )
                except Exception as ex:
                    logger.warning(
                        "Method '%s' failed on seed %d: %s", strat_id, seed, ex
                    )
                    record = SeedRunRecord(
                        run_id=run_id,
                        seed=seed,
                        method_name=strat_id,
                        status="failed",
                        validation_score=None,
                        holdout_test_score=None,
                        training_duration_seconds=0.0,
                        inference_latency_ms=0.0,
                        inference_throughput_sec=0.0,
                        model_artifact_size_bytes=0,
                        peak_heap_bytes=None,
                        peak_process_rss_bytes=None,
                        rss_delta_bytes=None,
                        complexity_score=0.0,
                        complexity_unit="error",
                        error_message=str(ex),
                    )

                raw_runs.append(record)
                method_runs_map.setdefault(strat_id, []).append(record)

        # 8. Statistical Aggregations across Seeds per Method
        method_summaries: Dict[str, MethodAggregateStatistics] = {}
        for m_name, runs in method_runs_map.items():
            completed_runs = [r for r in runs if r.status == "completed"]
            n_req = len(runs)
            n_succ = len(completed_runs)
            n_fail = n_req - n_succ

            val_scores = [r.validation_score for r in completed_runs if r.validation_score is not None]
            test_scores = [r.holdout_test_score for r in completed_runs if r.holdout_test_score is not None]
            durations = [r.training_duration_seconds for r in completed_runs]
            latencies = [r.inference_latency_ms for r in completed_runs]
            sizes = [float(r.model_artifact_size_bytes) for r in completed_runs]
            heaps = [float(r.peak_heap_bytes) for r in completed_runs if r.peak_heap_bytes is not None]
            rss_peaks = [float(r.peak_process_rss_bytes) for r in completed_runs if r.peak_process_rss_bytes is not None]
            rss_deltas = [float(r.rss_delta_bytes) for r in completed_runs if r.rss_delta_bytes is not None]

            summary_val = StatisticalEngine.compute_summary(
                val_scores,
                f"validation_{primary_metric}",
                greater_is_better,
                bootstrap_resamples=request.bootstrap_resamples,
            )
            summary_test = (
                StatisticalEngine.compute_summary(
                    test_scores,
                    f"holdout_test_{primary_metric}",
                    greater_is_better,
                    bootstrap_resamples=request.bootstrap_resamples,
                )
                if test_scores
                else None
            )
            summary_dur = StatisticalEngine.compute_summary(
                durations,
                "training_duration_seconds",
                greater_is_better=False,
                bootstrap_resamples=request.bootstrap_resamples,
            )
            summary_lat = StatisticalEngine.compute_summary(
                latencies,
                "inference_latency_ms",
                greater_is_better=False,
                bootstrap_resamples=request.bootstrap_resamples,
            )
            summary_size = StatisticalEngine.compute_summary(
                sizes,
                "model_artifact_size_bytes",
                greater_is_better=False,
                bootstrap_resamples=request.bootstrap_resamples,
            )
            summary_heap = StatisticalEngine.compute_summary(
                heaps,
                "peak_heap_bytes",
                greater_is_better=False,
                bootstrap_resamples=request.bootstrap_resamples,
            )
            summary_rss = (
                StatisticalEngine.compute_summary(
                    rss_peaks,
                    "peak_process_rss_bytes",
                    greater_is_better=False,
                    bootstrap_resamples=request.bootstrap_resamples,
                )
                if rss_peaks
                else None
            )
            summary_rss_delta = (
                StatisticalEngine.compute_summary(
                    rss_deltas,
                    "rss_delta_bytes",
                    greater_is_better=False,
                    bootstrap_resamples=request.bootstrap_resamples,
                )
                if rss_deltas
                else None
            )

            method_summaries[m_name] = MethodAggregateStatistics(
                method_name=m_name,
                n_seeds_requested=n_req,
                n_seeds_successful=n_succ,
                n_seeds_failed=n_fail,
                validation_score=summary_val,
                holdout_test_score=summary_test,
                training_duration_seconds=summary_dur,
                inference_latency_ms=summary_lat,
                model_artifact_size_bytes=summary_size,
                peak_heap_bytes=summary_heap,
                peak_process_rss_bytes=summary_rss,
                rss_delta_bytes=summary_rss_delta,
            )

        # 9. Paired Comparisons against Baseline
        paired_comparisons: List[PairedComparisonResult] = []
        baseline_runs = method_runs_map.get(baseline_strat, [])
        baseline_by_seed = {r.seed: r for r in baseline_runs if r.status == "completed"}

        num_candidate_comparisons = max(1, len(method_runs_map) - 1)
        for m_name, runs in method_runs_map.items():
            if m_name == baseline_strat:
                continue

            cand_by_seed = {r.seed: r for r in runs if r.status == "completed"}
            matched_seeds = [
                s for s in seeds
                if s in cand_by_seed
                and s in baseline_by_seed
                and cand_by_seed[s].validation_score is not None
                and not (isinstance(cand_by_seed[s].validation_score, float) and math.isnan(cand_by_seed[s].validation_score))
                and baseline_by_seed[s].validation_score is not None
                and not (isinstance(baseline_by_seed[s].validation_score, float) and math.isnan(baseline_by_seed[s].validation_score))
            ]

            scores_a = [cand_by_seed[s].validation_score for s in matched_seeds]
            scores_b = [baseline_by_seed[s].validation_score for s in matched_seeds]

            comp = StatisticalEngine.compute_paired_comparison(
                scores_a=scores_a,
                scores_b=scores_b,
                seeds=matched_seeds,
                metric_name=primary_metric,
                method_a_name=m_name,
                method_b_name=baseline_strat,
                greater_is_better=greater_is_better,
                alpha=request.alpha,
                num_comparisons=num_candidate_comparisons,
            )
            paired_comparisons.append(comp)

        # 10. Platform Context & Scientific Methodology Notes
        mem_info = psutil.virtual_memory()
        platform_info = {
            "platform": platform.platform(),
            "python_version": platform.python_version(),
            "cpu_count": os.cpu_count() or 1,
            "system_total_ram_gb": round(mem_info.total / (1024**3), 2),
            "machine": platform.machine(),
            "package_versions": {
                "scikit-learn": sklearn.__version__,
                "numpy": np.__version__,
                "pandas": pd.__version__,
                "scipy": scipy.__version__,
                "joblib": joblib.__version__,
                "psutil": psutil.__version__,
            },
            "resource_profiler_metadata": {
                "rss_profiling_tool": "psutil (Process Resident Set Size)",
                "heap_profiling_tool": "tracemalloc (Python Memory Allocator)",
                "sampling_scope": "Current process and native C-extension memory (BLAS/OpenMP)",
                "memory_metric_distinction": (
                    "Peak Heap tracks Python runtime allocations via tracemalloc. "
                    "Process RSS captures actual physical memory mapped by OS page tables, "
                    "including shared libraries and compiled extensions. Neither represents total system RAM."
                ),
            },
        }

        scientific_guidance = (
            "METHODOLOGY GUIDANCE:\n"
            "1. Random Seed Independence: Folds within a single cross-validation split are correlated; "
            "standard errors and hypothesis tests are calculated strictly across independent seeds, not raw folds.\n"
            "2. Leakage Prevention: Preprocessing transformers are fit exclusively on training data within each fold "
            "and on the train_val partition. The holdout test set (20%) is untouched during model tuning and selection.\n"
            "3. Effect Size vs Significance: Cohen's dz quantifies standardized paired difference magnitude. "
            "Small samples (N < 5) trigger conservative warnings, and p-values are adjusted via Bonferroni correction.\n"
            "4. Statistical Equivalence: A lack of statistical significance does not prove identity; "
            "confidence intervals reflect real observational uncertainty."
        )

        csv_url = f"/api/v1/benchmarks/robust/{benchmark_id}/export-csv"

        response = RobustBenchmarkResponse(
            robust_benchmark_id=benchmark_id,
            created_at=created_at,
            dataset=catalog_entry,
            seeds_evaluated=seeds,
            primary_metric=primary_metric,
            greater_is_better=greater_is_better,
            baseline_strategy=baseline_strat,
            method_summaries=method_summaries,
            paired_comparisons=paired_comparisons,
            raw_seed_runs=raw_runs,
            execution_platform=platform_info,
            scientific_guidance=scientific_guidance,
            csv_export_url=csv_url,
        )

        # 11. Persist experiment report to disk
        out_file = self.robust_benchmarks_dir / f"{benchmark_id}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(response.model_dump_json(indent=2))

        return response

    def get_robust_benchmark(self, benchmark_id: str) -> Optional[RobustBenchmarkResponse]:
        """Load previously executed robust benchmark response from disk."""
        out_file = self.robust_benchmarks_dir / f"{benchmark_id}.json"
        if not out_file.exists():
            return None
        with open(out_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return RobustBenchmarkResponse.model_validate(data)

    def export_csv(self, benchmark_id: str) -> str:
        """Generate comma-separated tabular text for all raw seed runs in a benchmark."""
        report = self.get_robust_benchmark(benchmark_id)
        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Robust benchmark '{benchmark_id}' not found.",
            )

        rows: List[Dict[str, Any]] = []
        for r in report.raw_seed_runs:
            rows.append({
                "robust_benchmark_id": benchmark_id,
                "dataset_id": report.dataset.dataset_id,
                "dataset_fingerprint": report.dataset.dataset_fingerprint,
                "seed": r.seed,
                "method_name": r.method_name,
                "status": r.status,
                "validation_score": r.validation_score,
                "holdout_test_score": r.holdout_test_score,
                "training_duration_seconds": r.training_duration_seconds,
                "inference_latency_ms": r.inference_latency_ms,
                "inference_throughput_sec": r.inference_throughput_sec,
                "model_artifact_size_bytes": r.model_artifact_size_bytes,
                "peak_heap_bytes": r.peak_heap_bytes,
                "peak_process_rss_bytes": r.peak_process_rss_bytes,
                "rss_delta_bytes": r.rss_delta_bytes,
                "complexity_score": r.complexity_score,
                "complexity_unit": r.complexity_unit,
                "error_message": r.error_message or "",
            })

        df_export = pd.DataFrame(rows)
        return df_export.to_csv(index=False)


_robust_benchmark_service: Optional[RobustBenchmarkingService] = None


def get_robust_benchmark_service() -> RobustBenchmarkingService:
    """Return singleton instance of RobustBenchmarkingService."""
    global _robust_benchmark_service
    if _robust_benchmark_service is None:
        _robust_benchmark_service = RobustBenchmarkingService()
    return _robust_benchmark_service
