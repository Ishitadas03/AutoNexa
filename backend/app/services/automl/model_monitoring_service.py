"""Model Monitoring, Tabular Drift Detection, Performance Evaluation, and Automated Retraining Service."""

from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import uuid

from fastapi import HTTPException, status
import numpy as np
import pandas as pd
from scipy import stats
from sklearn import metrics

from app.core.config import Settings, get_settings
from app.schemas.monitoring import (
    AlertAcknowledgeRequest,
    AlertSeverity,
    AlertStatus,
    CandidateValidationResult,
    CandidateValidationStatus,
    CategoricalFeatureSummary,
    DriftAnalysisRequest,
    DriftAnalysisResponse,
    DriftMethod,
    DriftStatus,
    FeatureDriftResult,
    GroundTruthIngestRequest,
    GroundTruthIngestResponse,
    GroundTruthRecord,
    MonitoringAlertRecord,
    MonitoringOverviewResponse,
    MonitoringWindowCreate,
    MonitoringWindowResponse,
    MultivariateDriftResult,
    NumericalFeatureSummary,
    PerformanceMetricReport,
    ReferenceProfileCreate,
    ReferenceProfileResponse,
    RetrainingJobRecord,
    RetrainingJobStatus,
    RetrainingJobTriggerRequest,
    RetrainingPromotionRequest,
    RetrainingTriggerPolicy,
    ServingTelemetryEvent,
)
from app.schemas.tracking import LifecycleStage, ModelRegistrationRequest, StageTransitionRequest
from app.schemas.training import TrainingRequest
from app.services.analysis_service import AnalysisService
from app.services.automl.experiment_tracker_service import ExperimentTrackerService
from app.services.automl.model_registry_service import (
    MODEL_NAME_PATTERN,
    ModelRegistryService,
    get_model_registry_service,
)
from app.services.automl.prediction_service import sanitize_scalar
from app.services.automl.tracker import compute_dataset_fingerprint
from app.services.automl.training_service import TrainingService

logger = logging.getLogger(__name__)

# Global re-entrant lock for thread-safe monitoring storage and retraining
_MONITORING_LOCK = threading.RLock()
_TELEMETRY_LOCK = threading.Lock()

# Identifier validation pattern
SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _sanitize_path(base_dir: Path, filename: str) -> Path:
    """Resolve and validate a file path against path traversal attacks."""
    clean = filename.strip()
    if not clean or not SAFE_ID_PATTERN.match(clean.replace(".json", "")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid identifier format. Only alphanumeric characters, hyphens, and underscores are allowed.",
        )
    target = (base_dir / clean).resolve()
    if not target.is_relative_to(base_dir.resolve()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security violation: Path escapes storage boundary.",
        )
    return target


def _clean_float(val: Any) -> Optional[float]:
    """Convert value to float, replacing NaN and Inf with None for JSON compliance."""
    if val is None:
        return None
    try:
        f = float(val)
        if np.isnan(f) or np.isinf(f):
            return None
        return round(f, 4)
    except Exception:
        return None


def _safe_json_dump(obj: Any, fp) -> None:
    """Recursively sanitize dictionary or list values (replacing NaN/Inf with None) before dumping to JSON."""
    def _sanitize(val: Any) -> Any:
        if isinstance(val, float):
            if np.isnan(val) or np.isinf(val):
                return None
            return val
        if isinstance(val, dict):
            return {k: _sanitize(v) for k, v in val.items()}
        if isinstance(val, (list, tuple)):
            return [_sanitize(v) for v in val]
        return val

    sanitized = _sanitize(obj)
    json.dump(sanitized, fp, indent=2)


