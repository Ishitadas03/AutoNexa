"""Pydantic schemas for research-grade experiment tracking, model registry, versioning, and reproducibility manifests."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ExperimentStatus(str, Enum):
    """Execution status of an AutoML experiment."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LifecycleStage(str, Enum):
    """Lifecycle deployment stage for registered model versions."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    ARCHIVED = "archived"


# ==========================================
# Experiment Tracking Schemas
# ==========================================

class ExperimentSummary(BaseModel):
    """Concise representation of an experiment for listing and history views."""
    experiment_id: str = Field(..., description="Unique experiment identifier")
    name: Optional[str] = Field(default=None, description="Human-readable experiment name")
    description: Optional[str] = Field(default=None, description="Optional experiment description")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_fingerprint: str = Field(..., description="SHA-256 fingerprint of the source dataset")
    task_type: str = Field(..., description="Task type (binary_classification, multiclass_classification, regression)")
    target_column: str = Field(..., description="Target column name")
    status: str = Field(..., description="Experiment status (queued, running, completed, failed, cancelled)")
    best_model: Optional[str] = Field(default=None, description="Winning candidate model identifier")
    best_score: Optional[float] = Field(default=None, description="Best validation score achieved")
    primary_metric: str = Field(..., description="Primary ranking metric")
    primary_metric_greater_is_better: Optional[bool] = Field(default=None, description="Metric optimization direction")
    evaluation_strategy: Optional[str] = Field(default=None, description="Holdout or cross-validation")
    total_duration_seconds: Optional[float] = Field(default=None, description="Wall clock execution time in seconds")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    models_count: int = Field(default=0, description="Number of evaluated models in this experiment")
    has_artifact: bool = Field(default=False, description="Whether serialized model artifact exists on disk")


class ExperimentListResponse(BaseModel):
    """Paginated list of experiments with filter metadata."""
    items: List[ExperimentSummary] = Field(..., description="Page of experiment summaries")
    total: int = Field(..., ge=0, description="Total matching experiments")
    page: int = Field(..., ge=1, description="Current page number (1-indexed)")
    page_size: int = Field(..., ge=1, description="Number of items per page")
    total_pages: int = Field(..., ge=0, description="Total number of available pages")


class ExperimentDetailResponse(BaseModel):
    """Comprehensive details of an experiment, configurations, environment, and error diagnostics."""
    experiment_id: str = Field(..., description="Unique experiment identifier")
    name: Optional[str] = Field(default=None, description="Human-readable experiment name")
    description: Optional[str] = Field(default=None, description="Optional experiment description")
    status: str = Field(..., description="Experiment status (completed, failed, etc.)")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_fingerprint: str = Field(..., description="SHA-256 fingerprint of the dataset")
    target_column: str = Field(..., description="Target column modeled")
    task_type: str = Field(..., description="Task type")
    evaluation_strategy: str = Field(..., description="Evaluation strategy used: holdout or cross_validation")
    cv_folds: Optional[int] = Field(default=None, description="Number of CV folds if cross_validation")
    primary_metric: str = Field(..., description="Metric utilized for model selection")
    primary_metric_greater_is_better: Optional[bool] = Field(default=None, description="Optimization direction")
    random_state: Optional[int] = Field(default=None, description="Random seed used for partitioning and models")
    test_size: Optional[float] = Field(default=None, description="Holdout test split ratio")
    train_rows: Optional[int] = Field(default=None, description="Rows in training partition")
    test_rows: Optional[int] = Field(default=None, description="Rows in holdout test partition")
    features_count: Optional[int] = Field(default=None, description="Number of feature columns")
    feature_names: Optional[List[str]] = Field(default=None, description="List of feature column names")
    numeric_features: Optional[List[str]] = Field(default=None, description="Numeric feature columns")
    categorical_features: Optional[List[str]] = Field(default=None, description="Categorical feature columns")
    ranked_models: Optional[List[str]] = Field(default=None, description="Ranked list of evaluated models")
    best_model: Optional[str] = Field(default=None, description="Winning candidate model identifier")
    best_score: Optional[float] = Field(default=None, description="Winning model validation score")
    test_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Independent holdout test metrics")
    evaluation_protocol: Optional[str] = Field(default=None, description="Detailed evaluation protocol note")
    total_duration_seconds: Optional[float] = Field(default=None, description="Execution duration in seconds")
    models_evaluated: Optional[List[Dict[str, Any]]] = Field(default=None, description="Per-model evaluation records")
    artifacts: Optional[Dict[str, Any]] = Field(default=None, description="Artifact metadata (format, size, SHA-256)")
    package_versions: Optional[Dict[str, str]] = Field(default=None, description="Installed ML library versions")
    system_info: Optional[Dict[str, str]] = Field(default=None, description="Host environment and platform specs")
    created_at: Optional[str] = Field(default=None, description="ISO 8601 creation timestamp")
    error_info: Optional[Dict[str, Any]] = Field(default=None, description="Structured error diagnostics if failed")


# ==========================================
# Experiment Comparison Schemas
# ==========================================

class ExperimentCompareRequest(BaseModel):
    """Request to compare 2 or more selected experiments."""
    experiment_ids: List[str] = Field(
        ...,
        min_length=2,
        max_length=10,
        description="List of 2 to 10 experiment IDs to compare",
    )


class ExperimentComparisonItem(BaseModel):
    """Side-by-side data point for one experiment in a comparison."""
    experiment_id: str
    name: Optional[str] = None
    dataset_id: str
    dataset_fingerprint: str
    task_type: str
    target_column: str
    best_model: Optional[str] = None
    primary_metric: str
    best_score: Optional[float] = None
    test_metrics: Optional[Dict[str, Any]] = None
    metrics: Dict[str, Optional[float]] = Field(default_factory=dict)
    duration_seconds: Optional[float] = None
    features_count: Optional[int] = None
    train_rows: Optional[int] = None
    evaluation_strategy: Optional[str] = None
    cv_folds: Optional[int] = None
    random_state: Optional[int] = None
    package_versions: Optional[Dict[str, str]] = None
    has_artifact: bool = False
    registered_version: Optional[str] = None


class ExperimentComparisonResponse(BaseModel):
    """Comparative analysis across multiple experiments."""
    experiments: List[ExperimentComparisonItem]
    common_dataset: bool = Field(..., description="Whether all experiments share the exact dataset fingerprint")
    common_task: bool = Field(..., description="Whether all experiments share the same task type")
    metric_comparison: Dict[str, Dict[str, Optional[float]]] = Field(
        ...,
        description="Unified matrix of metrics across experiment IDs (metric -> {exp_id: value})",
    )
    metric_directions: Dict[str, bool] = Field(
        default_factory=dict,
        description="Map of metric name to greater_is_better boolean",
    )
    best_per_metric: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of metric name to winning experiment ID",
    )
    compatibility_warning: Optional[str] = Field(
        default=None,
        description="Warning banner if tasks, datasets, or metrics are non-comparable",
    )
    statistical_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Descriptive or paired statistical differences when datasets/seeds match",
    )


# ==========================================
# Reproducibility Manifest Schemas
# ==========================================

class ReproducibilityManifest(BaseModel):
    """Cryptographically verifiable reproducibility manifest for an AutoML experiment."""
    manifest_version: str = Field(default="1.0.0", description="Schema version of this manifest")
    experiment_id: str = Field(..., description="Source experiment identifier")
    created_at: str = Field(..., description="ISO 8601 generation timestamp")
    dataset: Dict[str, Any] = Field(..., description="Dataset ID, fingerprint, rows, columns, target")
    configuration: Dict[str, Any] = Field(..., description="Execution parameters: task, splits, CV, seeds")
    preprocessing: Dict[str, Any] = Field(..., description="Feature columns, imputers, scalers, encoders")
    model: Dict[str, Any] = Field(..., description="Winning estimator identity, hyperparams, rankings")
    environment: Dict[str, Any] = Field(..., description="Python, OS, CPU, platform, installed package versions")
    metrics: Dict[str, Any] = Field(..., description="Recorded validation, CV, and holdout test scores")
    artifact: Dict[str, Any] = Field(..., description="Model file name, format, size in bytes, SHA-256")
    reproducibility_level: str = Field(
        default="configuration_and_environment",
        description="Level of reproducibility: configuration_only, configuration_and_environment, or deterministic_bitwise",
    )
    scientific_disclaimer: str = Field(
        ...,
        description="Scientific limitations regarding bitwise floating-point reproducibility across hardware",
    )
    manifest_sha256: Optional[str] = Field(
        default=None,
        description="Cryptographic SHA-256 checksum computed over the canonical manifest JSON",
    )


# ==========================================
# Model Registry Schemas
# ==========================================

class ModelRegistrationRequest(BaseModel):
    """Request to register a model from a completed experiment into the registry."""
    experiment_id: str = Field(..., description="Identifier of the completed AutoML experiment")
    model_name: str = Field(
        ...,
        min_length=2,
        max_length=64,
        pattern=r"^[a-zA-Z0-9_\-]+$",
        description="Stable model name (alphanumeric, hyphens, underscores)",
    )
    description: Optional[str] = Field(default=None, max_length=500, description="Optional description of this version")
    tags: List[str] = Field(default_factory=list, description="Categorization tags (e.g. ['fraud', 'v1'])")
    initial_stage: LifecycleStage = Field(
        default=LifecycleStage.DEVELOPMENT,
        description="Initial lifecycle stage (default: development)",
    )


class StageTransitionRequest(BaseModel):
    """Request to promote or transition the lifecycle stage of a registered model version."""
    new_stage: LifecycleStage = Field(..., description="Target lifecycle stage")
    reason: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Auditable explanation for this stage transition",
    )


class LifecycleAuditEntry(BaseModel):
    """Record of an explicit lifecycle transition in the audit trail."""
    timestamp: str = Field(..., description="ISO 8601 transition timestamp")
    from_stage: str = Field(..., description="Previous stage")
    to_stage: str = Field(..., description="New stage")
    reason: Optional[str] = Field(default=None, description="Audited transition justification")
    operator: str = Field(default="system", description="Account or identity initiating the change")


class ModelVersionRecord(BaseModel):
    """Detailed record of a specific registered model version."""
    model_name: str = Field(..., description="Stable model family/repository identifier")
    version: int = Field(..., ge=1, description="Monotonically increasing version integer")
    version_tag: str = Field(..., description="Human-readable version string, e.g. 'v1'")
    experiment_id: str = Field(..., description="Source experiment identifier")
    stage: LifecycleStage = Field(..., description="Current lifecycle stage")
    task_type: str = Field(..., description="Task type")
    model_family: str = Field(..., description="Candidate estimator algorithm name")
    primary_metric: str = Field(..., description="Evaluation metric name")
    score: Optional[float] = Field(default=None, description="Primary score achieved")
    test_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Holdout test metrics")
    dataset_id: str = Field(..., description="Source dataset ID")
    dataset_fingerprint: str = Field(..., description="Dataset SHA-256 fingerprint")
    artifact_filename: str = Field(..., description="Artifact file name (e.g. best_model.joblib)")
    artifact_sha256: str = Field(..., description="Cryptographic SHA-256 checksum of model file")
    artifact_size_bytes: int = Field(..., ge=0, description="Size of model file in bytes")
    status: str = Field(default="active", description="Version status: active or archived")
    description: Optional[str] = Field(default=None, description="Version description")
    tags: List[str] = Field(default_factory=list, description="Categorization tags")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    updated_at: str = Field(..., description="ISO 8601 last-modified timestamp")
    audit_history: List[LifecycleAuditEntry] = Field(
        default_factory=list,
        description="Chronological log of lifecycle stage transitions",
    )


class RegisteredModelSummary(BaseModel):
    """Summary of a model family and its versions for the model registry catalog."""
    model_name: str = Field(..., description="Unique model name")
    latest_version: int = Field(..., ge=1, description="Latest registered version number")
    production_version: Optional[int] = Field(default=None, description="Version currently in Production stage, if any")
    staging_version: Optional[int] = Field(default=None, description="Version currently in Staging stage, if any")
    versions_count: int = Field(..., ge=1, description="Total versions registered for this model")
    task_type: str = Field(..., description="Task type modeled")
    latest_primary_metric: str = Field(..., description="Primary metric name")
    latest_score: Optional[float] = Field(default=None, description="Score of latest version")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    updated_at: str = Field(..., description="ISO 8601 last update timestamp")


class ModelRegistryListResponse(BaseModel):
    """Catalog of registered models."""
    models: List[RegisteredModelSummary] = Field(..., description="Registered model summaries")
    total: int = Field(..., ge=0, description="Total unique model names registered")


class ArtifactVerificationResponse(BaseModel):
    """Result of real-time cryptographic artifact integrity verification."""
    verified: bool = Field(..., description="True if disk file exists and SHA-256 checksum matches metadata")
    expected_sha256: str = Field(..., description="Checksum recorded at training/registration time")
    actual_sha256: Optional[str] = Field(default=None, description="Real-time checksum computed from disk file")
    size_bytes: Optional[int] = Field(default=None, description="File size on disk in bytes")
    artifact_exists: bool = Field(..., description="Whether artifact file is physically present")
    message: str = Field(..., description="Human-readable verification outcome")
