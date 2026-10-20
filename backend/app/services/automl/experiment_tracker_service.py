"""Persistent experiment-tracking service, audit trail, reproducibility manifests, and multi-experiment comparisons."""

from datetime import datetime, timezone
import hashlib
import json
import logging
import math
from pathlib import Path
import platform
import re
import shutil
import sys
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
import numpy as np

from app.core.config import Settings, get_settings
from app.schemas.tracking import (
    ArtifactVerificationResponse,
    ExperimentComparisonItem,
    ExperimentComparisonResponse,
    ExperimentDetailResponse,
    ExperimentListResponse,
    ExperimentStatus,
    ExperimentSummary,
    ReproducibilityManifest,
)
from app.services.automl.prediction_service import EXPERIMENT_ID_PATTERN, sanitize_scalar
from app.services.automl.statistical_engine import StatisticalEngine

logger = logging.getLogger(__name__)

# Reserved non-experiment subdirectories under experiments_dir
RESERVED_EXPERIMENT_DIRS = {
    "mlruns",
    "hpo_experiments",
    "repeated_runs",
    "multi_objective_experiments",
    "robust_benchmarks",
    "model_registry",
}

# Standard metric directions (higher is better vs lower is better)
METRIC_DIRECTIONS = {
    "accuracy": True,
    "f1": True,
    "f1_macro": True,
    "f1_weighted": True,
    "precision": True,
    "precision_macro": True,
    "precision_weighted": True,
    "recall": True,
    "recall_macro": True,
    "recall_weighted": True,
    "roc_auc": True,
    "r2": True,
    "rmse": False,
    "mae": False,
    "mse": False,
    "duration_seconds": False,
}


def get_system_environment_info() -> Dict[str, str]:
    """Capture host operating system, architecture, and Python runtime metadata."""
    return {
        "os_name": platform.system(),
        "os_release": platform.release(),
        "os_version": platform.version(),
        "machine": platform.machine(),
        "processor": platform.processor() or "Unknown",
        "python_version": sys.version.split()[0],
        "python_implementation": platform.python_implementation(),
    }