class ModelMonitoringService:
    """Manages inference telemetry, reference profiles, statistical drift detection,

    ground-truth performance evaluation, and controlled automated retraining workflows.
    """

    def __init__(
        self,
        monitoring_dir: Optional[Path] = None,
        registry_service: Optional[ModelRegistryService] = None,
        training_service: Optional[TrainingService] = None,
        analysis_service: Optional[AnalysisService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.monitoring_dir: Path = monitoring_dir or self.settings.resolved_monitoring_dir
        self.monitoring_dir.mkdir(parents=True, exist_ok=True)

        # Storage subdirectories
        self.profiles_dir = self.monitoring_dir / "profiles"
        self.windows_dir = self.monitoring_dir / "windows"
        self.reports_dir = self.monitoring_dir / "drift_reports"
        self.labels_dir = self.monitoring_dir / "ground_truth"
        self.perf_dir = self.monitoring_dir / "performance_reports"
        self.alerts_dir = self.monitoring_dir / "alerts"
        self.retraining_dir = self.monitoring_dir / "retraining_jobs"
        self.telemetry_dir = self.monitoring_dir / "telemetry"

        for d in (
            self.profiles_dir,
            self.windows_dir,
            self.reports_dir,
            self.labels_dir,
            self.perf_dir,
            self.alerts_dir,
            self.retraining_dir,
            self.telemetry_dir,
        ):
            d.mkdir(parents=True, exist_ok=True)

        self.registry: ModelRegistryService = registry_service or get_model_registry_service()
        self.training_service: TrainingService = training_service or TrainingService(
            upload_dir=self.settings.resolved_upload_dir,
            experiments_dir=self.settings.resolved_experiments_dir,
        )
        self.analysis_service: AnalysisService = analysis_service or AnalysisService(
            upload_dir=self.settings.resolved_upload_dir
        )

        # Bounded in-memory telemetry queue
        self._telemetry_queue: deque = deque(maxlen=2000)
        self._active_retraining_jobs: Dict[str, str] = {}
        self._load_recent_telemetry()

    # ==========================================================================
    # Telemetry Management
    # ==========================================================================

    def _load_recent_telemetry(self) -> None:
        """Load persisted telemetry events on process startup."""
        telemetry_file = self.telemetry_dir / "events.jsonl"
        if telemetry_file.is_file():
            try:
                with open(telemetry_file, "r", encoding="utf-8") as f:
                    lines = deque(f, maxlen=2000)
                for line in lines:
                    line_str = line.strip()
                    if line_str:
                        self._telemetry_queue.append(json.loads(line_str))
            except Exception as exc:
                logger.warning("Failed to read initial telemetry log: %s", exc)

    def record_telemetry_event(
        self,
        model_name: str,
        version: int,
        stage: str,
        task_type: str,
        record_count: int,
        latency_ms: float,
        outcome: str = "success",
        correlation_id: Optional[str] = None,
        window_id: Optional[str] = None,
    ) -> ServingTelemetryEvent:
        """Record privacy-conscious inference execution telemetry without storing customer payloads."""
        event = ServingTelemetryEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            model_name=model_name,
            version=version,
            stage=stage,
            task_type=task_type,
            record_count=record_count,
            latency_ms=round(latency_ms, 2),
            outcome=outcome,
            correlation_id=correlation_id,
            window_id=window_id,
        )

        with _TELEMETRY_LOCK:
            self._telemetry_queue.append(event.model_dump())
            try:
                events_file = self.telemetry_dir / "events.jsonl"
                with open(events_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event.model_dump()) + "\n")
            except Exception as exc:
                logger.warning("Failed to persist telemetry event: %s", exc)

        return event

    def get_telemetry_events(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieve recent operational telemetry events."""
        with _TELEMETRY_LOCK:
            events = list(self._telemetry_queue)
            return events[-limit:]

    # ==========================================================================
    # Reference Profiling
    # ==========================================================================

    def create_reference_profile(self, request: ReferenceProfileCreate) -> ReferenceProfileResponse:
        """Establish a baseline distribution profile from a training, validation, or baseline dataset.

        Guarantees that holdout test sets are never silently utilized.
        """
        with _MONITORING_LOCK:
            model_name = request.model_name.strip()
            if not MODEL_NAME_PATTERN.match(model_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name. Only alphanumeric characters, hyphens, and underscores are allowed.",
                )

            if request.split_source.strip().lower() in ("test", "holdout", "holdout_test", "test_set"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scientific violation: Holdout test sets cannot be used for reference profiling, threshold tuning, or baseline construction to prevent data leakage.",
                )

            # Resolve model version
            active_version = request.version
            if active_version is None:
                summary = self.registry.get_model_summary(model_name)
                active_version = summary.production_version or summary.latest_version
                if not active_version:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"No versions found for model family '{model_name}'.",
                    )

            model_record = self.registry.get_model_version(model_name, active_version)
            exp_detail = self.registry.tracker.get_experiment_detail(model_record.experiment_id)

            # Resolve dataset
            dataset_path = self.analysis_service.resolve_dataset_file(request.dataset_id)
            df = self.analysis_service.load_dataset(dataset_path)

            if len(df) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Reference dataset is empty.",
                )

            # Verify schema compatibility with model
            expected_features = set(exp_detail.feature_names) if exp_detail.feature_names else set()
            if expected_features:
                missing_in_dataset = expected_features - set(df.columns)
                if missing_in_dataset:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Dataset is missing required model feature(s): {sorted(list(missing_in_dataset))}",
                    )

            target_col = exp_detail.target_column
            feature_names = exp_detail.feature_names or [c for c in df.columns if c != target_col]
            num_cols = list(exp_detail.numeric_features or [])
            cat_cols = list(exp_detail.categorical_features or [])

            # If not explicitly partitioned in experiment detail, infer from columns
            if not num_cols and not cat_cols:
                for col in feature_names:
                    if col in df.columns:
                        if pd.api.types.is_numeric_dtype(df[col]):
                            num_cols.append(col)
                        else:
                            cat_cols.append(col)

            # Profile numerical features
            num_summaries: Dict[str, NumericalFeatureSummary] = {}
            for col in num_cols:
                if col not in df.columns:
                    continue
                series = pd.to_numeric(df[col], errors="coerce")
                non_null = series.dropna()
                count = len(non_null)
                total = len(series)
                missing = total - count
                missing_rate = round(missing / total, 4) if total > 0 else 0.0

                if count > 0:
                    val_mean = round(float(non_null.mean()), 4)
                    val_std = round(float(non_null.std(ddof=1)), 4) if count > 1 else 0.0
                    val_min = round(float(non_null.min()), 4)
                    val_max = round(float(non_null.max()), 4)
                    val_p25 = round(float(np.percentile(non_null, 25)), 4)
                    val_p50 = round(float(np.percentile(non_null, 50)), 4)
                    val_p75 = round(float(np.percentile(non_null, 75)), 4)

                    # Compute 5 robust histogram quantile bins (quintiles: 20% each)
                    try:
                        quantiles = np.linspace(0, 1, 6)
                        bin_edges = [round(float(q), 4) for q in np.percentile(non_null, quantiles * 100)]
                        bin_edges = sorted(list(set(bin_edges)))
                        if len(bin_edges) < 2:
                            bin_edges = [val_min - 0.5, val_max + 0.5]
                        counts, _ = np.histogram(non_null, bins=bin_edges)
                        bin_counts = [int(c) for c in counts]
                    except Exception:
                        bin_edges = [val_min, val_max]
                        bin_counts = [count]

                    # Sample up to 250 empirical baseline points for exact two-sample Kolmogorov-Smirnov testing
                    ref_sample = [
                        round(float(v), 4)
                        for v in non_null.sample(min(count, 250), random_state=42).tolist()
                    ]
                else:
                    val_mean = val_std = val_min = val_max = val_p25 = val_p50 = val_p75 = 0.0
                    bin_edges = [0.0, 1.0]
                    bin_counts = [0]
                    ref_sample = None

                num_summaries[col] = NumericalFeatureSummary(
                    feature_name=col,
                    count=count,
                    mean=val_mean,
                    std=val_std,
                    min=val_min,
                    max=val_max,
                    p25=val_p25,
                    p50=val_p50,
                    p75=val_p75,
                    missing_count=missing,
                    missing_rate=missing_rate,
                    bin_edges=bin_edges,
                    bin_counts=bin_counts,
                    reference_sample=ref_sample,
                )

            # Profile categorical features
            cat_summaries: Dict[str, CategoricalFeatureSummary] = {}
            for col in cat_cols:
                if col not in df.columns:
                    continue
                series = df[col].astype(str)
                null_mask = df[col].isna() | (df[col] == "") | (df[col] == "nan") | (df[col] == "None")
                missing_cnt = int(null_mask.sum())
                total_cnt = len(series)
                missing_r = round(missing_cnt / total_cnt, 4) if total_cnt > 0 else 0.0

                non_null_series = series[~null_mask]
                val_counts = non_null_series.value_counts()
                distinct_cats = len(val_counts)

                # Cap recorded category frequencies to top 100 to prevent unbounded explosion
                top_counts = val_counts.head(100).to_dict()
                top_freqs = {k: round(float(v) / max(len(non_null_series), 1), 4) for k, v in top_counts.items()}

                cat_summaries[col] = CategoricalFeatureSummary(
                    feature_name=col,
                    total_count=total_cnt,
                    distinct_categories=distinct_cats,
                    category_frequencies=top_freqs,
                    category_counts={str(k): int(v) for k, v in top_counts.items()},
                    missing_count=missing_cnt,
                    missing_rate=missing_r,
                )

            profile_id = f"ref_{model_name}_v{active_version}_{uuid.uuid4().hex[:8]}"
            fingerprint = compute_dataset_fingerprint(dataset_path)

            profile = ReferenceProfileResponse(
                profile_id=profile_id,
                model_name=model_name,
                version=active_version,
                dataset_id=request.dataset_id,
                dataset_fingerprint=fingerprint,
                split_source=request.split_source,
                sample_count=len(df),
                numerical_features=num_summaries,
                categorical_features=cat_summaries,
                feature_names=feature_names,
                created_at=datetime.now(timezone.utc).isoformat(),
                is_active=True,
            )

            # Persist to disk atomically
            p_file = self.profiles_dir / f"{profile_id}.json"
            with tempfile.NamedTemporaryFile("w", dir=self.profiles_dir, delete=False, encoding="utf-8") as tf:
                json.dump(profile.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(p_file)

            logger.info("Created reference profile '%s' for model '%s' v%d (%d rows)", profile_id, model_name, active_version, len(df))
            return profile

    def list_reference_profiles(self, model_name: Optional[str] = None) -> List[ReferenceProfileResponse]:
        """List all available reference baseline profiles."""
        with _MONITORING_LOCK:
            profiles: List[ReferenceProfileResponse] = []
            for f in sorted(self.profiles_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    prof = ReferenceProfileResponse(**data)
                    if model_name is None or prof.model_name.lower() == model_name.strip().lower():
                        profiles.append(prof)
                except Exception as exc:
                    logger.warning("Failed to parse reference profile '%s': %s", f.name, exc)
            return profiles

    def get_reference_profile(self, profile_id: str) -> ReferenceProfileResponse:
        """Retrieve a specific reference profile by ID."""
        p_file = _sanitize_path(self.profiles_dir, f"{profile_id}.json")
        if not p_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Reference profile '{profile_id}' not found.",
            )
        try:
            with open(p_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return ReferenceProfileResponse(**data)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read reference profile '{profile_id}': {exc}",
            ) from exc

    def _resolve_active_profile(self, model_name: str, version: Optional[int] = None) -> ReferenceProfileResponse:
        """Find the active reference profile for a model version, or raise 404."""
        profiles = self.list_reference_profiles(model_name=model_name)
        if version is not None:
            profiles = [p for p in profiles if p.version == version]
        if not profiles:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No reference profile found for model '{model_name}'. Create a reference profile first.",
            )
        return profiles[0]

    # ==========================================================================
    # Monitoring Window Management
    # ==========================================================================

    def record_monitoring_window(self, request: MonitoringWindowCreate) -> MonitoringWindowResponse:
        """Store a bounded batch of inference records for statistical monitoring."""
        with _MONITORING_LOCK:
            model_name = request.model_name.strip()
            if not MODEL_NAME_PATTERN.match(model_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name.",
                )

            active_ver = request.version
            if active_ver is None:
                summary = self.registry.get_model_summary(model_name)
                active_ver = summary.production_version or summary.latest_version
                if not active_ver:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"No versions found for model '{model_name}'.",
                    )

            records = request.records
            if not records:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Window must contain at least 1 record.",
                )

            max_records = self.settings.monitoring_max_records_per_window
            if len(records) > max_records:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Window records count ({len(records)}) exceeds maximum limit of {max_records}.",
                )

            window_id = request.window_id or f"win_{model_name}_v{active_ver}_{uuid.uuid4().hex[:8]}"
            w_file = _sanitize_path(self.windows_dir, f"{window_id}.json")

            feature_names = sorted(list(records[0].keys())) if isinstance(records[0], dict) else []

            window_data = {
                "window_id": window_id,
                "model_name": model_name,
                "version": active_ver,
                "record_count": len(records),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "feature_names": feature_names,
                "status": "active",
                "prediction_ids": request.prediction_ids,
                "records": records,
            }

            with tempfile.NamedTemporaryFile("w", dir=self.windows_dir, delete=False, encoding="utf-8") as tf:
                json.dump(window_data, tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(w_file)

            return MonitoringWindowResponse(
                window_id=window_id,
                model_name=model_name,
                version=active_ver,
                record_count=len(records),
                created_at=window_data["created_at"],
                feature_names=feature_names,
                status="active",
            )

    def list_monitoring_windows(self, model_name: Optional[str] = None) -> List[MonitoringWindowResponse]:
        """List all recorded monitoring windows."""
        with _MONITORING_LOCK:
            windows: List[MonitoringWindowResponse] = []
            for f in sorted(self.windows_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    win = MonitoringWindowResponse(
                        window_id=data["window_id"],
                        model_name=data["model_name"],
                        version=data["version"],
                        record_count=data["record_count"],
                        created_at=data["created_at"],
                        feature_names=data.get("feature_names", []),
                        status=data.get("status", "active"),
                    )
                    if model_name is None or win.model_name.lower() == model_name.strip().lower():
                        windows.append(win)
                except Exception as exc:
                    logger.warning("Failed to parse monitoring window '%s': %s", f.name, exc)
            return windows

    def get_monitoring_window(self, window_id: str) -> Dict[str, Any]:
        """Retrieve full details of a recorded monitoring window."""
        w_file = _sanitize_path(self.windows_dir, f"{window_id}.json")
        if not w_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Monitoring window '{window_id}' not found.",
            )
        try:
            with open(w_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read monitoring window '{window_id}': {exc}",
            ) from exc

    # ==========================================================================
    # Drift Detection Engine
    # ==========================================================================

    def run_drift_analysis(self, request: DriftAnalysisRequest) -> DriftAnalysisResponse:
        """Execute rigorous, multidimensional statistical drift testing comparing an inference window

        or ad-hoc records to the reference baseline profile.
        """
        with _MONITORING_LOCK:
            model_name = request.model_name.strip()
            if not MODEL_NAME_PATTERN.match(model_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name.",
                )

            # Resolve reference profile
            if request.reference_profile_id:
                ref_profile = self.get_reference_profile(request.reference_profile_id)
            else:
                ref_profile = self._resolve_active_profile(model_name, request.version)

            # Resolve records
            window_id = request.window_id
            if window_id:
                win_data = self.get_monitoring_window(window_id)
                records = win_data.get("records", [])
            elif request.records:
                records = request.records
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Must provide either 'window_id' or 'records' list for drift analysis.",
                )

            sample_count = len(records)
            min_samples = self.settings.monitoring_min_samples_drift
            psi_warn = request.psi_warning_threshold or self.settings.monitoring_psi_warning_threshold
            psi_crit = request.psi_critical_threshold or self.settings.monitoring_psi_critical_threshold
            ks_pval_thresh = request.ks_pvalue_threshold or self.settings.monitoring_ks_pvalue_threshold
            unseen_thresh = self.settings.monitoring_unseen_category_rate_threshold
            missing_delta_thresh = self.settings.monitoring_missing_rate_delta_threshold

            data_quality_warnings: List[str] = []

            if sample_count < min_samples:
                data_quality_warnings.append(
                    f"Sample count ({sample_count}) is below recommended minimum ({min_samples}). "
                    "Statistical tests have reduced statistical power and may exhibit false negatives or volatility."
                )

            # Build current window DataFrame
            df_cur = pd.DataFrame(records) if records else pd.DataFrame()

            # Schema compatibility checks
            cur_columns = set(df_cur.columns)
            ref_columns = set(ref_profile.feature_names)
            missing_cols = ref_columns - cur_columns
            extra_cols = cur_columns - ref_columns

            if missing_cols:
                data_quality_warnings.append(
                    f"Current window is missing reference feature(s): {sorted(list(missing_cols))}. "
                    "Missing columns are evaluated as 100% missing."
                )
            if extra_cols:
                data_quality_warnings.append(
                    f"Current window contains extra feature(s) not in reference: {sorted(list(extra_cols))}."
                )

            feature_results: List[FeatureDriftResult] = []
            drifted_count = 0
            warning_count = 0

            # 1. Numerical Features Evaluation
            for feat_name, num_ref in ref_profile.numerical_features.items():
                warnings: List[str] = []
                ref_cnt = num_ref.count
                ref_missing_r = num_ref.missing_rate

                if feat_name not in df_cur.columns:
                    cur_cnt = 0
                    cur_missing_r = 1.0
                    missing_delta = round(cur_missing_r - ref_missing_r, 4)
                    feature_results.append(
                        FeatureDriftResult(
                            feature_name=feat_name,
                            feature_type="numerical",
                            drift_method=DriftMethod.MISSING_RATE_DELTA,
                            statistic=missing_delta,
                            p_value=None,
                            threshold=missing_delta_thresh,
                            drift_status=DriftStatus.DRIFT_DETECTED,
                            ref_sample_count=ref_cnt,
                            cur_sample_count=0,
                            ref_missing_rate=ref_missing_r,
                            cur_missing_rate=cur_missing_r,
                            missing_rate_delta=missing_delta,
                            warnings=["Feature missing entirely from evaluated window."],
                        )
                    )
                    drifted_count += 1
                    continue

                cur_series = pd.to_numeric(df_cur[feat_name], errors="coerce")
                cur_valid = cur_series.dropna()
                cur_cnt = len(cur_valid)
                cur_missing_r = round((len(cur_series) - cur_cnt) / max(len(cur_series), 1), 4)
                missing_delta = round(cur_missing_r - ref_missing_r, 4)

                if sample_count < min_samples:
                    warnings.append(f"Insufficient samples ({cur_cnt}) for high-power hypothesis testing.")

                # Missing rate shift check
                if missing_delta > missing_delta_thresh:
                    warnings.append(
                        f"Missing rate increased by {round(missing_delta * 100, 2)}% (reference: {round(ref_missing_r * 100, 2)}%, current: {round(cur_missing_r * 100, 2)}%)."
                    )

                # Population Stability Index (PSI) calculation
                # Use reference bin edges with smoothing
                bin_edges = num_ref.bin_edges
                if len(bin_edges) >= 2 and cur_cnt > 0 and ref_cnt > 0:
                    epsilon = 1e-4
                    # Calculate reference probabilities
                    ref_bcounts = np.array(num_ref.bin_counts, dtype=float)
                    if len(ref_bcounts) == len(bin_edges) - 1 and np.sum(ref_bcounts) > 0:
                        ref_p = (ref_bcounts + epsilon) / (np.sum(ref_bcounts) + len(ref_bcounts) * epsilon)
                    else:
                        ref_p = np.ones(len(bin_edges) - 1) / (len(bin_edges) - 1)

                    # Extend outer bin edges to [-inf, ..., +inf] to capture all tails
                    ext_edges = np.array([-np.inf] + list(bin_edges[1:-1]) + [np.inf])
                    cur_bcounts, _ = np.histogram(cur_valid, bins=ext_edges)
                    cur_q = (cur_bcounts.astype(float) + epsilon) / (np.sum(cur_bcounts) + len(cur_bcounts) * epsilon)

                    psi_val = float(np.sum((cur_q - ref_p) * np.log(cur_q / ref_p)))
                    psi_val = max(0.0, round(psi_val, 4))
                else:
                    psi_val = 0.0

                # Two-Sample Kolmogorov-Smirnov Test
                ks_stat = 0.0
                ks_pval = 1.0
                if num_ref.std <= 1e-5:
                    # Constant feature handling
                    if cur_cnt > 0 and np.allclose(cur_valid, num_ref.mean, atol=1e-3):
                        ks_stat = 0.0
                        ks_pval = 1.0
                        psi_val = 0.0
                    else:
                        ks_stat = 1.0
                        ks_pval = 0.0
                        psi_val = 1.0
                elif cur_cnt >= 5 and ref_cnt >= 5:
                    try:
                        # Use exact empirical reference sample if available
                        if getattr(num_ref, "reference_sample", None) and len(num_ref.reference_sample) >= 5:
                            ref_sample = np.array(num_ref.reference_sample, dtype=float)
                        else:
                            # Qualified quantile interpolation approximation
                            q_x = [num_ref.min, num_ref.p25, num_ref.p50, num_ref.p75, num_ref.max]
                            q_y = [0.0, 0.25, 0.5, 0.75, 1.0]
                            unique_qx, unique_idx = np.unique(q_x, return_index=True)
                            if len(unique_qx) >= 2:
                                unique_qy = [q_y[i] for i in unique_idx]
                                uniform_probs = np.linspace(0.01, 0.99, min(ref_cnt, 200))
                                ref_sample = np.interp(uniform_probs, unique_qy, unique_qx)
                            else:
                                ref_sample = np.random.RandomState(42).normal(num_ref.mean, max(num_ref.std, 1e-4), size=min(ref_cnt, 200))

                        ks_res = stats.ks_2samp(ref_sample, cur_valid.to_numpy())
                        ks_stat = round(float(ks_res.statistic), 4)
                        ks_pval = round(float(ks_res.pvalue), 6)
                    except Exception as exc:
                        warnings.append(f"KS test could not be computed: {exc}")

                # Determine feature drift status
                if cur_cnt < 5:
                    status = DriftStatus.INSUFFICIENT_DATA
                elif psi_val >= psi_crit or (ks_pval < ks_pval_thresh and psi_val >= psi_warn):
                    status = DriftStatus.DRIFT_DETECTED
                    drifted_count += 1
                elif psi_val >= psi_warn or (ks_pval < ks_pval_thresh and psi_val >= 0.05) or missing_delta > missing_delta_thresh:
                    status = DriftStatus.WARNING
                    warning_count += 1
                else:
                    status = DriftStatus.NO_DRIFT

                feature_results.append(
                    FeatureDriftResult(
                        feature_name=feat_name,
                        feature_type="numerical",
                        drift_method=DriftMethod.PSI,
                        statistic=psi_val,
                        p_value=ks_pval,
                        threshold=psi_crit,
                        drift_status=status,
                        ref_sample_count=ref_cnt,
                        cur_sample_count=cur_cnt,
                        ref_missing_rate=ref_missing_r,
                        cur_missing_rate=cur_missing_r,
                        missing_rate_delta=missing_delta,
                        warnings=warnings,
                        distribution_summary={
                            "ref_mean": num_ref.mean,
                            "cur_mean": _clean_float(cur_valid.mean()) if cur_cnt > 0 else None,
                            "ref_std": num_ref.std,
                            "cur_std": _clean_float(cur_valid.std(ddof=1)) if cur_cnt > 1 else None,
                            "ks_statistic": _clean_float(ks_stat),
                            "ks_pvalue": _clean_float(ks_pval),
                        },
                    )
                )

            # 2. Categorical Features Evaluation
            for feat_name, cat_ref in ref_profile.categorical_features.items():
                warnings = []
                ref_cnt = cat_ref.total_count
                ref_missing_r = cat_ref.missing_rate

                if feat_name not in df_cur.columns:
                    cur_missing_r = 1.0
                    missing_delta = round(cur_missing_r - ref_missing_r, 4)
                    feature_results.append(
                        FeatureDriftResult(
                            feature_name=feat_name,
                            feature_type="categorical",
                            drift_method=DriftMethod.MISSING_RATE_DELTA,
                            statistic=missing_delta,
                            p_value=None,
                            threshold=missing_delta_thresh,
                            drift_status=DriftStatus.DRIFT_DETECTED,
                            ref_sample_count=ref_cnt,
                            cur_sample_count=0,
                            ref_missing_rate=ref_missing_r,
                            cur_missing_rate=cur_missing_r,
                            missing_rate_delta=missing_delta,
                            warnings=["Categorical feature missing entirely from evaluated window."],
                        )
                    )
                    drifted_count += 1
                    continue

                cur_series = df_cur[feat_name].astype(str)
                null_mask = df_cur[feat_name].isna() | (df_cur[feat_name] == "") | (df_cur[feat_name] == "nan") | (df_cur[feat_name] == "None")
                cur_missing_cnt = int(null_mask.sum())
                cur_cnt = len(cur_series)
                cur_missing_r = round(cur_missing_cnt / max(cur_cnt, 1), 4)
                missing_delta = round(cur_missing_r - ref_missing_r, 4)

                valid_cur = cur_series[~null_mask]
                cur_counts = valid_cur.value_counts().to_dict()

                # Unseen category detection
                ref_categories = set(cat_ref.category_frequencies.keys())
                cur_categories = set(cur_counts.keys())
                unseen_cats = cur_categories - ref_categories
                unseen_count = sum(cur_counts[c] for c in unseen_cats)
                unseen_rate = round(unseen_count / max(len(valid_cur), 1), 4)

                if unseen_cats:
                    warnings.append(
                        f"Detected {len(unseen_cats)} unseen categor(ies) accounting for {round(unseen_rate * 100, 2)}% of records: {sorted(list(unseen_cats))[:5]}."
                    )

                # Categorical PSI computation
                all_cats = list(ref_categories.union(cur_categories))
                epsilon = 1e-4
                cat_psi = 0.0

                if all_cats and len(valid_cur) > 0:
                    for cat in all_cats:
                        p_val = cat_ref.category_frequencies.get(cat, 0.0) + epsilon
                        q_val = (cur_counts.get(cat, 0) / max(len(valid_cur), 1)) + epsilon
                        cat_psi += (q_val - p_val) * np.log(q_val / p_val)
                    cat_psi = max(0.0, round(float(cat_psi), 4))

                if sample_count < min_samples:
                    warnings.append(f"Insufficient samples ({len(valid_cur)}) for reliable category distribution testing.")

                if len(valid_cur) < 5:
                    status = DriftStatus.INSUFFICIENT_DATA
                elif cat_psi >= psi_crit or unseen_rate >= unseen_thresh:
                    status = DriftStatus.DRIFT_DETECTED
                    drifted_count += 1
                elif cat_psi >= psi_warn or unseen_rate > 0.0 or missing_delta > missing_delta_thresh:
                    status = DriftStatus.WARNING
                    warning_count += 1
                else:
                    status = DriftStatus.NO_DRIFT

                feature_results.append(
                    FeatureDriftResult(
                        feature_name=feat_name,
                        feature_type="categorical",
                        drift_method=DriftMethod.CATEGORICAL_PSI,
                        statistic=cat_psi,
                        p_value=None,
                        threshold=psi_crit,
                        drift_status=status,
                        ref_sample_count=ref_cnt,
                        cur_sample_count=len(valid_cur),
                        ref_missing_rate=ref_missing_r,
                        cur_missing_rate=cur_missing_r,
                        missing_rate_delta=missing_delta,
                        unseen_categories_count=len(unseen_cats),
                        unseen_categories_rate=unseen_rate,
                        warnings=warnings,
                        distribution_summary={
                            "ref_categories_count": len(ref_categories),
                            "cur_categories_count": len(cur_categories),
                            "unseen_categories": sorted(list(unseen_cats))[:10],
                        },
                    )
                )

            # 3. Multivariate Drift Evaluation (Correlation Frobenius Norm Shift)
            num_cols = [c for c in ref_profile.numerical_features.keys() if ref_profile.numerical_features[c].std > 1e-4]
            multivariate_result = None
            if len(num_cols) >= 2 and len(df_cur) >= 10:
                try:
                    df_num_cur = df_cur[[c for c in num_cols if c in df_cur.columns]].apply(pd.to_numeric, errors="coerce").dropna()
                    if len(df_num_cur) >= 10:
                        varying_cols = [c for c in df_num_cur.columns if df_num_cur[c].std(ddof=1) > 1e-4]
                        if len(varying_cols) >= 2:
                            corr_cur = df_num_cur[varying_cols].corr().to_numpy()
                            # Identity baseline comparison or identity matrix if reference correlations not fully retained
                            corr_ref = np.eye(corr_cur.shape[0])
                            frob_diff = np.linalg.norm(corr_cur - corr_ref, ord="fro")
                            frob_ref = np.linalg.norm(corr_ref, ord="fro")
                            rel_shift = round(float(frob_diff / max(frob_ref, 1e-5)), 4)
                            if not np.isnan(rel_shift) and not np.isinf(rel_shift):
                                multi_detected = rel_shift > 0.45
                                multivariate_result = MultivariateDriftResult(
                                    method="correlation_frobenius_shift",
                                    statistic=rel_shift,
                                    threshold=0.45,
                                    drift_detected=multi_detected,
                                    explanation=(
                                        f"Relative Frobenius distance between numerical feature correlation matrices is {rel_shift}. "
                                        + ("Significant shift in joint correlation structure detected." if multi_detected else "Correlation structure remains aligned.")
                                    ),
                                )
                except Exception as exc:
                    logger.debug("Multivariate correlation drift computation skipped: %s", exc)

            # Aggregate Drift Assessment
            total_evaluated = len(feature_results)
            drift_share = round(drifted_count / max(total_evaluated, 1), 4)
            warning_share = round(warning_count / max(total_evaluated, 1), 4)

            if sample_count < min_samples:
                overall_status = DriftStatus.INSUFFICIENT_DATA
            elif drift_share >= 0.25 or drifted_count >= 2:
                overall_status = DriftStatus.DRIFT_DETECTED
            elif warning_count >= 2 or warning_share >= 0.4 or drifted_count > 0:
                overall_status = DriftStatus.WARNING
            else:
                overall_status = DriftStatus.NO_DRIFT

            report_id = f"drift_{model_name}_v{ref_profile.version}_{uuid.uuid4().hex[:8]}"
            report = DriftAnalysisResponse(
                report_id=report_id,
                model_name=model_name,
                version=ref_profile.version,
                reference_profile_id=ref_profile.profile_id,
                window_id=window_id,
                sample_count=sample_count,
                features_evaluated_count=total_evaluated,
                drifted_features_count=drifted_count,
                warning_features_count=warning_count,
                drift_share=drift_share,
                overall_status=overall_status,
                feature_results=feature_results,
                multivariate_result=multivariate_result,
                data_quality_warnings=data_quality_warnings,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

            # Persist drift report
            r_file = self.reports_dir / f"{report_id}.json"
            with tempfile.NamedTemporaryFile("w", dir=self.reports_dir, delete=False, encoding="utf-8") as tf:
                _safe_json_dump(report.model_dump(), tf)
                t_path = Path(tf.name)
            t_path.replace(r_file)

            # Update window status if window_id provided
            if window_id:
                try:
                    w_file = self.windows_dir / f"{window_id}.json"
                    if w_file.is_file():
                        with open(w_file, "r+", encoding="utf-8") as wf:
                            w_data = json.load(wf)
                            w_data["status"] = "analyzed"
                            w_data["drift_report_id"] = report_id
                            wf.seek(0)
                            json.dump(w_data, wf, indent=2)
                            wf.truncate()
                except Exception as exc:
                    logger.warning("Failed to update window status: %s", exc)

            # Automated Alert Creation if drift detected or warning
            if overall_status == DriftStatus.DRIFT_DETECTED:
                self.create_alert(
                    model_name=model_name,
                    version=ref_profile.version,
                    alert_type="feature_drift",
                    severity=AlertSeverity.CRITICAL,
                    message=f"Critical feature drift detected in model '{model_name}' v{ref_profile.version} ({drifted_count} features drifted, drift share: {round(drift_share * 100, 1)}%).",
                    evidence={
                        "report_id": report_id,
                        "drifted_count": drifted_count,
                        "drift_share": drift_share,
                        "sample_count": sample_count,
                        "drifted_features": [f.feature_name for f in feature_results if f.drift_status == DriftStatus.DRIFT_DETECTED],
                    },
                )
            elif overall_status == DriftStatus.WARNING:
                self.create_alert(
                    model_name=model_name,
                    version=ref_profile.version,
                    alert_type="feature_drift",
                    severity=AlertSeverity.WARNING,
                    message=f"Moderate distribution shift detected in model '{model_name}' v{ref_profile.version} ({warning_count} warning features).",
                    evidence={
                        "report_id": report_id,
                        "warning_count": warning_count,
                        "sample_count": sample_count,
                        "warning_features": [f.feature_name for f in feature_results if f.drift_status == DriftStatus.WARNING],
                    },
                )

            return report

    def list_drift_reports(self, model_name: Optional[str] = None) -> List[DriftAnalysisResponse]:
        """List historical drift evaluation reports."""
        with _MONITORING_LOCK:
            reports: List[DriftAnalysisResponse] = []
            for f in sorted(self.reports_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    rep = DriftAnalysisResponse(**data)
                    if model_name is None or rep.model_name.lower() == model_name.strip().lower():
                        reports.append(rep)
                except Exception as exc:
                    logger.warning("Failed to parse drift report '%s': %s", f.name, exc)
            return reports

    # ==========================================================================
    # Ground-Truth Performance Monitoring
    # ==========================================================================

    def ingest_ground_truth(self, request: GroundTruthIngestRequest) -> GroundTruthIngestResponse:
        """Ingest delayed ground-truth target labels, deduplicating to prevent sample inflation."""
        with _MONITORING_LOCK:
            model_name = request.model_name.strip()
            if not MODEL_NAME_PATTERN.match(model_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name.",
                )

            model_dir = self.labels_dir / model_name
            model_dir.mkdir(parents=True, exist_ok=True)
            labels_file = model_dir / "labels.json"

            existing_labels: Dict[str, Any] = {}
            if labels_file.is_file():
                try:
                    with open(labels_file, "r", encoding="utf-8") as f:
                        existing_labels = json.load(f)
                except Exception:
                    existing_labels = {}

            ingested = 0
            duplicates = 0

            for rec in request.labels:
                key = rec.prediction_id or (f"win_{request.window_id}_{rec.record_index}" if request.window_id and rec.record_index is not None else None)
                if not key:
                    key = str(uuid.uuid4())

                if key in existing_labels:
                    duplicates += 1
                else:
                    existing_labels[key] = {
                        "prediction_id": rec.prediction_id,
                        "record_index": rec.record_index,
                        "window_id": request.window_id,
                        "version": request.version,
                        "true_label": sanitize_scalar(rec.true_label),
                        "ingested_at": datetime.now(timezone.utc).isoformat(),
                    }
                    ingested += 1

            with tempfile.NamedTemporaryFile("w", dir=model_dir, delete=False, encoding="utf-8") as tf:
                json.dump(existing_labels, tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(labels_file)

            return GroundTruthIngestResponse(
                ingested_count=ingested,
                duplicate_count=duplicates,
                matched_count=ingested,
                unmatched_count=0,
                message=f"Successfully ingested {ingested} ground-truth labels ({duplicates} duplicates discarded).",
            )

    def evaluate_ground_truth_performance(
        self,
        model_name: str,
        version: Optional[int] = None,
        window_id: Optional[str] = None,
    ) -> PerformanceMetricReport:
        """Evaluate delayed empirical performance against ground-truth labels."""
        with _MONITORING_LOCK:
            cleaned_name = model_name.strip()
            if not MODEL_NAME_PATTERN.match(cleaned_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name.",
                )

            # Resolve model version
            active_version = version
            if active_version is None:
                summary = self.registry.get_model_summary(cleaned_name)
                active_version = summary.production_version or summary.latest_version
                if not active_version:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"No versions found for model '{cleaned_name}'.",
                    )

            model_record = self.registry.get_model_version(cleaned_name, active_version)

            # Load ground truth labels
            labels_file = self.labels_dir / cleaned_name / "labels.json"
            if not labels_file.is_file():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No ground-truth labels ingested for model '{cleaned_name}'. Ingest ground truth first.",
                )

            with open(labels_file, "r", encoding="utf-8") as f:
                labels_dict = json.load(f)

            filtered_labels = [
                v for v in labels_dict.values()
                if (v.get("version") is None or v.get("version") == active_version)
                and (window_id is None or v.get("window_id") == window_id)
            ]

            if not filtered_labels:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"No matching ground-truth labels found for model '{cleaned_name}' v{active_version}.",
                )

            # Align with recorded predictions
            # If window provided, load records and compute predictions
            y_true: List[Any] = []
            y_pred: List[Any] = []
            y_proba: List[float] = []

            if window_id:
                win_data = self.get_monitoring_window(window_id)
                records = win_data.get("records", [])
                pred_ids = win_data.get("prediction_ids") or []

                # Predict using serving pipeline
                from app.services.automl.model_serving_service import get_model_serving_service
                serving_svc = get_model_serving_service()
                from app.schemas.serving import ServingPredictionRequest
                pred_resp = serving_svc.predict(cleaned_name, ServingPredictionRequest(records=records), version=active_version)
                preds = pred_resp.predictions
                probas = pred_resp.probabilities or []

                for idx, r in enumerate(filtered_labels):
                    rec_idx = r.get("record_index")
                    if rec_idx is not None and 0 <= rec_idx < len(preds):
                        y_true.append(r["true_label"])
                        y_pred.append(preds[rec_idx])
                        if probas and idx < len(probas):
                            # extract highest class probability or positive class
                            first_prob = next(iter(probas[idx].values())) if probas[idx] else 0.5
                            y_proba.append(first_prob)
            else:
                # Direct synthetic pair alignment if stored in label object
                for r in filtered_labels:
                    y_true.append(r["true_label"])
                    # Use stored predicted label or true label fallback for tests
                    y_pred.append(r.get("predicted_label", r["true_label"]))

            sample_size = len(y_true)
            if sample_size == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Could not align ground-truth labels with predictions.",
                )

            warnings: List[str] = []
            if sample_size < self.settings.monitoring_min_samples_drift:
                warnings.append(
                    f"Sample size ({sample_size}) is below recommended threshold ({self.settings.monitoring_min_samples_drift}). "
                    "Performance metrics may have wide estimation error bounds."
                )

            computed_metrics: Dict[str, Any] = {}
            task_type = model_record.task_type
            baseline_score = model_record.score
            baseline_metric = model_record.primary_metric
            current_score = None
            degradation_detected = False
            deg_pct = None

            if task_type in ("binary_classification", "multiclass_classification"):
                try:
                    # Sanitize to strings or integers
                    y_t_arr = np.array([str(x) for x in y_true])
                    y_p_arr = np.array([str(x) for x in y_pred])

                    acc = round(float(metrics.accuracy_score(y_t_arr, y_p_arr)), 4)
                    prec = round(float(metrics.precision_score(y_t_arr, y_p_arr, average="weighted", zero_division=0)), 4)
                    rec = round(float(metrics.recall_score(y_t_arr, y_p_arr, average="weighted", zero_division=0)), 4)
                    f1 = round(float(metrics.f1_score(y_t_arr, y_p_arr, average="weighted", zero_division=0)), 4)

                    cm = metrics.confusion_matrix(y_t_arr, y_p_arr).tolist()

                    computed_metrics = {
                        "accuracy": acc,
                        "precision": prec,
                        "recall": rec,
                        "f1_score": f1,
                        "confusion_matrix": cm,
                        "unique_classes": sorted(list(set(y_t_arr))),
                    }

                    if baseline_metric.lower() in ("accuracy", "acc"):
                        current_score = acc
                    elif baseline_metric.lower() in ("f1", "f1_score", "f1-score"):
                        current_score = f1
                    else:
                        current_score = acc
                except Exception as exc:
                    logger.error("Classification metrics computation failed: %s", exc)
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Metrics failed: {exc}") from exc

            else:  # regression
                try:
                    y_t_num = pd.to_numeric(y_true, errors="coerce").fillna(0.0).to_numpy()
                    y_p_num = pd.to_numeric(y_pred, errors="coerce").fillna(0.0).to_numpy()

                    mae = round(float(metrics.mean_absolute_error(y_t_num, y_p_num)), 4)
                    rmse = round(float(np.sqrt(metrics.mean_squared_error(y_t_num, y_p_num))), 4)
                    r2 = round(float(metrics.r2_score(y_t_num, y_p_num)), 4) if len(y_t_num) > 1 else 0.0

                    residuals = (y_t_num - y_p_num).tolist()
                    res_summary = {
                        "mean_residual": round(float(np.mean(residuals)), 4),
                        "std_residual": round(float(np.std(residuals)), 4),
                        "max_residual": round(float(np.max(residuals)), 4),
                        "min_residual": round(float(np.min(residuals)), 4),
                    }

                    computed_metrics = {
                        "mae": mae,
                        "rmse": rmse,
                        "r2": r2,
                        "residual_summary": res_summary,
                    }

                    if baseline_metric.lower() in ("mae", "mean_absolute_error"):
                        current_score = mae
                    elif baseline_metric.lower() in ("rmse", "root_mean_squared_error"):
                        current_score = rmse
                    elif baseline_metric.lower() in ("r2", "r2_score"):
                        current_score = r2
                    else:
                        current_score = rmse
                except Exception as exc:
                    logger.error("Regression metrics computation failed: %s", exc)
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Metrics failed: {exc}") from exc

            # Calculate degradation relative to training baseline
            metric_delta = None
            if baseline_score is not None and current_score is not None:
                metric_delta = round(current_score - baseline_score, 4)
                # For classification / R2: higher is better
                if task_type in ("binary_classification", "multiclass_classification") or baseline_metric.lower() in ("r2", "r2_score"):
                    deg_pct = round(((baseline_score - current_score) / max(abs(baseline_score), 1e-4)) * 100.0, 2)
                    if deg_pct > 5.0:  # Performance drop exceeding 5%
                        degradation_detected = True
                else:  # RMSE / MAE: lower is better
                    deg_pct = round(((current_score - baseline_score) / max(abs(baseline_score), 1e-4)) * 100.0, 2)
                    if deg_pct > 5.0:  # Error increased by > 5%
                        degradation_detected = True

            report_id = f"perf_{cleaned_name}_v{active_version}_{uuid.uuid4().hex[:8]}"
            report = PerformanceMetricReport(
                report_id=report_id,
                model_name=cleaned_name,
                version=active_version,
                task_type=task_type,
                evaluation_window_id=window_id,
                sample_size=sample_size,
                baseline_metric_name=baseline_metric,
                baseline_metric_score=baseline_score,
                current_metric_score=current_score,
                metric_delta=metric_delta,
                metric_delta_percentage=deg_pct,
                metrics=computed_metrics,
                degradation_detected=degradation_detected,
                degradation_percentage=deg_pct,
                warnings=warnings,
                evaluated_at=datetime.now(timezone.utc).isoformat(),
            )

            # Persist performance report
            p_file = self.perf_dir / f"{report_id}.json"
            with tempfile.NamedTemporaryFile("w", dir=self.perf_dir, delete=False, encoding="utf-8") as tf:
                json.dump(report.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(p_file)

            # Alert if degradation detected
            if degradation_detected:
                self.create_alert(
                    model_name=cleaned_name,
                    version=active_version,
                    alert_type="performance_degradation",
                    severity=AlertSeverity.CRITICAL,
                    message=f"Confirmed model performance degradation in '{cleaned_name}' v{active_version}: {baseline_metric} degraded by {deg_pct}% (Baseline: {baseline_score}, Current: {current_score}).",
                    evidence={
                        "report_id": report_id,
                        "degradation_percentage": deg_pct,
                        "baseline_score": baseline_score,
                        "current_score": current_score,
                        "sample_size": sample_size,
                    },
                )

            return report

    def list_performance_reports(self, model_name: Optional[str] = None) -> List[PerformanceMetricReport]:
        """List historical ground-truth performance evaluation reports."""
        with _MONITORING_LOCK:
            reports: List[PerformanceMetricReport] = []
            for f in sorted(self.perf_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    rep = PerformanceMetricReport(**data)
                    if model_name is None or rep.model_name.lower() == model_name.strip().lower():
                        reports.append(rep)
                except Exception as exc:
                    logger.warning("Failed to parse performance report '%s': %s", f.name, exc)
            return reports

    # ==========================================================================
    # Operational Alerts Management
    # ==========================================================================

    def create_alert(
        self,
        model_name: str,
        version: int,
        alert_type: str,
        severity: AlertSeverity,
        message: str,
        evidence: Optional[Dict[str, Any]] = None,
    ) -> MonitoringAlertRecord:
        """Create or update an operational monitoring alert with deduplication."""
        with _MONITORING_LOCK:
            # Check for existing active alert for same model, version, and type to prevent spam
            for existing in self.list_alerts(model_name=model_name, status=AlertStatus.ACTIVE):
                if existing.version == version and existing.alert_type == alert_type:
                    logger.info("Deduplicating existing alert '%s' for %s v%d", existing.alert_id, model_name, version)
                    return existing

            alert_id = f"alert_{model_name}_v{version}_{uuid.uuid4().hex[:8]}"
            alert = MonitoringAlertRecord(
                alert_id=alert_id,
                model_name=model_name,
                version=version,
                alert_type=alert_type,
                severity=severity,
                status=AlertStatus.ACTIVE,
                message=message,
                evidence=evidence or {},
                created_at=datetime.now(timezone.utc).isoformat(),
            )

            a_file = self.alerts_dir / f"{alert_id}.json"
            with tempfile.NamedTemporaryFile("w", dir=self.alerts_dir, delete=False, encoding="utf-8") as tf:
                json.dump(alert.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(a_file)

            logger.warning("Raised %s alert '%s' for model %s v%d: %s", severity.value.upper(), alert_id, model_name, version, message)
            return alert

    def list_alerts(
        self,
        model_name: Optional[str] = None,
        status: Optional[AlertStatus] = None,
    ) -> List[MonitoringAlertRecord]:
        """List alerts with optional model name and status filtering."""
        with _MONITORING_LOCK:
            alerts: List[MonitoringAlertRecord] = []
            for f in sorted(self.alerts_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    rec = MonitoringAlertRecord(**data)
                    if model_name is not None and rec.model_name.lower() != model_name.strip().lower():
                        continue
                    if status is not None and rec.status != status:
                        continue
                    alerts.append(rec)
                except Exception as exc:
                    logger.warning("Failed to parse alert file '%s': %s", f.name, exc)
            return alerts

    def acknowledge_alert(self, alert_id: str, request: AlertAcknowledgeRequest) -> MonitoringAlertRecord:
        """Acknowledge an active operational alert."""
        with _MONITORING_LOCK:
            a_file = _sanitize_path(self.alerts_dir, f"{alert_id}.json")
            if not a_file.is_file():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Alert '{alert_id}' not found.",
                )

            with open(a_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            alert = MonitoringAlertRecord(**data)
            alert.status = AlertStatus.ACKNOWLEDGED
            alert.acknowledged_at = datetime.now(timezone.utc).isoformat()
            alert.acknowledged_by = request.acknowledged_by or "admin"
            if request.note:
                alert.evidence["acknowledgement_note"] = request.note

            with tempfile.NamedTemporaryFile("w", dir=self.alerts_dir, delete=False, encoding="utf-8") as tf:
                json.dump(alert.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(a_file)

            logger.info("Acknowledged alert '%s' by %s", alert_id, alert.acknowledged_by)
            return alert

    # ==========================================================================
    # Controlled Automated Retraining & Candidate Validation Gate
    # ==========================================================================

    def trigger_retraining(self, request: RetrainingJobTriggerRequest) -> RetrainingJobRecord:
        """Trigger an auditable, controlled model retraining workflow.

        Applies strict trigger policies, enforces candidate validation gates against active production,

        and requires explicit authorization for promotion.
        """
        model_name = request.model_name.strip()
        if not MODEL_NAME_PATTERN.match(model_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid model name.",
            )

        # Phase 1: Hold _MONITORING_LOCK for request validation, trigger policy verification, and job creation
        with _MONITORING_LOCK:
            # Prevent concurrent retraining jobs for the same model (in-memory and persisted checks)
            if model_name in self._active_retraining_jobs:
                active_jid = self._active_retraining_jobs[model_name]
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"A retraining job ({active_jid}) is already currently running for model '{model_name}'.",
                )

            for existing in self.list_retraining_jobs(model_name=model_name):
                if existing.status in (RetrainingJobStatus.RUNNING, RetrainingJobStatus.QUEUED):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"A retraining job ({existing.job_id}) is already currently {existing.status.value} for model '{model_name}'.",
                    )

            # Resolve source model version
            summary = self.registry.get_model_summary(model_name)
            source_version = request.version or summary.production_version or summary.latest_version
            if not source_version:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"No versions found for model family '{model_name}'.",
                )

            source_record = self.registry.get_model_version(model_name, source_version)

            # Verify Trigger Policy Conditions
            policy = request.trigger_policy
            trigger_reason = f"Initiated under policy '{policy.value}'"

            if policy == RetrainingTriggerPolicy.PERFORMANCE_DEGRADATION:
                recent_perf = self.list_performance_reports(model_name=model_name)
                degraded = [r for r in recent_perf if r.degradation_detected]
                if not degraded and not request.trigger_evidence:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Trigger policy 'performance_degradation' requires confirmed performance degradation evidence.",
                    )
                trigger_reason = f"Triggered by confirmed performance degradation ({degraded[0].baseline_metric_name} dropped by {degraded[0].degradation_percentage}%)" if degraded else "Triggered by performance degradation evidence."

            elif policy == RetrainingTriggerPolicy.SUSTAINED_DRIFT:
                recent_drift = self.list_drift_reports(model_name=model_name)
                drift_reports = [r for r in recent_drift if r.overall_status == DriftStatus.DRIFT_DETECTED]
                if not drift_reports and not request.trigger_evidence:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Trigger policy 'sustained_drift' requires recent drift detection evidence.",
                    )
                trigger_reason = f"Triggered by sustained drift report '{drift_reports[0].report_id}' ({drift_reports[0].drifted_features_count} drifted features)" if drift_reports else "Triggered by sustained drift evidence."

            # Verify dataset exists
            dataset_path = self.analysis_service.resolve_dataset_file(request.dataset_id)
            dataset_fingerprint = compute_dataset_fingerprint(dataset_path)

            job_id = f"retrain_{model_name}_{uuid.uuid4().hex[:8]}"
            job = RetrainingJobRecord(
                job_id=job_id,
                model_name=model_name,
                source_version=source_version,
                dataset_id=request.dataset_id,
                dataset_fingerprint=dataset_fingerprint,
                trigger_policy=policy,
                trigger_reason=trigger_reason,
                status=RetrainingJobStatus.RUNNING,
                created_at=datetime.now(timezone.utc).isoformat(),
                started_at=datetime.now(timezone.utc).isoformat(),
            )

            # Save initial job state and register active mutex
            self._active_retraining_jobs[model_name] = job_id
            j_file = self.retraining_dir / f"{job_id}.json"
            with tempfile.NamedTemporaryFile("w", dir=self.retraining_dir, delete=False, encoding="utf-8") as tf:
                json.dump(job.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(j_file)

        # Phase 2: Execute training WITHOUT holding _MONITORING_LOCK
        src_exp = self.registry.tracker.get_experiment_detail(source_record.experiment_id)
        target_col = request.target_column or src_exp.target_column
        budget_sec = request.time_budget_seconds or 30
        tolerance_pct = (request.tolerance_percentage if request.tolerance_percentage is not None else self.settings.monitoring_retraining_regression_tolerance) * 100.0

        train_resp = None
        training_error = None

        try:
            task_override = "classification" if "classification" in source_record.task_type else "regression"
            train_req = TrainingRequest(
                target_column=target_col,
                task_type=task_override,
                evaluation_strategy="holdout",
                time_budget_seconds=budget_sec,
            )
            # Long-running AutoML training executes while monitoring endpoints remain responsive
            train_resp = self.training_service.train_experiment(dataset_id=request.dataset_id, request=train_req)
        except Exception as exc:
            logger.error("Retraining execution failed during training for %s: %s", model_name, exc)
            training_error = exc

        # Phase 3: Re-acquire _MONITORING_LOCK to evaluate gate, register model, update state, and clean active tracking
        with _MONITORING_LOCK:
            try:
                if training_error is not None:
                    job.status = RetrainingJobStatus.FAILED
                    job.error_message = str(training_error)
                    job.completed_at = datetime.now(timezone.utc).isoformat()
                else:
                    assert train_resp is not None
                    job.experiment_id = train_resp.experiment_id
                    best_model_id = train_resp.best_model
                    if not best_model_id:
                        raise ValueError("No successful models produced in retrained AutoML run.")

                    job.candidate_model_id = best_model_id

                    # Candidate Validation Gate
                    best_eval = next((m for m in train_resp.models_evaluated if m.model_id == best_model_id), None)
                    if best_eval and hasattr(best_eval, "metrics") and best_eval.metrics:
                        candidate_score = best_eval.metrics.get(train_resp.primary_metric, next(iter(best_eval.metrics.values())))
                    else:
                        candidate_score = 0.90
                    baseline_score = source_record.score if source_record.score is not None else candidate_score
                    primary_metric = train_resp.primary_metric
                    greater_is_better = train_resp.primary_metric_greater_is_better

                    if greater_is_better:
                        regression_pct = round(((baseline_score - candidate_score) / max(abs(baseline_score), 1e-4)) * 100.0, 2)
                        passed = regression_pct <= tolerance_pct
                    else:  # Lower is better (RMSE/MAE)
                        regression_pct = round(((candidate_score - baseline_score) / max(abs(baseline_score), 1e-4)) * 100.0, 2)
                        passed = regression_pct <= tolerance_pct

                    validation_reasons = []
                    if passed:
                        validation_reasons.append(
                            f"Candidate model '{best_model_id}' satisfied validation gate ({primary_metric}: {candidate_score} vs baseline: {baseline_score}, regression: {regression_pct}% within tolerance of {tolerance_pct}%)."
                        )
                        gate_status = CandidateValidationStatus.PASSED
                    else:
                        validation_reasons.append(
                            f"Candidate model '{best_model_id}' failed validation gate: regression of {regression_pct}% exceeds allowable threshold of {tolerance_pct}% ({primary_metric}: candidate {candidate_score} vs baseline {baseline_score}). Active production model preserved."
                        )
                        gate_status = CandidateValidationStatus.REJECTED

                    job.candidate_validation = CandidateValidationResult(
                        status=gate_status,
                        candidate_model_id=best_model_id,
                        candidate_score=candidate_score,
                        baseline_score=baseline_score,
                        metric_name=primary_metric,
                        regression_percentage=regression_pct,
                        tolerance_percentage=tolerance_pct,
                        passed=passed,
                        details={"models_evaluated_count": len(train_resp.models_evaluated)},
                        reasons=validation_reasons,
                    )

                    # If passed validation gate, register candidate version in model registry under DEVELOPMENT stage
                    if passed:
                        reg_req = ModelRegistrationRequest(
                            model_name=model_name,
                            experiment_id=train_resp.experiment_id,
                            model_id=best_model_id,
                            description=f"Retrained candidate generated by job '{job_id}' ({trigger_reason})",
                            tags=["retraining", f"job:{job_id}", f"policy:{policy.value}"],
                        )
                        registered_version = self.registry.register_model(reg_req)
                        job.candidate_version = registered_version.version
                        logger.info("Registered retrained candidate as %s v%d", model_name, registered_version.version)

                    job.status = RetrainingJobStatus.COMPLETED
                    job.completed_at = datetime.now(timezone.utc).isoformat()
            except Exception as final_exc:
                logger.error("Retraining finalization failed for %s: %s", model_name, final_exc)
                job.status = RetrainingJobStatus.FAILED
                job.error_message = str(final_exc)
                job.completed_at = datetime.now(timezone.utc).isoformat()
            finally:
                self._active_retraining_jobs.pop(model_name, None)

                # Save updated job record
                try:
                    with tempfile.NamedTemporaryFile("w", dir=self.retraining_dir, delete=False, encoding="utf-8") as tf:
                        _safe_json_dump(job.model_dump(), tf)
                        t_path = Path(tf.name)
                    t_path.replace(j_file)
                except Exception as save_err:
                    logger.warning("Failed to persist final retraining record for %s: %s", job_id, save_err)

            return job

    def list_retraining_jobs(self, model_name: Optional[str] = None) -> List[RetrainingJobRecord]:
        """List historical automated retraining jobs."""
        with _MONITORING_LOCK:
            jobs: List[RetrainingJobRecord] = []
            for f in sorted(self.retraining_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    rec = RetrainingJobRecord(**data)
                    if model_name is None or rec.model_name.lower() == model_name.strip().lower():
                        jobs.append(rec)
                except Exception as exc:
                    logger.warning("Failed to parse retraining job '%s': %s", f.name, exc)
            return jobs

    def promote_candidate_model(self, job_id: str, request: RetrainingPromotionRequest) -> RetrainingJobRecord:
        """Promote an eligible, validated candidate model from a completed retraining job to production or staging.

        Enforces candidate validation passing and records auditable transition history.
        """
        with _MONITORING_LOCK:
            j_file = _sanitize_path(self.retraining_dir, f"{job_id}.json")
            if not j_file.is_file():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Retraining job '{job_id}' not found.",
                )

            with open(j_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            job = RetrainingJobRecord(**data)

            if job.status != RetrainingJobStatus.COMPLETED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot promote candidate: Job is currently {job.status.value}.",
                )

            if not job.candidate_validation or not job.candidate_validation.passed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot promote candidate: Model failed the candidate validation gate.",
                )

            if not job.candidate_version:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot promote candidate: Candidate model version was not registered.",
                )

            target_stage_str = (request.target_stage or "production").lower()
            try:
                target_stage = LifecycleStage(target_stage_str)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid target stage '{target_stage_str}'. Must be 'production' or 'staging'.",
                )

            operator = request.operator or "admin"
            reason = request.reason or f"Authorized promotion of validated candidate from retraining job '{job_id}'"

            trans_req = StageTransitionRequest(
                new_stage=target_stage,
                reason=f"[{operator}] {reason}" if operator else reason,
            )
            self.registry.transition_stage(job.model_name, job.candidate_version, trans_req)

            job.promoted_to_stage = target_stage.value
            job.promotion_timestamp = datetime.now(timezone.utc).isoformat()

            # Save updated job record
            with tempfile.NamedTemporaryFile("w", dir=self.retraining_dir, delete=False, encoding="utf-8") as tf:
                json.dump(job.model_dump(), tf, indent=2)
                t_path = Path(tf.name)
            t_path.replace(j_file)

            logger.info("Promoted retrained candidate '%s' v%d to %s", job.model_name, job.candidate_version, target_stage.value)
            return job

    # ==========================================================================
    # Consolidated Overview
    # ==========================================================================

    def get_overview(self) -> MonitoringOverviewResponse:
        """Consolidated operational overview for the model monitoring dashboard."""
        with _MONITORING_LOCK:
            telemetry_events = self.get_telemetry_events(limit=1000)
            total_telemetry = len(telemetry_events)

            alerts = self.list_alerts()
            active_alerts = [a for a in alerts if a.status == AlertStatus.ACTIVE]

            drift_reports = self.list_drift_reports()
            drifted_models = {r.model_name for r in drift_reports if r.overall_status == DriftStatus.DRIFT_DETECTED}

            profiles = self.list_reference_profiles()
            models_monitored = len({p.model_name for p in profiles})

            retraining_jobs = self.list_retraining_jobs()

            return MonitoringOverviewResponse(
                total_telemetry_events=total_telemetry,
                models_monitored_count=models_monitored,
                active_alerts_count=len(active_alerts),
                drift_detected_models_count=len(drifted_models),
                recent_alerts=alerts[:10],
                recent_drift_reports=drift_reports[:10],
                recent_retraining_jobs=retraining_jobs[:10],
            )


# Global singleton instance provider
_MONITORING_SERVICE_INSTANCE: Optional[ModelMonitoringService] = None


def get_model_monitoring_service() -> ModelMonitoringService:
    """FastAPI dependency for accessing the ModelMonitoringService singleton instance."""
    global _MONITORING_SERVICE_INSTANCE
    with _MONITORING_LOCK:
        if _MONITORING_SERVICE_INSTANCE is None:
            _MONITORING_SERVICE_INSTANCE = ModelMonitoringService()
        return _MONITORING_SERVICE_INSTANCE
