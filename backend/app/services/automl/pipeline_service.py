"""AutoNexa Phase 15 End-to-End Pipeline Orchestration Service.

Manages asynchronous execution, state transitions, reproducibility manifests,
candidate registry integration, monitoring baseline profiling, and failure recovery.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import platform
import re
import sys
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, status
import numpy as np
import pandas as pd
import pydantic
import scipy
import sklearn

from app.core.config import Settings, get_settings
from app.schemas.monitoring import ReferenceProfileCreate
from app.schemas.pipeline import (
    PipelineCreateRequest,
    PipelineEvent,
    PipelineListResponse,
    PipelineProvenance,
    PipelineResponse,
    PipelineStage,
    PipelineStatus,
    PromotionPolicy,
    StageRecord,
)
from app.schemas.tracking import (
    LifecycleStage,
    ModelRegistrationRequest,
    StageTransitionRequest,
)
from app.schemas.training import TrainingRequest
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.experiment_tracker_service import (
    ExperimentTrackerService,
    get_experiment_tracker_service,
)
from app.services.automl.model_monitoring_service import (
    ModelMonitoringService,
    get_model_monitoring_service,
)
from app.services.automl.model_registry_service import (
    ModelRegistryService,
    get_model_registry_service,
)
from app.services.automl.training_service import TrainingService

logger = logging.getLogger("autonexa.pipeline")

# In-process synchronization locks
_PIPELINE_LOCK = threading.RLock()
_EVENT_LOCK = threading.RLock()
MODEL_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


def _sanitize_path(base_dir: Path, filename: str) -> Path:
    """Sanitize and validate that filename resolves strictly within base_dir."""
    safe_name = Path(filename).name
    resolved = (base_dir / safe_name).resolve()
    base_resolved = base_dir.resolve()
    if not (resolved == base_resolved or base_resolved in resolved.parents):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied: Path traversal detected.",
        )
    return resolved


def _safe_json_dump(obj: Any, fp: Any) -> None:
    """Serialize object to JSON, replacing non-compliant IEEE 754 NaNs/Infs with None."""
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


class PipelineService:
    """End-to-end AutoML pipeline orchestration service."""

    def __init__(
        self,
        pipelines_dir: Optional[Path] = None,
        analysis_service: Optional[AnalysisService] = None,
        training_service: Optional[TrainingService] = None,
        tracker_service: Optional[ExperimentTrackerService] = None,
        registry_service: Optional[ModelRegistryService] = None,
        monitoring_service: Optional[ModelMonitoringService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.pipelines_dir: Path = pipelines_dir or self.settings.resolved_pipelines_dir
        self.pipelines_dir.mkdir(parents=True, exist_ok=True)

        self.manifests_dir = self.pipelines_dir / "manifests"
        self.events_dir = self.pipelines_dir / "events"
        self.manifests_dir.mkdir(parents=True, exist_ok=True)
        self.events_dir.mkdir(parents=True, exist_ok=True)

        # Wire domain services
        self.analysis_service: AnalysisService = analysis_service or get_analysis_service()
        self.training_service: TrainingService = training_service or TrainingService(
            upload_dir=self.settings.resolved_upload_dir,
            experiments_dir=self.settings.resolved_experiments_dir,
        )
        self.tracker_service: ExperimentTrackerService = (
            tracker_service or get_experiment_tracker_service()
        )
        self.registry_service: ModelRegistryService = (
            registry_service or get_model_registry_service()
        )
        self.monitoring_service: ModelMonitoringService = (
            monitoring_service or get_model_monitoring_service()
        )

        # In-memory execution registry
        self._active_jobs: Dict[str, str] = {}  # pipeline_id -> "model_name:dataset_id"
        self._cancel_flags: Dict[str, bool] = {} # pipeline_id -> bool
        self._is_shutting_down: bool = False
        self._executor = ThreadPoolExecutor(
            max_workers=self.settings.pipeline_max_concurrency,
            thread_name_prefix="autonexa-pipeline-worker",
        )

        # Recover interrupted/orphaned pipelines from prior process instances
        self.reconcile_orphaned_pipelines()

    @property
    def is_shutting_down(self) -> bool:
        """Indicate whether graceful shutdown is in progress."""
        return self._is_shutting_down

    # ==========================================================================
    # Process Restart & Recovery
    # ==========================================================================

    def reconcile_orphaned_pipelines(self) -> List[str]:
        """Scan persisted pipeline manifests on startup; mark any dangling RUNNING/PENDING jobs as FAILED.

        Returns the list of reconciled pipeline IDs.
        """
        reconciled: List[str] = []
        with _PIPELINE_LOCK:
            for f in sorted(self.manifests_dir.glob("*.json")):
                try:
                    with open(f, "r", encoding="utf-8") as fp:
                        data = json.load(fp)
                    current_status = data.get("status")
                    pid = data.get("pipeline_id", f.stem)

                    # Only reconcile jobs that are NOT actively tracked in the current process
                    if pid in self._active_jobs:
                        continue

                    if current_status in (PipelineStatus.RUNNING.value, PipelineStatus.PENDING.value):
                        now_str = datetime.now(timezone.utc).isoformat()
                        data["status"] = PipelineStatus.FAILED.value
                        data["completed_at"] = now_str
                        data["failure_reason"] = "Process interrupted or restarted while pipeline was running."
                        # Mark active or pending stages as failed
                        stages = data.get("stages", [])
                        for stg in stages:
                            if stg.get("status") in ("running", "pending"):
                                stg["status"] = "failed"
                                stg["completed_at"] = now_str
                                stg["error_details"] = "Server process restarted unexpectedly."

                        with tempfile.NamedTemporaryFile("w", dir=self.manifests_dir, delete=False, encoding="utf-8") as tf:
                            _safe_json_dump(data, tf)
                            t_path = Path(tf.name)
                        t_path.replace(f)

                        self._emit_event_internal(
                            pipeline_id=pid,
                            level="error",
                            message="Pipeline marked FAILED during startup recovery: Process was restarted.",
                        )
                        reconciled.append(pid)
                        logger.info("Reconciled dangling orphaned pipeline '%s' to FAILED.", pid)
                except Exception as exc:
                    logger.warning("Failed to recover pipeline manifest '%s': %s", f.name, exc)
        return reconciled

    def _recover_interrupted_pipelines(self) -> None:
        """Backward-compatible internal alias for reconcile_orphaned_pipelines."""
        self.reconcile_orphaned_pipelines()

    def shutdown(self, wait: bool = True, timeout: float = 10.0) -> None:
        """Gracefully shut down pipeline orchestration, cancelling active jobs and stopping the worker pool."""
        logger.info("Initiating graceful shutdown of PipelineService (timeout=%.1fs)...", timeout)
        with _PIPELINE_LOCK:
            self._is_shutting_down = True
            active_pids = list(self._active_jobs.keys())
            for pid in active_pids:
                self._cancel_flags[pid] = True
                try:
                    pipeline = self._load_pipeline_record(pid)
                    if pipeline.status == PipelineStatus.PENDING:
                        now_iso = datetime.now(timezone.utc).isoformat()
                        pipeline.status = PipelineStatus.CANCELLED
                        pipeline.completed_at = now_iso
                        pipeline.failure_reason = "Cancelled during application shutdown."
                        for stg in pipeline.stages:
                            if stg.status == "pending":
                                stg.status = "cancelled"
                                stg.completed_at = now_iso
                                stg.message = "Cancelled before execution due to server shutdown."
                        self._persist_pipeline(pipeline)
                        self._active_jobs.pop(pid, None)
                        self._emit_event_internal(
                            pipeline_id=pid,
                            level="warning",
                            message="Pending pipeline cancelled due to server shutdown.",
                        )
                except Exception as exc:
                    logger.warning("Error cancelling pending pipeline %s during shutdown: %s", pid, exc)

        def _drain_executor() -> None:
            try:
                self._executor.shutdown(wait=wait, cancel_futures=True)
            except Exception as drain_err:
                logger.warning("Error draining executor during shutdown: %s", drain_err)

        drain_thread = threading.Thread(target=_drain_executor, daemon=True, name="pipeline-shutdown-drain")
        drain_thread.start()
        drain_thread.join(timeout=timeout)

        if drain_thread.is_alive():
            logger.warning(
                "PipelineService worker pool did not terminate within %.1fs timeout; continuing bounded shutdown.",
                timeout,
            )
        else:
            logger.info("PipelineService worker pool terminated cleanly.")

        # Reconcile any remaining in-flight jobs that did not complete
        with _PIPELINE_LOCK:
            remaining_pids = list(self._active_jobs.keys())
            now_iso = datetime.now(timezone.utc).isoformat()
            for pid in remaining_pids:
                try:
                    pipeline = self._load_pipeline_record(pid)
                    if pipeline.status in (PipelineStatus.RUNNING, PipelineStatus.PENDING):
                        pipeline.status = PipelineStatus.CANCELLED
                        pipeline.completed_at = now_iso
                        pipeline.failure_reason = "Execution stopped due to application shutdown."
                        for stg in pipeline.stages:
                            if stg.status in ("running", "pending"):
                                stg.status = "cancelled"
                                stg.completed_at = now_iso
                                stg.error_details = "Application shutdown while stage was active."
                        self._persist_pipeline(pipeline)
                        self._emit_event_internal(
                            pipeline_id=pid,
                            stage=pipeline.current_stage,
                            level="warning",
                            message="Pipeline cancelled due to application shutdown.",
                        )
                except Exception as exc:
                    logger.warning("Error finalizing pipeline %s during shutdown: %s", pid, exc)
                finally:
                    self._active_jobs.pop(pid, None)

    # ==========================================================================
    # Event Logging
    # ==========================================================================

    def _emit_event_internal(
        self,
        pipeline_id: str,
        message: str,
        level: str = "info",
        stage: Optional[PipelineStage] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> PipelineEvent:
        """Append an event to the chronological pipeline event log."""
        event = PipelineEvent(
            event_id=str(uuid.uuid4()),
            pipeline_id=pipeline_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            stage=stage,
            level=level,
            message=message,
            details=details,
        )
        with _EVENT_LOCK:
            try:
                ev_file = _sanitize_path(self.events_dir, f"{pipeline_id}.jsonl")
                with open(ev_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps(event.model_dump()) + "\n")
            except Exception as exc:
                logger.warning("Failed to persist pipeline event for %s: %s", pipeline_id, exc)
        return event

    def get_pipeline_events(self, pipeline_id: str, limit: int = 100) -> List[PipelineEvent]:
        """Retrieve bounded chronological execution events for a pipeline."""
        ev_file = _sanitize_path(self.events_dir, f"{pipeline_id}.jsonl")
        events: List[PipelineEvent] = []
        if ev_file.is_file():
            with _EVENT_LOCK:
                try:
                    with open(ev_file, "r", encoding="utf-8") as f:
                        lines = f.readlines()
                    for line in lines[-limit:]:
                        line_str = line.strip()
                        if line_str:
                            events.append(PipelineEvent(**json.loads(line_str)))
                except Exception as exc:
                    logger.warning("Failed to read pipeline events for %s: %s", pipeline_id, exc)
        return events

    # ==========================================================================
    # Persistence Helpers
    # ==========================================================================

    def _persist_pipeline(self, pipeline: PipelineResponse) -> None:
        """Atomically persist pipeline execution state to disk with Windows file contention safety."""
        with _PIPELINE_LOCK:
            target_file = _sanitize_path(self.manifests_dir, f"{pipeline.pipeline_id}.json")
            with tempfile.NamedTemporaryFile("w", dir=self.manifests_dir, delete=False, encoding="utf-8") as tf:
                _safe_json_dump(pipeline.model_dump(), tf)
                t_path = Path(tf.name)

            for attempt in range(6):
                try:
                    t_path.replace(target_file)
                    break
                except (PermissionError, OSError):
                    if attempt == 5:
                        try:
                            with open(target_file, "w", encoding="utf-8") as f_out:
                                _safe_json_dump(pipeline.model_dump(), f_out)
                            if t_path.is_file():
                                t_path.unlink(missing_ok=True)
                        except Exception as exc:
                            logger.warning("Fallback persistence failed for %s: %s", pipeline.pipeline_id, exc)
                    else:
                        time.sleep(0.05 * (attempt + 1))

    def _load_pipeline_record(self, pipeline_id: str) -> PipelineResponse:
        """Load a persisted pipeline record or raise HTTP 404."""
        target_file = _sanitize_path(self.manifests_dir, f"{pipeline_id}.json")
        if not target_file.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline execution '{pipeline_id}' was not found.",
            )

        for attempt in range(5):
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return PipelineResponse(**data)
            except (PermissionError, OSError, json.JSONDecodeError) as exc:
                if attempt == 4:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to read pipeline record '{pipeline_id}': {exc}",
                    ) from exc
                time.sleep(0.03 * (attempt + 1))
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to read pipeline record '{pipeline_id}': {exc}",
                ) from exc

    # ==========================================================================
    # Pipeline Orchestration Core
    # ==========================================================================

    def create_pipeline(self, request: PipelineCreateRequest) -> PipelineResponse:
        """Validate configuration, initialize pipeline state, and enqueue asynchronous execution."""
        if self._is_shutting_down:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Server is shutting down; new pipeline submissions are rejected.",
            )

        model_name = request.model_name.strip()
        if not MODEL_NAME_PATTERN.match(model_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid model name. Only alphanumeric characters, hyphens, and underscores are allowed.",
            )

        # Validate dataset existence
        dataset_path = self.analysis_service.resolve_dataset_file(request.dataset_id)
        if not dataset_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset '{request.dataset_id}' not found.",
            )

        # Strict scientific safeguard from Phase 14: holdout/test partition cannot be used for reference baseline
        if request.create_reference_profile:
            if request.monitoring_split_source.strip().lower() in ("test", "holdout", "holdout_test", "test_set"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Scientific violation: Holdout test sets cannot be used for reference baseline profiling to prevent data leakage.",
                )

        target_mutex_key = f"{model_name}:{request.dataset_id}"

        with _PIPELINE_LOCK:
            # Concurrency protection: Check if an active pipeline exists for the same target
            if target_mutex_key in self._active_jobs.values():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"An active pipeline execution is already in flight for model family '{model_name}' "
                        f"and dataset '{request.dataset_id}'. Concurrent duplicate runs are prohibited."
                    ),
                )

            pipeline_id = f"pipe-{uuid.uuid4().hex[:12]}"
            now_str = datetime.now(timezone.utc).isoformat()

            # Initialize stage blueprint
            all_stages: List[PipelineStage] = [
                PipelineStage.DATASET_VALIDATION,
                PipelineStage.PROVENANCE_INITIALIZATION,
                PipelineStage.TRAINING,
                PipelineStage.EVALUATION,
                PipelineStage.EXPERIMENT_MANIFEST,
                PipelineStage.REGISTRY_REGISTRATION,
                PipelineStage.PROMOTION_GATE,
                PipelineStage.MONITORING_INITIALIZATION,
                PipelineStage.COMPLETED,
            ]
            stage_records = [
                StageRecord(stage=stg, status="pending", message="Queued for execution")
                for stg in all_stages
            ]

            pipeline = PipelineResponse(
                pipeline_id=pipeline_id,
                status=PipelineStatus.PENDING,
                current_stage=PipelineStage.DATASET_VALIDATION,
                model_name=model_name,
                dataset_id=request.dataset_id,
                target_column=request.target_column,
                task_type=request.task_type,
                stages=stage_records,
                created_at=now_str,
                description=request.description,
            )

            self._persist_pipeline(pipeline)
            self._active_jobs[pipeline_id] = target_mutex_key
            self._cancel_flags[pipeline_id] = False

        self._emit_event_internal(
            pipeline_id=pipeline_id,
            level="info",
            message=f"Pipeline initialized for model '{model_name}' and dataset '{request.dataset_id}'.",
        )

        # Launch background execution worker
        self._executor.submit(self._execute_pipeline_worker, pipeline_id, request)

        return pipeline

    def _execute_pipeline_worker(self, pipeline_id: str, request: PipelineCreateRequest) -> None:
        """Sequential background execution engine for AutoML pipeline stages."""
        with _PIPELINE_LOCK:
            pipeline = self._load_pipeline_record(pipeline_id)
            if self._cancel_flags.get(pipeline_id, False) or pipeline.status == PipelineStatus.CANCELLED:
                logger.info("Pipeline %s cancelled prior to worker thread execution.", pipeline_id)
                self._active_jobs.pop(pipeline_id, None)
                return
            now_dt = datetime.now(timezone.utc)
            pipeline.status = PipelineStatus.RUNNING
            pipeline.started_at = now_dt.isoformat()
            self._persist_pipeline(pipeline)

        def _is_cancelled() -> bool:
            return self._cancel_flags.get(pipeline_id, False)

        def _get_stage_idx(target_stage: PipelineStage) -> int:
            for idx, s in enumerate(pipeline.stages):
                if s.stage == target_stage:
                    return idx
            return -1

        def _mark_stage_start(stg: PipelineStage) -> None:
            pipeline.current_stage = stg
            idx = _get_stage_idx(stg)
            if idx >= 0:
                pipeline.stages[idx].status = "running"
                pipeline.stages[idx].started_at = datetime.now(timezone.utc).isoformat()
            self._persist_pipeline(pipeline)
            self._emit_event_internal(
                pipeline_id=pipeline_id,
                stage=stg,
                level="info",
                message=f"Stage '{stg.value}' started.",
            )

        def _mark_stage_success(stg: PipelineStage, msg: str, meta: Optional[Dict[str, Any]] = None) -> None:
            idx = _get_stage_idx(stg)
            now_iso = datetime.now(timezone.utc).isoformat()
            if idx >= 0:
                pipeline.stages[idx].status = "succeeded"
                pipeline.stages[idx].completed_at = now_iso
                pipeline.stages[idx].message = msg
                if meta:
                    pipeline.stages[idx].metadata.update(meta)
                if pipeline.stages[idx].started_at:
                    start_dt = datetime.fromisoformat(pipeline.stages[idx].started_at)
                    pipeline.stages[idx].duration_seconds = round(
                        (datetime.now(timezone.utc) - start_dt).total_seconds(), 2
                    )
            self._persist_pipeline(pipeline)
            self._emit_event_internal(
                pipeline_id=pipeline_id,
                stage=stg,
                level="info",
                message=f"Stage '{stg.value}' succeeded: {msg}",
                details=meta,
            )

        def _mark_stage_skipped(stg: PipelineStage, msg: str) -> None:
            idx = _get_stage_idx(stg)
            if idx >= 0:
                pipeline.stages[idx].status = "skipped"
                pipeline.stages[idx].message = msg
                pipeline.stages[idx].completed_at = datetime.now(timezone.utc).isoformat()
            self._persist_pipeline(pipeline)
            self._emit_event_internal(
                pipeline_id=pipeline_id,
                stage=stg,
                level="info",
                message=f"Stage '{stg.value}' skipped: {msg}",
            )

        def _fail_pipeline(stg: PipelineStage, err_msg: str, tb_str: Optional[str] = None) -> None:
            idx = _get_stage_idx(stg)
            now_iso = datetime.now(timezone.utc).isoformat()
            if idx >= 0:
                pipeline.stages[idx].status = "failed"
                pipeline.stages[idx].completed_at = now_iso
                pipeline.stages[idx].error_details = tb_str or err_msg
                pipeline.stages[idx].message = f"Failed: {err_msg}"
            pipeline.status = PipelineStatus.FAILED
            pipeline.failure_reason = err_msg
            pipeline.completed_at = now_iso
            if pipeline.started_at:
                start_dt = datetime.fromisoformat(pipeline.started_at)
                pipeline.duration_seconds = round((datetime.now(timezone.utc) - start_dt).total_seconds(), 2)
            self._persist_pipeline(pipeline)
            self._emit_event_internal(
                pipeline_id=pipeline_id,
                stage=stg,
                level="error",
                message=f"Pipeline FAILED at stage '{stg.value}': {err_msg}",
            )

        try:
            # ------------------------------------------------------------------
            # Stage 1: DATASET_VALIDATION
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.DATASET_VALIDATION)
            dataset_path = self.analysis_service.resolve_dataset_file(request.dataset_id)
            df = self.analysis_service.load_dataset(dataset_path)

            if len(df) < 20:
                raise ValueError(f"Dataset has {len(df)} rows, which is below the minimum required sample size (20).")

            if request.target_column not in df.columns:
                raise ValueError(
                    f"Target column '{request.target_column}' does not exist in dataset. "
                    f"Available columns: {list(df.columns)}"
                )

            # Inferred or validated task type
            target_series = df[request.target_column].dropna()
            is_numeric = pd.api.types.is_numeric_dtype(target_series)
            distinct_count = target_series.nunique()

            resolved_task = request.task_type
            if resolved_task is None:
                if not is_numeric or distinct_count <= 10:
                    resolved_task = "classification"
                else:
                    resolved_task = "regression"

            if resolved_task == "classification" and distinct_count < 2:
                raise ValueError(f"Classification target '{request.target_column}' must have at least 2 distinct classes.")

            pipeline.task_type = resolved_task
            _mark_stage_success(
                PipelineStage.DATASET_VALIDATION,
                f"Validated {len(df)} rows and {len(df.columns)} columns. Task resolved to '{resolved_task}'.",
                meta={"row_count": len(df), "column_count": len(df.columns), "task_type": resolved_task},
            )

            # ------------------------------------------------------------------
            # Stage 2: PROVENANCE_INITIALIZATION
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.PROVENANCE_INITIALIZATION)
            with open(dataset_path, "rb") as f_data:
                dataset_sha256 = hashlib.sha256(f_data.read()).hexdigest()

            training_cfg = request.training_config or {}
            canonical_cfg_str = json.dumps(training_cfg, sort_keys=True)
            config_sha256 = hashlib.sha256(canonical_cfg_str.encode("utf-8")).hexdigest()
            random_seed = int(training_cfg.get("random_state", 42))

            env_info = {
                "python_version": sys.version.split()[0],
                "platform": platform.platform(),
                "scikit_learn": sklearn.__version__,
                "pandas": pd.__version__,
                "numpy": np.__version__,
                "scipy": scipy.__version__,
                "pydantic": pydantic.__version__,
            }

            provenance = PipelineProvenance(
                pipeline_id=pipeline_id,
                dataset_id=request.dataset_id,
                dataset_fingerprint=dataset_sha256,
                config_fingerprint=config_sha256,
                random_seed=random_seed,
                target_column=request.target_column,
                task_type=resolved_task,
                training_config=training_cfg,
                environment_info=env_info,
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            pipeline.provenance = provenance
            _mark_stage_success(
                PipelineStage.PROVENANCE_INITIALIZATION,
                f"Provenance initialized (dataset SHA-256: {dataset_sha256[:12]}..., seed: {random_seed}).",
                meta={"dataset_sha256": dataset_sha256, "config_sha256": config_sha256, "seed": random_seed},
            )

            # ------------------------------------------------------------------
            # Stage 3: TRAINING
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.TRAINING)
            train_req_dict = dict(training_cfg)
            train_req_dict["target_column"] = request.target_column
            train_req_dict["task_type"] = resolved_task
            train_req = TrainingRequest(**train_req_dict)

            training_resp = self.training_service.train_experiment(dataset_id=request.dataset_id, request=train_req)
            best_res = next(
                (m for m in training_resp.models_evaluated if m.model_id == training_resp.best_model),
                None,
            )
            metric_val = None
            if best_res:
                if training_resp.primary_metric in best_res.metrics:
                    metric_val = float(best_res.metrics[training_resp.primary_metric])
                elif best_res.cv_mean is not None:
                    metric_val = float(best_res.cv_mean)
                elif best_res.metrics:
                    metric_val = float(list(best_res.metrics.values())[0])

            pipeline.experiment_id = training_resp.experiment_id
            pipeline.primary_metric = training_resp.primary_metric
            pipeline.metric_value = metric_val

            _mark_stage_success(
                PipelineStage.TRAINING,
                f"AutoML search completed: best model '{training_resp.best_model}' achieved {training_resp.primary_metric}={metric_val}.",
                meta={
                    "experiment_id": training_resp.experiment_id,
                    "best_model": training_resp.best_model,
                    "primary_metric": training_resp.primary_metric,
                    "best_score": metric_val,
                },
            )

            # ------------------------------------------------------------------
            # Stage 4: EVALUATION
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.EVALUATION)
            if metric_val is None or np.isnan(metric_val):
                raise ValueError("Winning candidate model produced invalid or NaN metric score.")

            _mark_stage_success(
                PipelineStage.EVALUATION,
                f"Evaluation criteria verified for candidate model '{training_resp.best_model}'.",
                meta={"score": metric_val},
            )

            # ------------------------------------------------------------------
            # Stage 5: EXPERIMENT_MANIFEST
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.EXPERIMENT_MANIFEST)
            exp_detail = self.tracker_service.get_experiment_detail(training_resp.experiment_id)

            # Verify artifact presence and compute checksum
            artifact_checksum = None
            if exp_detail.artifacts and isinstance(exp_detail.artifacts, dict):
                artifact_checksum = exp_detail.artifacts.get("model_sha256")

            if not artifact_checksum:
                art_file = self.tracker_service.base_dir / training_resp.experiment_id / "best_model.joblib"
                if art_file.is_file():
                    with open(art_file, "rb") as af:
                        artifact_checksum = hashlib.sha256(af.read()).hexdigest()
            pipeline.artifact_checksum = artifact_checksum

            _mark_stage_success(
                PipelineStage.EXPERIMENT_MANIFEST,
                f"Linked experiment '{training_resp.experiment_id}' with artifact SHA-256 {str(artifact_checksum)[:12]}...",
                meta={"experiment_id": training_resp.experiment_id, "artifact_checksum": artifact_checksum},
            )

            # ------------------------------------------------------------------
            # Stage 6: REGISTRY_REGISTRATION
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            if request.auto_register:
                _mark_stage_start(PipelineStage.REGISTRY_REGISTRATION)
                init_stage = LifecycleStage.DEVELOPMENT
                if request.initial_registry_stage and request.initial_registry_stage.lower() == "staging":
                    init_stage = LifecycleStage.STAGING

                reg_req = ModelRegistrationRequest(
                    model_name=request.model_name,
                    experiment_id=training_resp.experiment_id,
                    description=f"AutoNexa Pipeline '{pipeline_id}' candidate",
                    tags=[f"pipeline_id:{pipeline_id}", f"dataset_id:{request.dataset_id}"],
                    initial_stage=init_stage,
                )
                model_ver = self.registry_service.register_model(reg_req)

                pipeline.model_version = model_ver.version
                pipeline.model_stage = model_ver.stage.value

                _mark_stage_success(
                    PipelineStage.REGISTRY_REGISTRATION,
                    f"Registered candidate version {model_ver.version} in '{model_ver.stage.value}' stage.",
                    meta={"version": model_ver.version, "stage": model_ver.stage.value},
                )
            else:
                _mark_stage_skipped(PipelineStage.REGISTRY_REGISTRATION, "Auto-registration disabled by user.")

            # ------------------------------------------------------------------
            # Stage 7: PROMOTION_GATE
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            _mark_stage_start(PipelineStage.PROMOTION_GATE)
            policy = request.promotion_policy or PromotionPolicy.MANUAL

            if policy == PromotionPolicy.MANUAL or not request.auto_register:
                _mark_stage_success(
                    PipelineStage.PROMOTION_GATE,
                    "Manual promotion policy: Model remains in candidate development stage.",
                )
            elif policy == PromotionPolicy.AUTO_STAGING:
                if pipeline.model_stage != LifecycleStage.STAGING.value and pipeline.model_version:
                    staged_ver = self.registry_service.transition_stage(
                        model_name=request.model_name,
                        version=pipeline.model_version,
                        request=StageTransitionRequest(
                            new_stage=LifecycleStage.STAGING,
                            reason="Automated promotion gate: Stage promotion approved.",
                        ),
                    )
                    pipeline.model_stage = staged_ver.stage.value
                _mark_stage_success(PipelineStage.PROMOTION_GATE, "Model automatically promoted to staging.")
            elif policy == PromotionPolicy.AUTO_PRODUCTION:
                # Rigorous validation gate: Check performance against incumbent production model
                summary = self.registry_service.get_model_summary(request.model_name)
                prod_ver_num = summary.production_version

                promote_to_prod = True
                gate_reason = "No incumbent production model found; initial production candidate approved."

                if prod_ver_num is not None and prod_ver_num != pipeline.model_version:
                    prod_rec = self.registry_service.get_model_version(request.model_name, prod_ver_num)
                    prod_exp = self.tracker_service.get_experiment_detail(prod_rec.experiment_id)
                    baseline_score = getattr(prod_exp, "best_score", None)

                    if baseline_score is not None and pipeline.metric_value is not None:
                        # Determine if metric is higher-is-better
                        higher_is_better = True
                        if pipeline.primary_metric and pipeline.primary_metric.lower() in ("rmse", "mae", "mse", "log_loss"):
                            higher_is_better = False

                        tolerance = request.candidate_tolerance_pct / 100.0
                        if higher_is_better:
                            threshold = baseline_score * (1.0 - tolerance)
                            passed = pipeline.metric_value >= threshold
                        else:
                            threshold = baseline_score * (1.0 + tolerance)
                            passed = pipeline.metric_value <= threshold

                        if not passed:
                            promote_to_prod = False
                            gate_reason = (
                                f"Candidate metric ({pipeline.metric_value}) degraded beyond permissible "
                                f"tolerance ({request.candidate_tolerance_pct}%) vs incumbent v{prod_ver_num} "
                                f"({baseline_score}). Preserving active production model."
                            )
                        else:
                            gate_reason = (
                                f"Candidate metric ({pipeline.metric_value}) verified within tolerance of "
                                f"incumbent v{prod_ver_num} ({baseline_score})."
                            )

                if promote_to_prod and pipeline.model_version:
                    prod_ver = self.registry_service.transition_stage(
                        model_name=request.model_name,
                        version=pipeline.model_version,
                        request=StageTransitionRequest(
                            new_stage=LifecycleStage.PRODUCTION,
                            reason=f"Automated promotion gate: {gate_reason}",
                        ),
                    )
                    pipeline.model_stage = prod_ver.stage.value
                    _mark_stage_success(PipelineStage.PROMOTION_GATE, f"Promoted to production. {gate_reason}")
                else:
                    _mark_stage_success(
                        PipelineStage.PROMOTION_GATE,
                        f"Candidate preserved in candidate stage. {gate_reason}",
                    )

            # ------------------------------------------------------------------
            # Stage 8: MONITORING_INITIALIZATION
            # ------------------------------------------------------------------
            if _is_cancelled():
                raise InterruptedError("Pipeline cancelled by operator.")

            if request.create_reference_profile and pipeline.model_version is not None:
                _mark_stage_start(PipelineStage.MONITORING_INITIALIZATION)
                ref_create = ReferenceProfileCreate(
                    model_name=request.model_name,
                    version=pipeline.model_version,
                    dataset_id=request.dataset_id,
                    split_source=request.monitoring_split_source,
                    description=f"Auto-generated reference baseline for Pipeline '{pipeline_id}'",
                )
                ref_profile = self.monitoring_service.create_reference_profile(ref_create)
                pipeline.reference_profile_id = ref_profile.profile_id

                _mark_stage_success(
                    PipelineStage.MONITORING_INITIALIZATION,
                    f"Established baseline distribution profile '{ref_profile.profile_id}' for model v{pipeline.model_version}.",
                    meta={"profile_id": ref_profile.profile_id},
                )
            else:
                _mark_stage_skipped(PipelineStage.MONITORING_INITIALIZATION, "Monitoring initialization skipped.")

            # ------------------------------------------------------------------
            # Stage 9: COMPLETED
            # ------------------------------------------------------------------
            _mark_stage_start(PipelineStage.COMPLETED)
            pipeline.status = PipelineStatus.SUCCEEDED
            pipeline.completed_at = datetime.now(timezone.utc).isoformat()
            if pipeline.started_at:
                start_dt = datetime.fromisoformat(pipeline.started_at)
                pipeline.duration_seconds = round((datetime.now(timezone.utc) - start_dt).total_seconds(), 2)

            _mark_stage_success(
                PipelineStage.COMPLETED,
                f"End-to-end pipeline finished successfully in {pipeline.duration_seconds} seconds.",
            )

        except InterruptedError as int_exc:
            now_iso = datetime.now(timezone.utc).isoformat()
            pipeline.status = PipelineStatus.CANCELLED
            pipeline.completed_at = now_iso
            pipeline.failure_reason = str(int_exc)
            idx = _get_stage_idx(pipeline.current_stage)
            if idx >= 0 and pipeline.stages[idx].status in ("running", "pending"):
                pipeline.stages[idx].status = "cancelled"
                pipeline.stages[idx].completed_at = now_iso
                pipeline.stages[idx].message = f"Cancelled: {int_exc}"
            if pipeline.started_at:
                start_dt = datetime.fromisoformat(pipeline.started_at)
                pipeline.duration_seconds = round((datetime.now(timezone.utc) - start_dt).total_seconds(), 2)
            self._persist_pipeline(pipeline)
            self._emit_event_internal(
                pipeline_id=pipeline_id,
                stage=pipeline.current_stage,
                level="warning",
                message=f"Pipeline execution cancelled: {int_exc}",
            )
        except Exception as exc:
            logger.exception("Pipeline execution failed: %s", exc)
            _fail_pipeline(pipeline.current_stage, str(exc))
        finally:
            with _PIPELINE_LOCK:
                self._active_jobs.pop(pipeline_id, None)

    # ==========================================================================
    # Management Operations: Cancel, Retry, Query
    # ==========================================================================

    def cancel_pipeline(self, pipeline_id: str) -> PipelineResponse:
        """Request cooperative cancellation of an in-flight or queued pipeline."""
        with _PIPELINE_LOCK:
            pipeline = self._load_pipeline_record(pipeline_id)

            if pipeline.status in (PipelineStatus.SUCCEEDED, PipelineStatus.FAILED, PipelineStatus.CANCELLED) or self._cancel_flags.get(pipeline_id, False):
                status_val = pipeline.status.value if hasattr(pipeline.status, "value") else str(pipeline.status)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot cancel pipeline '{pipeline_id}' because it is already in '{status_val}' state or cancellation is in progress.",
                )

            self._cancel_flags[pipeline_id] = True

            # If pending, transition immediately
            if pipeline.status == PipelineStatus.PENDING:
                pipeline.status = PipelineStatus.CANCELLED
                pipeline.completed_at = datetime.now(timezone.utc).isoformat()
                pipeline.failure_reason = "Cancelled by operator before execution started."
                self._active_jobs.pop(pipeline_id, None)
                self._persist_pipeline(pipeline)

        self._emit_event_internal(
            pipeline_id=pipeline_id,
            level="warning",
            message="Operator requested cooperative pipeline cancellation.",
        )
        return pipeline

    def retry_pipeline(self, pipeline_id: str) -> PipelineResponse:
        """Safely retry an eligible failed or cancelled pipeline execution."""
        with _PIPELINE_LOCK:
            if self._is_shutting_down:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Server is shutting down; pipeline retries are rejected.",
                )

            pipeline = self._load_pipeline_record(pipeline_id)

            if pipeline.status not in (PipelineStatus.FAILED, PipelineStatus.CANCELLED):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot retry pipeline '{pipeline_id}'. Only 'failed' or 'cancelled' pipelines are eligible for retry.",
                )

            target_mutex_key = f"{pipeline.model_name}:{pipeline.dataset_id}"
            if target_mutex_key in self._active_jobs.values():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"An active pipeline execution is already running for model '{pipeline.model_name}' "
                        f"and dataset '{pipeline.dataset_id}'. Retry is blocked until active run completes."
                    ),
                )

            # Reset execution fields
            pipeline.retry_count += 1
            pipeline.status = PipelineStatus.PENDING
            pipeline.failure_reason = None
            pipeline.completed_at = None
            pipeline.duration_seconds = None

            # Reset all stage records to pending
            for stg in pipeline.stages:
                stg.status = "pending"
                stg.started_at = None
                stg.completed_at = None
                stg.duration_seconds = None
                stg.message = "Queued for retry"
                stg.error_details = None

            pipeline.current_stage = PipelineStage.DATASET_VALIDATION
            self._persist_pipeline(pipeline)
            self._active_jobs[pipeline_id] = target_mutex_key
            self._cancel_flags[pipeline_id] = False

        self._emit_event_internal(
            pipeline_id=pipeline_id,
            level="info",
            message=f"Pipeline retry #{pipeline.retry_count} triggered by operator.",
        )

        # Reconstruct PipelineCreateRequest from provenance or pipeline metadata
        training_cfg = pipeline.provenance.training_config if pipeline.provenance else {}
        req = PipelineCreateRequest(
            dataset_id=pipeline.dataset_id,
            target_column=pipeline.target_column,
            model_name=pipeline.model_name,
            task_type="classification" if pipeline.task_type == "classification" else "regression",
            training_config=training_cfg,
            auto_register=True,
            initial_registry_stage="development",
            promotion_policy=PromotionPolicy.MANUAL,
            create_reference_profile=True,
            description=pipeline.description,
        )

        self._executor.submit(self._execute_pipeline_worker, pipeline_id, req)
        return pipeline

    def get_pipeline(self, pipeline_id: str) -> PipelineResponse:
        """Retrieve full status, stage records, and provenance manifest for a pipeline."""
        return self._load_pipeline_record(pipeline_id)

    def list_pipelines(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        model_name: Optional[str] = None,
        dataset_id: Optional[str] = None,
    ) -> PipelineListResponse:
        """Query and paginate recorded pipeline executions with optional filtering."""
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        records: List[PipelineResponse] = []
        with _PIPELINE_LOCK:
            files = sorted(self.manifests_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for f in files:
                data = None
                for attempt in range(4):
                    try:
                        with open(f, "r", encoding="utf-8") as fp:
                            data = json.load(fp)
                        break
                    except (PermissionError, OSError, json.JSONDecodeError):
                        if attempt < 3:
                            time.sleep(0.02 * (attempt + 1))
                    except Exception as exc:
                        logger.warning("Failed to parse pipeline file %s: %s", f.name, exc)
                        break

                if data is None:
                    continue

                try:
                    rec = PipelineResponse(**data)

                    # Filters
                    if status and rec.status.value.lower() != status.strip().lower():
                        continue
                    if model_name and rec.model_name.lower() != model_name.strip().lower():
                        continue
                    if dataset_id and rec.dataset_id != dataset_id.strip():
                        continue

                    records.append(rec)
                except Exception as exc:
                    logger.warning("Failed to parse pipeline file %s: %s", f.name, exc)

        total = len(records)
        paginated = records[offset : offset + limit]

        return PipelineListResponse(
            total=total,
            limit=limit,
            offset=offset,
            pipelines=paginated,
        )


_PIPELINE_SERVICE_INSTANCE: Optional[PipelineService] = None


def get_pipeline_service() -> PipelineService:
    """Return singleton PipelineService instance."""
    global _PIPELINE_SERVICE_INSTANCE
    if _PIPELINE_SERVICE_INSTANCE is None:
        _PIPELINE_SERVICE_INSTANCE = PipelineService()
    return _PIPELINE_SERVICE_INSTANCE


def reset_pipeline_service() -> None:
    """Reset the singleton PipelineService instance (used during shutdown or test teardown)."""
    global _PIPELINE_SERVICE_INSTANCE
    _PIPELINE_SERVICE_INSTANCE = None
