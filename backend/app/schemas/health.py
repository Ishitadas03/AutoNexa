"""Health-check, readiness, diagnostic, and metric response schemas."""

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Structured response schema for lightweight public application health-check."""

    status: str = Field(
        default="healthy",
        description="Current operational status of the service",
    )
    app_name: str = Field(
        ...,
        description="Name of the running application",
    )
    version: str = Field(
        ...,
        description="Semantic version of the application",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "healthy",
                "app_name": "AutoNexa",
                "version": "0.1.0",
            }
        }
    }


class ReadinessResponse(BaseModel):
    """Operational readiness verification schema for upstream routing and probes."""

    status: str = Field(
        ...,
        description="Readiness state: 'ready', 'degraded', or 'unhealthy'",
    )
    ready: bool = Field(
        ...,
        description="Boolean readiness flag (True if operational, False if critical checks fail)",
    )
    checks: Dict[str, Any] = Field(
        ...,
        description="Component check breakdown (database, storage, pipeline lifecycle)",
    )
    timestamp: float = Field(
        ...,
        description="Epoch timestamp of readiness evaluation",
    )


class DiagnosticsResponse(BaseModel):
    """Privileged system diagnostics schema for administrators and operators."""

    status: str = Field(
        default="ok",
        description="High-level operational health indicator",
    )
    system: Dict[str, Any] = Field(
        ...,
        description="System environment runtime details (Python version, platform, uptime)",
    )
    database: Dict[str, Any] = Field(
        ...,
        description="Database health, table row counts, and indexing schema version",
    )
    pipelines: Dict[str, Any] = Field(
        ...,
        description="Pipeline executor concurrency, active counts, and thread pool state",
    )
    storage: Dict[str, Any] = Field(
        ...,
        description="Storage availability, dataset directory status, and artifact counts",
    )
    correlation_id: Optional[str] = Field(
        default=None,
        description="Correlation ID associated with the diagnostic inspection request",
    )


class MetricsResponse(BaseModel):
    """Operational metrics snapshot schema."""

    uptime_seconds: float = Field(
        ...,
        description="Seconds since metrics collector initialization",
    )
    durable: bool = Field(
        default=False,
        description="Indicates whether metrics persist across application process restarts",
    )
    storage: str = Field(
        default="in_memory",
        description="Underlying storage backend for metrics aggregation",
    )
    http: Dict[str, Any] = Field(
        ...,
        description="HTTP request volume, status family counts, and duration summaries",
    )
    training: Dict[str, Any] = Field(
        ...,
        description="Model training counts by status/task and duration statistics",
    )
    pipelines: Dict[str, Any] = Field(
        ...,
        description="Pipeline execution counts, active/queued gauges, and run durations",
    )
    metadata_db: Dict[str, Any] = Field(
        ...,
        description="Database query operations, error counts, and reconciliation outcomes",
    )
    governance: Dict[str, Any] = Field(
        ...,
        description="Model registry stage transitions and drift monitoring trigger counts",
    )
