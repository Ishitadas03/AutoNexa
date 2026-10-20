"""Pydantic schemas for AutoNexa Phase 15 End-to-End Pipeline Orchestration."""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# ==============================================================================
# Enumerations
# ==============================================================================

class PipelineStatus(str, Enum):
    """Lifecycle state of an end-to-end pipeline execution."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PipelineStage(str, Enum):
    """Sequential operational stages in the end-to-end AutoML pipeline."""
    DATASET_VALIDATION = "dataset_validation"
    PROVENANCE_INITIALIZATION = "provenance_initialization"
    TRAINING = "training"
    EVALUATION = "evaluation"
    EXPERIMENT_MANIFEST = "experiment_manifest"
    REGISTRY_REGISTRATION = "registry_registration"
    PROMOTION_GATE = "promotion_gate"
    MONITORING_INITIALIZATION = "monitoring_initialization"
    COMPLETED = "completed"


class PromotionPolicy(str, Enum):
    """Governed promotion strategy for newly trained candidate models."""
    MANUAL = "manual"                  # Keep in candidate stage (e.g. development)
    AUTO_STAGING = "auto_staging"      # Automatically promote to staging if evaluation passes
    AUTO_PRODUCTION = "auto_production"# Promote to production ONLY if candidate gate passes vs incumbent


# ==============================================================================
# Sub-models: Stages, Provenance & Events
# ==============================================================================

class StageRecord(BaseModel):
    """Execution status and audit record for an individual pipeline stage."""
    stage: PipelineStage = Field(..., description="Stage identifier")
    status: str = Field(..., description="Execution state: pending, running, succeeded, failed, skipped")
    started_at: Optional[str] = Field(default=None, description="ISO timestamp when stage execution started")
    completed_at: Optional[str] = Field(default=None, description="ISO timestamp when stage completed")
    duration_seconds: Optional[float] = Field(default=None, description="Execution duration in seconds")
    message: Optional[str] = Field(default=None, description="Human-readable stage progress or summary message")
    error_details: Optional[str] = Field(default=None, description="Detailed sanitized failure traceback if failed")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Stage-specific operational outputs")


class PipelineProvenance(BaseModel):
    """Cryptographic and deterministic provenance manifest for pipeline execution."""
    pipeline_id: str = Field(..., description="Unique pipeline execution identifier")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_fingerprint: str = Field(..., description="SHA-256 hash of the input dataset")
    config_fingerprint: str = Field(..., description="Canonical SHA-256 hash of the training configuration")
    random_seed: int = Field(..., description="Pseudo-random seed utilized for reproducibility")
    target_column: str = Field(..., description="Target column modeled")
    task_type: str = Field(..., description="Resolved task type: classification or regression")
    training_config: Dict[str, Any] = Field(default_factory=dict, description="Resolved training parameters")
    environment_info: Dict[str, str] = Field(
        default_factory=dict,
        description="Software environment details (Python, scikit-learn, numpy, pandas, etc.)",
    )
    created_at: str = Field(..., description="Provenance initialization timestamp")


class PipelineEvent(BaseModel):
    """Chronological execution event emitted during pipeline lifecycle."""
    event_id: str = Field(..., description="Unique event identifier")
    pipeline_id: str = Field(..., description="Associated pipeline execution identifier")
    timestamp: str = Field(..., description="ISO 8601 event timestamp")
    stage: Optional[PipelineStage] = Field(default=None, description="Associated stage, if any")
    level: str = Field(default="info", description="Log level: info, warning, error")
    message: str = Field(..., description="Human-readable event message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Structured event context data")


# ==============================================================================
# Pipeline Request & Response Models
# ==============================================================================

class PipelineCreateRequest(BaseModel):
    """Request payload to initiate a new end-to-end AutoML pipeline run."""
    dataset_id: str = Field(..., min_length=1, description="Uploaded dataset identifier")
    target_column: str = Field(..., min_length=1, description="Target column name to predict")
    model_name: str = Field(
        ...,
        min_length=1,
        pattern=r"^[a-zA-Z0-9_\-]+$",
        description="Target model family identifier in the model registry",
    )
    task_type: Optional[Literal["classification", "regression"]] = Field(
        default=None,
        description="Optional task override (inferred if omitted)",
    )
    training_config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional TrainingRequest parameters (time_budget_seconds, evaluation_strategy, etc.)",
    )
    auto_register: bool = Field(
        default=True,
        description="Whether to automatically register the winning model in the Model Registry as a candidate",
    )
    initial_registry_stage: Optional[str] = Field(
        default="development",
        description="Initial lifecycle stage for registered model: 'development' or 'staging'",
    )
    promotion_policy: Optional[PromotionPolicy] = Field(
        default=PromotionPolicy.MANUAL,
        description="Policy governing candidate promotion: 'manual', 'auto_staging', or 'auto_production'",
    )
    create_reference_profile: bool = Field(
        default=True,
        description="Whether to automatically establish a baseline reference profile in the monitoring subsystem",
    )
    monitoring_split_source: str = Field(
        default="training",
        description="Dataset partition for baseline monitoring profile: strictly 'training' or 'validation'",
    )
    candidate_tolerance_pct: float = Field(
        default=5.0,
        ge=0.0,
        le=50.0,
        description="Maximum permissible relative performance regression (%) when validating candidate models",
    )
    description: Optional[str] = Field(
        default=None,
        description="Human-readable purpose or provenance context for this pipeline execution",
    )


class PipelineResponse(BaseModel):
    """Full detail of an end-to-end pipeline execution."""
    pipeline_id: str = Field(..., description="Unique pipeline execution identifier")
    status: PipelineStatus = Field(..., description="Overall pipeline execution status")
    current_stage: PipelineStage = Field(..., description="Current or terminal pipeline stage")
    model_name: str = Field(..., description="Target model family identifier")
    dataset_id: str = Field(..., description="Source dataset identifier")
    target_column: str = Field(..., description="Target column predicted")
    task_type: Optional[str] = Field(default=None, description="Resolved task type")
    experiment_id: Optional[str] = Field(default=None, description="Associated experiment tracker identifier")
    model_version: Optional[int] = Field(default=None, description="Associated model registry version number")
    model_stage: Optional[str] = Field(default=None, description="Lifecycle stage of registered model")
    reference_profile_id: Optional[str] = Field(default=None, description="Associated baseline monitoring profile ID")
    primary_metric: Optional[str] = Field(default=None, description="Primary evaluation metric name")
    metric_value: Optional[float] = Field(default=None, description="Primary metric value achieved by winning model")
    artifact_checksum: Optional[str] = Field(default=None, description="SHA-256 checksum of the trained model binary")
    stages: List[StageRecord] = Field(default_factory=list, description="Chronological record of all pipeline stages")
    provenance: Optional[PipelineProvenance] = Field(default=None, description="Reproducibility provenance record")
    created_at: str = Field(..., description="ISO timestamp when pipeline was created")
    started_at: Optional[str] = Field(default=None, description="ISO timestamp when execution started")
    completed_at: Optional[str] = Field(default=None, description="ISO timestamp when execution finished")
    duration_seconds: Optional[float] = Field(default=None, description="Total pipeline execution duration in seconds")
    retry_count: int = Field(default=0, ge=0, description="Number of times this pipeline execution has been retried")
    failure_reason: Optional[str] = Field(default=None, description="Sanitized failure reason if pipeline failed")
    description: Optional[str] = Field(default=None, description="User-provided description")


class PipelineListResponse(BaseModel):
    """Paginated collection of pipeline executions."""
    total: int = Field(..., ge=0, description="Total number of pipeline executions matching query criteria")
    limit: int = Field(..., ge=1, description="Page limit applied")
    offset: int = Field(..., ge=0, description="Page offset applied")
    pipelines: List[PipelineResponse] = Field(default_factory=list, description="List of pipeline executions")