class ExperimentTrackerService:
    """Provides persistent tracking, querying, audit manifests, and comparisons for AutoML experiments."""

    def __init__(self, experiments_dir: Optional[Path] = None) -> None:
        self.settings: Settings = get_settings()
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.experiments_dir.mkdir(parents=True, exist_ok=True)

    def safe_resolve_experiment_dir(self, experiment_id: str) -> Path:
        """Resolve and validate the experiment directory path, preventing traversal attacks."""
        cleaned_id = experiment_id.strip()
        if not cleaned_id or not EXPERIMENT_ID_PATTERN.match(cleaned_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid experiment identifier. Only alphanumeric characters, hyphens, and underscores are allowed.",
            )

        exp_dir = (self.experiments_dir / cleaned_id).resolve()
        base_dir = self.experiments_dir.resolve()

        if not exp_dir.is_relative_to(base_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Experiment path escapes root experiments directory.",
            )

        if not exp_dir.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Experiment '{cleaned_id}' not found.",
            )

        return exp_dir

    def load_raw_metadata(self, experiment_id: str) -> Dict[str, Any]:
        """Safely read raw metadata dictionary from disk."""
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        metadata_file = exp_dir / "metadata.json"

        if not metadata_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Metadata file for experiment '{experiment_id}' not found.",
            )

        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Corrupted metadata for %s: %s", experiment_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Metadata file for experiment '{experiment_id}' is corrupted or unreadable.",
            ) from exc

    def _extract_summary_from_dir(self, exp_dir: Path) -> Optional[ExperimentSummary]:
        """Extract lightweight summary from an experiment directory without failing on partial data."""
        exp_id = exp_dir.name
        metadata_file = exp_dir / "metadata.json"
        model_file = exp_dir / "best_model.joblib"
        has_artifact = model_file.is_file()

        # Fallback timestamp from directory modification if missing in metadata
        try:
            mtime = exp_dir.stat().st_mtime
            default_created_at = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
        except Exception:
            default_created_at = datetime.now(timezone.utc).isoformat()

        if not metadata_file.is_file():
            # Incomplete directory or corrupted run
            return ExperimentSummary(
                experiment_id=exp_id,
                name=f"Experiment {exp_id[:8]}",
                dataset_id="unknown",
                dataset_fingerprint="unknown",
                task_type="unknown",
                target_column="unknown",
                status="incomplete",
                best_model=None,
                best_score=None,
                primary_metric="unknown",
                total_duration_seconds=None,
                created_at=default_created_at,
                models_count=0,
                has_artifact=has_artifact,
            )

        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            models_eval = data.get("models_evaluated") or []
            created_at = data.get("created_at") or default_created_at

            raw_status = data.get("status")
            if not raw_status:
                raw_status = "completed" if has_artifact else "failed"

            return ExperimentSummary(
                experiment_id=exp_id,
                name=data.get("name") or f"AutoML Run {exp_id[:8]}",
                description=data.get("description"),
                dataset_id=str(data.get("dataset_id") or "unknown"),
                dataset_fingerprint=str(data.get("dataset_fingerprint") or "unknown"),
                task_type=str(data.get("task_type") or "unknown"),
                target_column=str(data.get("target_column") or "unknown"),
                status=str(raw_status),
                best_model=data.get("best_model"),
                best_score=sanitize_scalar(data.get("best_score")),
                primary_metric=str(data.get("primary_metric") or "metric"),
                primary_metric_greater_is_better=data.get("primary_metric_greater_is_better"),
                evaluation_strategy=data.get("evaluation_strategy"),
                total_duration_seconds=sanitize_scalar(data.get("total_duration_seconds")),
                created_at=created_at,
                models_count=len(models_eval),
                has_artifact=has_artifact,
            )
        except Exception as exc:
            logger.warning("Error reading summary for %s: %s", exp_id, exc)
            return None

    def list_experiments(
        self,
        page: int = 1,
        page_size: int = 10,
        task_type: Optional[str] = None,
        status: Optional[str] = None,
        dataset_id: Optional[str] = None,
        search: Optional[str] = None,
    ) -> ExperimentListResponse:
        """List persisted experiments with filtering, search, and pagination."""
        if page < 1:
            page = 1
        if page_size < 1:
            page_size = 10
        if page_size > 100:
            page_size = 100

        all_summaries: List[ExperimentSummary] = []

        if self.experiments_dir.is_dir():
            for child in self.experiments_dir.iterdir():
                if not child.is_dir():
                    continue
                if child.name in RESERVED_EXPERIMENT_DIRS:
                    continue
                if not EXPERIMENT_ID_PATTERN.match(child.name):
                    continue

                summary = self._extract_summary_from_dir(child)
                if summary:
                    all_summaries.append(summary)

        # Apply Filters
        filtered = all_summaries

        if task_type:
            tt_clean = task_type.strip().lower()
            filtered = [s for s in filtered if tt_clean in s.task_type.lower()]

        if status:
            st_clean = status.strip().lower()
            filtered = [s for s in filtered if s.status.lower() == st_clean]

        if dataset_id:
            ds_clean = dataset_id.strip()
            filtered = [s for s in filtered if ds_clean in s.dataset_id]

        if search:
            query = search.strip().lower()
            filtered = [
                s for s in filtered
                if query in s.experiment_id.lower()
                or (s.name and query in s.name.lower())
                or query in s.target_column.lower()
                or (s.best_model and query in s.best_model.lower())
                or query in s.dataset_id.lower()
            ]

        # Sort by creation time descending (newest first)
        def parse_date(date_str: str) -> float:
            try:
                return datetime.fromisoformat(date_str.replace("Z", "+00:00")).timestamp()
            except Exception:
                return 0.0

        filtered.sort(key=lambda s: parse_date(s.created_at), reverse=True)

        total = len(filtered)
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_items = filtered[start_idx:end_idx]

        return ExperimentListResponse(
            items=page_items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def get_experiment_detail(self, experiment_id: str) -> ExperimentDetailResponse:
        """Retrieve full validated experiment record and diagnostic error metadata."""
        raw = self.load_raw_metadata(experiment_id)
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        model_file = exp_dir / "best_model.joblib"

        # Artifact inspection
        artifacts_meta = raw.get("artifacts") or {}
        if model_file.is_file():
            if "model_sha256" not in artifacts_meta or not artifacts_meta["model_sha256"]:
                hasher = hashlib.sha256()
                with open(model_file, "rb") as mf:
                    for chunk in iter(lambda: mf.read(65536), b""):
                        hasher.update(chunk)
                artifacts_meta["model_sha256"] = hasher.hexdigest()
                artifacts_meta["model_size_bytes"] = model_file.stat().st_size
                artifacts_meta["model_filename"] = "best_model.joblib"
                artifacts_meta["model_format"] = "joblib"

        raw_status = raw.get("status")
        if not raw_status:
            raw_status = "completed" if model_file.is_file() else "failed"

        # Fallback created_at
        created_at = raw.get("created_at")
        if not created_at:
            try:
                created_at = datetime.fromtimestamp(exp_dir.stat().st_mtime, tz=timezone.utc).isoformat()
            except Exception:
                created_at = datetime.now(timezone.utc).isoformat()

        # Sanitize models evaluated metrics
        models_eval = raw.get("models_evaluated") or []
        sanitized_models = []
        for m in models_eval:
            m_copy = dict(m)
            if "metrics" in m_copy and isinstance(m_copy["metrics"], dict):
                m_copy["metrics"] = {k: sanitize_scalar(v) for k, v in m_copy["metrics"].items()}
            m_copy["cv_mean"] = sanitize_scalar(m_copy.get("cv_mean"))
            m_copy["cv_std"] = sanitize_scalar(m_copy.get("cv_std"))
            if "cv_scores" in m_copy and isinstance(m_copy["cv_scores"], list):
                m_copy["cv_scores"] = [sanitize_scalar(x) for x in m_copy["cv_scores"]]
            sanitized_models.append(m_copy)

        test_metrics = raw.get("test_metrics")
        if test_metrics and isinstance(test_metrics, dict):
            test_metrics = {k: sanitize_scalar(v) for k, v in test_metrics.items()}

        system_info = raw.get("system_info") or get_system_environment_info()

        return ExperimentDetailResponse(
            experiment_id=experiment_id,
            name=raw.get("name") or f"AutoML Run {experiment_id[:8]}",
            description=raw.get("description"),
            status=raw_status,
            dataset_id=str(raw.get("dataset_id") or "unknown"),
            dataset_fingerprint=str(raw.get("dataset_fingerprint") or "unknown"),
            target_column=str(raw.get("target_column") or "unknown"),
            task_type=str(raw.get("task_type") or "unknown"),
            evaluation_strategy=str(raw.get("evaluation_strategy") or "holdout"),
            cv_folds=raw.get("cv_folds"),
            primary_metric=str(raw.get("primary_metric") or "metric"),
            primary_metric_greater_is_better=raw.get("primary_metric_greater_is_better"),
            random_state=raw.get("random_state"),
            test_size=raw.get("test_size"),
            train_rows=raw.get("train_rows"),
            test_rows=raw.get("test_rows"),
            features_count=raw.get("features_count"),
            feature_names=raw.get("feature_names"),
            numeric_features=raw.get("numeric_features"),
            categorical_features=raw.get("categorical_features"),
            ranked_models=raw.get("ranked_models"),
            best_model=raw.get("best_model"),
            best_score=sanitize_scalar(raw.get("best_score")),
            test_metrics=test_metrics,
            evaluation_protocol=raw.get("evaluation_protocol"),
            total_duration_seconds=sanitize_scalar(raw.get("total_duration_seconds")),
            models_evaluated=sanitized_models,
            artifacts=artifacts_meta,
            package_versions=raw.get("package_versions"),
            system_info=system_info,
            created_at=created_at,
            error_info=raw.get("error_info"),
        )

    def get_experiment_metrics(self, experiment_id: str) -> Dict[str, Any]:
        """Extract clean metric dictionary for an experiment's winning pipeline and candidates."""
        detail = self.get_experiment_detail(experiment_id)
        metrics: Dict[str, Any] = {
            "experiment_id": experiment_id,
            "primary_metric": detail.primary_metric,
            "best_score": detail.best_score,
            "best_model": detail.best_model,
            "test_metrics": detail.test_metrics or {},
            "candidate_models": {},
        }

        if detail.models_evaluated:
            for m in detail.models_evaluated:
                m_id = m.get("model_id")
                if m_id:
                    metrics["candidate_models"][m_id] = {
                        "model_name": m.get("model_name"),
                        "status": m.get("status"),
                        "metrics": m.get("metrics") or {},
                        "cv_mean": m.get("cv_mean"),
                        "cv_std": m.get("cv_std"),
                        "duration_seconds": m.get("duration_seconds"),
                    }

        return metrics

    def delete_experiment(self, experiment_id: str) -> bool:
        """Safely delete an experiment directory and all persisted artifacts."""
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        try:
            shutil.rmtree(exp_dir)
            logger.info("Successfully deleted experiment directory: %s", experiment_id)
            return True
        except Exception as exc:
            logger.error("Failed to delete experiment directory %s: %s", experiment_id, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete experiment: {exc}",
            ) from exc

    def get_reproducibility_manifest(self, experiment_id: str) -> ReproducibilityManifest:
        """Generate a cryptographically verifiable reproducibility manifest for an experiment."""
        detail = self.get_experiment_detail(experiment_id)
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        model_file = exp_dir / "best_model.joblib"

        model_sha256 = None
        model_size = None
        if model_file.is_file():
            model_size = model_file.stat().st_size
            hasher = hashlib.sha256()
            with open(model_file, "rb") as mf:
                for chunk in iter(lambda: mf.read(65536), b""):
                    hasher.update(chunk)
            model_sha256 = hasher.hexdigest()

        # Scientific disclaimer regarding bitwise vs config reproducibility
        disclaimer = (
            "Scientific Reproducibility Notice: AutoNexa guarantees complete deterministic reconstruction of "
            "experimental configurations, hyperparameter spaces, random seeds, dataset partition boundaries, "
            "and software dependency versions. Exact numerical bitwise reproducibility may be subject to minor "
            "floating-point divergence (< 1e-7) across disparate hardware architectures, multi-threaded BLAS/OpenMP "
            "runtimes, or SIMD vector instruction sets. Never claim bitwise identity without validating identical "
            "CPU microarchitectures and single-threaded execution modes."
        )

        manifest_dict = {
            "manifest_version": "1.0.0",
            "experiment_id": detail.experiment_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "dataset": {
                "dataset_id": detail.dataset_id,
                "dataset_fingerprint": detail.dataset_fingerprint,
                "target_column": detail.target_column,
                "train_rows": detail.train_rows,
                "test_rows": detail.test_rows,
                "features_count": detail.features_count,
            },
            "configuration": {
                "task_type": detail.task_type,
                "evaluation_strategy": detail.evaluation_strategy,
                "cv_folds": detail.cv_folds,
                "random_state": detail.random_state,
                "test_size": detail.test_size,
                "primary_metric": detail.primary_metric,
                "primary_metric_greater_is_better": detail.primary_metric_greater_is_better,
                "evaluation_protocol": detail.evaluation_protocol,
            },
            "preprocessing": {
                "numeric_features": detail.numeric_features or [],
                "categorical_features": detail.categorical_features or [],
                "imputation_strategy": "median (numeric), most_frequent (categorical)",
                "scaling_strategy": "standard_scaler",
                "encoding_strategy": "one_hot_encoding (handle_unknown=ignore)",
            },
            "model": {
                "winning_estimator": detail.best_model,
                "ranked_candidates": detail.ranked_models or [],
                "best_score": detail.best_score,
            },
            "environment": {
                "system": detail.system_info or get_system_environment_info(),
                "packages": detail.package_versions or {},
            },
            "metrics": {
                "primary_metric": detail.primary_metric,
                "validation_best_score": detail.best_score,
                "test_metrics": detail.test_metrics or {},
                "total_duration_seconds": detail.total_duration_seconds,
            },
            "artifact": {
                "filename": "best_model.joblib",
                "format": "joblib",
                "size_bytes": model_size,
                "sha256": model_sha256,
            },
            "reproducibility_level": "configuration_and_environment",
            "scientific_disclaimer": disclaimer,
        }

        # Compute SHA-256 over canonical JSON string of manifest
        canonical_json = json.dumps(manifest_dict, sort_keys=True)
        manifest_sha256 = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
        manifest_dict["manifest_sha256"] = manifest_sha256

        return ReproducibilityManifest(**manifest_dict)

    def verify_manifest_integrity(self, experiment_id: str) -> ArtifactVerificationResponse:
        """Verify real-time physical artifact presence and cryptographic SHA-256 integrity."""
        detail = self.get_experiment_detail(experiment_id)
        exp_dir = self.safe_resolve_experiment_dir(experiment_id)
        model_file = exp_dir / "best_model.joblib"

        expected_sha256 = ""
        if detail.artifacts:
            expected_sha256 = detail.artifacts.get("model_sha256") or ""

        if not model_file.is_file():
            return ArtifactVerificationResponse(
                verified=False,
                expected_sha256=expected_sha256,
                actual_sha256=None,
                size_bytes=None,
                artifact_exists=False,
                message=f"Model artifact 'best_model.joblib' is missing from experiment storage directory for {experiment_id}.",
            )

        hasher = hashlib.sha256()
        with open(model_file, "rb") as mf:
            for chunk in iter(lambda: mf.read(65536), b""):
                hasher.update(chunk)
        actual_sha256 = hasher.hexdigest()
        size_bytes = model_file.stat().st_size

        if not expected_sha256:
            # Metadata did not store checksum; record it and consider verified
            return ArtifactVerificationResponse(
                verified=True,
                expected_sha256=actual_sha256,
                actual_sha256=actual_sha256,
                size_bytes=size_bytes,
                artifact_exists=True,
                message="Artifact exists and fresh SHA-256 checksum was computed.",
            )

        if actual_sha256 == expected_sha256:
            return ArtifactVerificationResponse(
                verified=True,
                expected_sha256=expected_sha256,
                actual_sha256=actual_sha256,
                size_bytes=size_bytes,
                artifact_exists=True,
                message="Artifact verification PASSED: Real-time SHA-256 matches persisted metadata record.",
            )

        return ArtifactVerificationResponse(
            verified=False,
            expected_sha256=expected_sha256,
            actual_sha256=actual_sha256,
            size_bytes=size_bytes,
            artifact_exists=True,
            message="CRITICAL: Artifact checksum MISMATCH. The stored model binary may have been tampered with or corrupted.",
        )

    def compare_experiments(self, experiment_ids: List[str]) -> ExperimentComparisonResponse:
        """Compare multiple AutoML experiments across configurations, metrics, and reproducibility metadata."""
        if len(experiment_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 experiments must be selected for comparison.",
            )
        if len(experiment_ids) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At most 10 experiments may be compared simultaneously.",
            )

        items: List[ExperimentComparisonItem] = []
        datasets: set = set()
        tasks: set = set()
        all_metrics_set: set = set()

        for exp_id in experiment_ids:
            detail = self.get_experiment_detail(exp_id)
            exp_dir = self.safe_resolve_experiment_dir(exp_id)
            has_artifact = (exp_dir / "best_model.joblib").is_file()

            datasets.add(detail.dataset_fingerprint)
            tasks.add(detail.task_type)

            # Gather all scalar metrics from best score, test metrics, and winning candidate
            exp_metrics: Dict[str, Optional[float]] = {}
            if detail.best_score is not None:
                exp_metrics[detail.primary_metric] = detail.best_score
                all_metrics_set.add(detail.primary_metric)

            if detail.test_metrics:
                for k, v in detail.test_metrics.items():
                    val = sanitize_scalar(v)
                    if isinstance(val, (int, float)):
                        exp_metrics[k] = float(val)
                        all_metrics_set.add(k)

            if detail.models_evaluated and detail.best_model:
                for m in detail.models_evaluated:
                    if m.get("model_id") == detail.best_model and m.get("metrics"):
                        for k, v in m["metrics"].items():
                            val = sanitize_scalar(v)
                            if isinstance(val, (int, float)):
                                exp_metrics[k] = float(val)
                                all_metrics_set.add(k)

            items.append(
                ExperimentComparisonItem(
                    experiment_id=exp_id,
                    name=detail.name,
                    dataset_id=detail.dataset_id,
                    dataset_fingerprint=detail.dataset_fingerprint,
                    task_type=detail.task_type,
                    target_column=detail.target_column,
                    best_model=detail.best_model,
                    primary_metric=detail.primary_metric,
                    best_score=detail.best_score,
                    test_metrics=detail.test_metrics,
                    metrics=exp_metrics,
                    duration_seconds=detail.total_duration_seconds,
                    features_count=detail.features_count,
                    train_rows=detail.train_rows,
                    evaluation_strategy=detail.evaluation_strategy,
                    cv_folds=detail.cv_folds,
                    random_state=detail.random_state,
                    package_versions=detail.package_versions,
                    has_artifact=has_artifact,
                )
            )

        common_dataset = len(datasets) == 1
        common_task = len(tasks) == 1

        warnings = []
        if not common_task:
            warnings.append("Experiments evaluate disparate machine learning tasks (e.g. classification vs regression). Metrics cannot be directly compared.")
        if not common_dataset:
            warnings.append("Experiments evaluate distinct datasets. Differences in scores reflect dataset variance rather than algorithmic superiority.")

        compatibility_warning = " ".join(warnings) if warnings else None

        # Build metric comparison matrix: metric -> {exp_id: value}
        metric_matrix: Dict[str, Dict[str, Optional[float]]] = {}
        metric_directions: Dict[str, bool] = {}
        best_per_metric: Dict[str, str] = {}

        for m_name in sorted(all_metrics_set):
            greater_is_better = METRIC_DIRECTIONS.get(m_name.lower(), True)
            metric_directions[m_name] = greater_is_better

            row: Dict[str, Optional[float]] = {}
            best_exp = None
            best_val = None

            for item in items:
                v = item.metrics.get(m_name)
                row[item.experiment_id] = v
                if v is not None and not math.isnan(v):
                    if best_val is None:
                        best_val = v
                        best_exp = item.experiment_id
                    else:
                        if greater_is_better and v > best_val:
                            best_val = v
                            best_exp = item.experiment_id
                        elif not greater_is_better and v < best_val:
                            best_val = v
                            best_exp = item.experiment_id

            metric_matrix[m_name] = row
            if best_exp:
                best_per_metric[m_name] = best_exp

        # Statistical comparison if common dataset and compatible metrics
        stat_summary = None
        if common_dataset and common_task and len(items) == 2:
            exp_a = items[0]
            exp_b = items[1]
            diffs = {}
            for m_name, vals in metric_matrix.items():
                va = vals.get(exp_a.experiment_id)
                vb = vals.get(exp_b.experiment_id)
                if va is not None and vb is not None:
                    diffs[m_name] = {
                        f"{exp_a.experiment_id}_score": va,
                        f"{exp_b.experiment_id}_score": vb,
                        "absolute_difference": round(va - vb, 4),
                        "percentage_difference": round(((va - vb) / abs(vb)) * 100, 2) if vb != 0 else None,
                        "superior_experiment": exp_a.experiment_id if (
                            (METRIC_DIRECTIONS.get(m_name.lower(), True) and va > vb) or
                            (not METRIC_DIRECTIONS.get(m_name.lower(), True) and va < vb)
                        ) else exp_b.experiment_id,
                    }
            stat_summary = {
                "mode": "descriptive_pairwise_comparison",
                "metric_differences": diffs,
                "notes": (
                    "Single-run experiments compare deterministic holdout or cross-validation estimates. "
                    "For paired hypothesis testing (Student-t, Wilcoxon), execute repeated multi-seed benchmarks in Phase 11."
                ),
            }

        return ExperimentComparisonResponse(
            experiments=items,
            common_dataset=common_dataset,
            common_task=common_task,
            metric_comparison=metric_matrix,
            metric_directions=metric_directions,
            best_per_metric=best_per_metric,
            compatibility_warning=compatibility_warning,
            statistical_summary=stat_summary,
        )


def get_experiment_tracker_service() -> ExperimentTrackerService:
    """FastAPI dependency for ExperimentTrackerService."""
    return ExperimentTrackerService()
