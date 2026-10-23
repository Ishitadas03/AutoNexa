import logging
import os
import platform
import sys
import time
from typing import Any, Dict

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select, text

logger = logging.getLogger(__name__)

from app.core.config import get_settings, settings
from app.core.correlation import get_correlation_id
from app.core.logging import sanitize_exception
from app.core.metrics import get_metrics_collector
from app.core.security import require_admin_role, require_inference_role
from app.db.models import DatasetModel, ExperimentModel, PipelineModel, SchemaVersionModel
from app.db.session import get_db_context
from app.schemas.health import (
    DiagnosticsResponse,
    HealthResponse,
    MetricsResponse,
    ReadinessResponse,
)
from app.services.automl.pipeline_service import get_pipeline_service

router = APIRouter(tags=["Health & Diagnostics"])

_PROCESS_START_TIME = time.time()


# -----------------------------------------------------------------------------
# 1. Public Health Check (Liveness Probe)
# -----------------------------------------------------------------------------

@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Application Health Check",
    description="Returns public operational status without exposing internal paths or credentials.",
)
async def health_check() -> HealthResponse:
    """Validate that the application process is live and responsive."""
    return HealthResponse(
        status="healthy",
        app_name=settings.app_name,
        version=settings.app_version,
    )


# -----------------------------------------------------------------------------
# 2. Authenticated Readiness Check (Readiness Probe)
# -----------------------------------------------------------------------------

@router.get(
    "/health/readiness",
    response_model=ReadinessResponse,
    status_code=status.HTTP_200_OK,
    summary="Application Readiness Probe",
    description="Inspects database connectivity, artifact directory writeability, and worker lifecycle.",
)
async def readiness_check(
    response: Response,
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ReadinessResponse:
    """Evaluate application readiness for ingress traffic routing."""
    curr_settings = get_settings()
    collector = get_metrics_collector()

    # 1. Database connectivity & query latency
    db_ok = False
    db_latency_ms = 0.0
    db_details = None
    t0 = time.perf_counter()
    try:
        with get_db_context() as session:
            session.execute(text("SELECT 1")).scalar()
            db_latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            db_ok = True
            collector.record_db_operation(error=False)
    except Exception as exc:
        db_details = sanitize_exception(exc)
        collector.record_db_operation(error=True)

    # 2. Storage writeability
    storage_ok = False
    storage_writable = False
    storage_details = None
    try:
        upload_dir = curr_settings.resolved_upload_dir
        artifacts_dir = getattr(curr_settings, "resolved_artifacts_dir", curr_settings.resolved_experiments_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        test_file = artifacts_dir / f".readiness_test_{os.getpid()}"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)

        storage_ok = True
        storage_writable = True
    except Exception as exc:
        storage_details = sanitize_exception(exc)

    # 3. Pipeline lifecycle
    pipeline_service = get_pipeline_service()
    is_shutdown = bool(getattr(pipeline_service, "is_shutting_down", getattr(pipeline_service, "_is_shutdown", False)))
    active_pipelines = pipeline_service.get_active_count() if hasattr(pipeline_service, "get_active_count") else 0
    lifecycle_ok = not is_shutdown

    is_ready = db_ok and storage_writable and lifecycle_ok

    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        readiness_status = "unhealthy" if not db_ok else "degraded"
    else:
        readiness_status = "ready"

    return ReadinessResponse(
        status=readiness_status,
        ready=is_ready,
        checks={
            "database": {
                "status": "ok" if db_ok else "unhealthy",
                "latency_ms": db_latency_ms if db_ok else None,
                "error": db_details,
            },
            "storage": {
                "status": "ok" if storage_ok else "degraded",
                "accessible": storage_ok,
                "writable": storage_writable,
                "error": storage_details,
            },
            "lifecycle": {
                "status": "ok" if lifecycle_ok else "draining",
                "state": "running" if not is_shutdown else "shutting_down",
                "active_pipelines": active_pipelines,
            },
        },
        timestamp=round(time.time(), 3),
    )


# -----------------------------------------------------------------------------
# 3. Privileged Diagnostics (Admin Role Restricted)
# -----------------------------------------------------------------------------

@router.get(
    "/health/diagnostics",
    response_model=DiagnosticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Privileged Operational Diagnostics",
    description="Detailed operational diagnostic inspection for administrators and system operators.",
)
async def diagnostics_check(
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> DiagnosticsResponse:
    """Deep system diagnostic report for administrators."""
    curr_settings = get_settings()
    uptime_sec = round(max(0.0, time.time() - _PROCESS_START_TIME), 2)

    # Database table row counts & version
    db_connected = False
    table_counts: Dict[str, int] = {}
    schema_version: Optional[int] = None
    try:
        with get_db_context() as session:
            db_connected = True
            table_counts["datasets"] = session.execute(
                select(func.count(DatasetModel.dataset_id))
            ).scalar_one() or 0
            table_counts["experiments"] = session.execute(
                select(func.count(ExperimentModel.experiment_id))
            ).scalar_one() or 0
            table_counts["pipelines"] = session.execute(
                select(func.count(PipelineModel.pipeline_id))
            ).scalar_one() or 0
            schema_version = session.execute(
                select(func.max(SchemaVersionModel.version))
            ).scalar_one()
    except Exception as exc:
        logger.error("Diagnostics database query failed: %s (%s)", type(exc).__name__, exc)
        db_connected = False

    # Pipeline executor status
    pipeline_service = get_pipeline_service()
    pipeline_info = {
        "active_count": pipeline_service.get_active_count() if hasattr(pipeline_service, "get_active_count") else 0,
        "max_concurrency": curr_settings.pipeline_max_concurrency,
        "is_shutdown": bool(getattr(pipeline_service, "is_shutting_down", getattr(pipeline_service, "_is_shutdown", False))),
    }

    # Storage status (counts only, no sensitive user home paths)
    upload_dir = curr_settings.resolved_upload_dir
    artifacts_dir = getattr(curr_settings, "resolved_artifacts_dir", curr_settings.resolved_experiments_dir)
    dataset_files_count = len(list(upload_dir.glob("*.csv"))) if upload_dir.exists() else 0
    models_dir = getattr(curr_settings, "resolved_models_dir", curr_settings.resolved_experiments_dir / "models")
    models_count = len(list(models_dir.glob("*"))) if models_dir.exists() else 0

    return DiagnosticsResponse(
        status="ok" if db_connected else "degraded",
        system={
            "python_version": sys.version.split()[0],
            "platform": platform.platform(),
            "pid": os.getpid(),
            "uptime_seconds": uptime_sec,
            "environment": curr_settings.environment,
        },
        database={
            "connected": db_connected,
            "schema_version": schema_version,
            "table_counts": table_counts,
        },
        pipelines=pipeline_info,
        storage={
            "base_dir_accessible": artifacts_dir.exists(),
            "datasets_count": dataset_files_count,
            "models_count": models_count,
        },
        correlation_id=get_correlation_id(),
    )


# -----------------------------------------------------------------------------
# 4. Operational Metrics (Inference Role Accessible)
# -----------------------------------------------------------------------------

@router.get(
    "/metrics",
    response_model=MetricsResponse,
    status_code=status.HTTP_200_OK,
    summary="Operational Metrics Snapshot",
    description="Export current in-memory operational metrics snapshot (requests, latencies, runs, DB stats).",
)
@router.get(
    "/health/metrics",
    response_model=MetricsResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def get_metrics(
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> MetricsResponse:
    """Retrieve the in-memory operational metrics report."""
    snapshot = get_metrics_collector().get_snapshot()
    return MetricsResponse(**snapshot)
