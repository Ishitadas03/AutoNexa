from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, status
import pandas as pd

from app.core.config import Settings, get_settings
from app.schemas.benchmark import (
    BenchmarkCompareRequest,
    BenchmarkComparisonResponse,
    ComparabilityWarning,
    ModelBenchmarkEntry,
)
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.prediction_service import PredictionService

logger = logging.getLogger(__name__)


class BenchmarkService:
    """Orchestrates reproducible benchmarking, comparability auditing, and leaderboard synthesis."""

    def __init__(self, experiments_dir: Optional[Path] = None) -> None:
        self.settings: Settings = get_settings()
        self.prediction_service = PredictionService(experiments_dir=experiments_dir)
        self.max_experiments = self.settings.max_benchmark_experiments

    def compare_experiments(
        self,
        request: BenchmarkCompareRequest,
    ) -> BenchmarkComparisonResponse:
        """Benchmark and compare a set of completed AutoML experiments."""
        experiment_ids = list(dict.fromkeys(request.experiment_ids))  # preserve order, deduplicate
        count = len(experiment_ids)

        if count < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 distinct experiment identifiers are required for comparative benchmarking.",
            )
        if count > self.max_experiments:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Requested comparison ({count} experiments) exceeds maximum allowed limit of {self.max_experiments}.",
            )

        # 1. Load and validate experiment metadata
        metadata_map: Dict[str, Dict[str, Any]] = {}
        for exp_id in experiment_ids:
            meta = self.prediction_service.load_metadata(exp_id)
            if meta.get("status") != "completed":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Experiment '{exp_id}' did not complete successfully and cannot be benchmarked.",
                )
            metadata_map[exp_id] = meta

        # 2. Check task type compatibility
        task_types = {meta.get("task_type") for meta in metadata_map.values()}
        if len(task_types) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Incompatible task types detected across experiments: {sorted(list(task_types))}. All compared experiments must share the same task.",
            )
        common_task = list(task_types)[0] or "unknown"

        # 3. Scientific Comparability Audit
        warnings: List[ComparabilityWarning] = []

        # Check dataset fingerprints
        fingerprints = {meta.get("dataset_fingerprint") for meta in metadata_map.values()}
        if len(fingerprints) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="dataset_fingerprint",
                    severity="critical",
                    message=(
                        f"Detected {len(fingerprints)} different dataset fingerprints. "
                        "Models were evaluated on different dataset revisions or contents; direct numerical comparison is invalid."
                    ),
                )
            )

        # Check target columns
        targets = {meta.get("target_column") for meta in metadata_map.values()}
        if len(targets) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="target_column",
                    severity="critical",
                    message=f"Experiments modeled differing target columns: {sorted(list(targets))}.",
                )
            )

        # Check evaluation strategy
        strategies = {meta.get("evaluation_strategy") for meta in metadata_map.values()}
        if len(strategies) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="evaluation_strategy",
                    severity="warning",
                    message=(
                        "Evaluation protocols differ (holdout vs cross-validation). "
                        "Cross-validation metrics reflect out-of-fold generalization averages, whereas holdout reflects single-split evaluation."
                    ),
                )
            )

        # Check test sizes
        test_sizes = {meta.get("test_size") for meta in metadata_map.values()}
        if len(test_sizes) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="split_sizes",
                    severity="warning",
                    message=f"Evaluation test split ratios differ across experiments: {sorted(list(test_sizes))}.",
                )
            )

        # Check random seeds
        seeds = {meta.get("random_state") for meta in metadata_map.values()}
        if len(seeds) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="random_state",
                    severity="info",
                    message=(
                        f"Random seeds differ: {sorted(list(seeds))}. "
                        "Observed metric differences may partially reflect variance from differing data partitions."
                    ),
                )
            )

        # Check feature sets
        feature_sets = [tuple(sorted(meta.get("feature_names", []))) for meta in metadata_map.values()]
        if len(set(feature_sets)) > 1:
            warnings.append(
                ComparabilityWarning(
                    dimension="features",
                    severity="info",
                    message="Evaluated experiments used differing subsets of input features.",
                )
            )

        # Determine verdict
        has_critical = any(w.severity == "critical" for w in warnings)
        has_warning = any(w.severity == "warning" for w in warnings)

        if has_critical:
            comparability_verdict = "non_comparable"
            is_strictly_comparable = False
        elif has_warning:
            comparability_verdict = "conditionally_comparable"
            is_strictly_comparable = False
        else:
            comparability_verdict = "strictly_comparable"
            is_strictly_comparable = True

        # 4. Resolve sorting metric and direction
        first_meta = metadata_map[experiment_ids[0]]
        if request.sort_metric:
            sort_metric = request.sort_metric.lower().strip()
            greater_is_better = ModelEvaluator.is_greater_better(sort_metric)
        else:
            sort_metric = first_meta.get("primary_metric", "f1_weighted").lower().strip()
            greater_is_better = first_meta.get(
                "primary_metric_greater_is_better",
                ModelEvaluator.is_greater_better(sort_metric),
            )

        # 5. Resolve baseline experiment
        baseline_id = request.baseline_experiment_id
        if baseline_id and baseline_id not in metadata_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Specified baseline experiment '{baseline_id}' is not in the list of compared experiment IDs.",
            )

        baseline_score = None
        if baseline_id:
            b_meta = metadata_map[baseline_id]
            test_m = b_meta.get("test_metrics") or {}
            baseline_score = test_m.get(sort_metric, b_meta.get("best_score"))

        # 6. Extract raw candidate entries
        raw_entries = []
        for exp_id in experiment_ids:
            meta = metadata_map[exp_id]
            test_m = meta.get("test_metrics") or {}
            b_score = test_m.get(sort_metric, meta.get("best_score"))
            primary_score = float(b_score) if b_score is not None else None

            # Calculate deltas relative to baseline if available
            delta_val = None
            delta_pct = None
            if baseline_score is not None and primary_score is not None:
                delta_val = round(primary_score - float(baseline_score), 4)
                if abs(float(baseline_score)) > 1e-7:
                    delta_pct = round((delta_val / abs(float(baseline_score))) * 100.0, 2)

            all_metrics = dict(test_m)
            if meta.get("best_score") is not None:
                all_metrics["validation_best_score"] = meta.get("best_score")

            entry = ModelBenchmarkEntry(
                rank=1,  # will be assigned after sorting
                experiment_id=exp_id,
                model_id=meta.get("best_model", "unknown"),
                model_name=meta.get("best_model_name", meta.get("best_model", "unknown")),
                task_type=meta.get("task_type", common_task),
                target_column=meta.get("target_column", "unknown"),
                dataset_id=meta.get("dataset_id", "unknown"),
                dataset_fingerprint=meta.get("dataset_fingerprint", "unknown"),
                evaluation_strategy=meta.get("evaluation_strategy", "holdout"),
                random_state=meta.get("random_state"),
                test_size=meta.get("test_size"),
                train_rows=meta.get("train_rows"),
                test_rows=meta.get("test_rows"),
                features_count=meta.get("features_count", len(meta.get("feature_names", []))),
                primary_metric_name=sort_metric,
                primary_metric_score=primary_score,
                metrics=all_metrics,
                training_duration_seconds=meta.get("total_duration_seconds"),
                is_baseline=(exp_id == baseline_id),
                delta_primary_metric=delta_val,
                delta_percentage=delta_pct,
                package_versions=meta.get("package_versions"),
                mlflow_run_id=meta.get("mlflow_run_id"),
            )
            raw_entries.append(entry)

        # 7. Sort leaderboard based on primary metric score
        def sort_key(entry: ModelBenchmarkEntry) -> float:
            if entry.primary_metric_score is None:
                return -float("inf") if greater_is_better else float("inf")
            return entry.primary_metric_score

        sorted_entries = sorted(raw_entries, key=sort_key, reverse=greater_is_better)

        # Assign 1-based ranks
        for rank_idx, entry in enumerate(sorted_entries, start=1):
            entry.rank = rank_idx

        # 8. Assemble reproducibility manifest
        reproducibility_manifest = {
            "benchmark_timestamp": pd.Timestamp.now(tz="UTC").isoformat(),
            "target_column": first_meta.get("target_column"),
            "task_type": common_task,
            "sort_metric": sort_metric,
            "greater_is_better": greater_is_better,
            "dataset_fingerprints": sorted(list(fingerprints)),
            "random_seeds": sorted(list(seeds)),
            "evaluation_strategies": sorted(list(strategies)),
            "package_versions": first_meta.get("package_versions", {}),
        }

        return BenchmarkComparisonResponse(
            benchmark_id=str(uuid.uuid4()),
            task_type=common_task,
            sort_metric=sort_metric,
            sort_metric_greater_is_better=greater_is_better,
            is_strictly_comparable=is_strictly_comparable,
            comparability_verdict=comparability_verdict,
            comparability_warnings=warnings,
            baseline_experiment_id=baseline_id,
            models_compared_count=count,
            leaderboard=sorted_entries,
            reproducibility_manifest=reproducibility_manifest,
        )


def get_benchmark_service() -> BenchmarkService:
    """Dependency injection provider for BenchmarkService."""
    return BenchmarkService()
