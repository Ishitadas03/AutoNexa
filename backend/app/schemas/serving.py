"""Pydantic schemas for secure model serving, prediction requests, capabilities, health, and monitoring."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ServingModelSummary(BaseModel):
    """Overview of a registered model family and its serving eligibility."""
    model_name: str = Field(..., description="Unique model family name")
    active_version: Optional[int] = Field(default=None, description="Active serving version number (production preferred)")
    active_stage: Optional[str] = Field(default=None, description="Lifecycle stage of active serving version")
    task_type: str = Field(..., description="Task type (binary_classification, multiclass_classification, regression)")
    model_family: str = Field(..., description="Underlying algorithm name (e.g. random_forest, lightgbm)")
    primary_metric: str = Field(..., description="Evaluation metric name")
    score: Optional[float] = Field(default=None, description="Primary validation score of active version")
    serving_status: str = Field(..., description="Serving eligibility: 'active' or 'ineligible'")
    available_versions: List[int] = Field(default_factory=list, description="All registered version numbers")
    production_version: Optional[int] = Field(default=None, description="Version in production stage, if any")
    staging_version: Optional[int] = Field(default=None, description="Version in staging stage, if any")


class ServingModelDetailResponse(BaseModel):
    """Detailed schema, feature requirements, and inference capabilities of a specific served model version."""
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., ge=1, description="Version number")
    version_tag: str = Field(..., description="Version tag string (e.g. 'v1')")
    stage: str = Field(..., description="Current lifecycle stage (production, staging, development, archived)")
    task_type: str = Field(..., description="Task type")
    model_family: str = Field(..., description="Algorithm name")
    score: Optional[float] = Field(default=None, description="Primary score achieved during evaluation")
    primary_metric: str = Field(..., description="Primary metric name")
    feature_names: List[str] = Field(..., description="Ordered list of required feature column names")
    numeric_features: Optional[List[str]] = Field(default=None, description="Numeric input feature column names")
    categorical_features: Optional[List[str]] = Field(default=None, description="Categorical input feature column names")
    supports_probabilities: bool = Field(default=False, description="Whether estimator provides class probability outputs")
    classes: Optional[List[Any]] = Field(default=None, description="Output target class labels for classification")
    artifact_sha256: str = Field(..., description="Cryptographic SHA-256 checksum of the served binary")
    artifact_size_bytes: int = Field(..., description="Size of model artifact in bytes")
    created_at: str = Field(..., description="ISO 8601 registration timestamp")
    is_cached: bool = Field(default=False, description="Whether this model pipeline is currently hot in memory cache")


class ServingHealthResponse(BaseModel):
    """Real-time operational health and integrity verification of a served model version."""
    status: str = Field(..., description="Operational readiness: 'healthy' or 'degraded'")
    model_name: str = Field(..., description="Model identifier")
    version: int = Field(..., description="Version number")
    stage: str = Field(..., description="Lifecycle stage")
    artifact_verified: bool = Field(..., description="True if disk artifact exists and matches registered SHA-256")
    loaded_in_cache: bool = Field(..., description="True if pipeline is deserialized in hot memory cache")
    message: str = Field(..., description="Human-readable status summary")


class ServingPredictionRequest(BaseModel):
    """Batch or single-record prediction input payload for a served model."""
    records: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="List of 1 to 1000 input feature dictionaries matching model schema",
    )


class ServingPredictionResponse(BaseModel):
    """Inference output containing sanitized predictions, optional probabilities, and serving metadata."""
    model_name: str = Field(..., description="Name of the model serving the prediction")
    version: int = Field(..., description="Model version utilized")
    version_tag: str = Field(..., description="Version tag string (e.g. 'v1')")
    stage: str = Field(..., description="Lifecycle stage of the serving model")
    task_type: str = Field(..., description="Task type")
    records_count: int = Field(..., description="Number of records evaluated")
    predictions: List[Any] = Field(..., description="Predicted labels or regression values")
    probabilities: Optional[List[Dict[str, float]]] = Field(
        default=None,
        description="Per-record predicted class probabilities when supported by estimator",
    )
    latency_ms: float = Field(..., description="Inference execution duration in milliseconds")
    timestamp: str = Field(..., description="ISO 8601 prediction timestamp")


class ServingMetricsResponse(BaseModel):
    """Aggregated, privacy-conscious operational metrics for the model serving subsystem."""
    total_requests: int = Field(..., description="Total inference requests received")
    successful_requests: int = Field(..., description="Total requests successfully evaluated")
    failed_requests: int = Field(..., description="Total failed requests")
    validation_errors: int = Field(..., description="Requests rejected due to schema or feature validation")
    integrity_errors: int = Field(..., description="Requests blocked by artifact integrity failures")
    average_latency_ms: float = Field(..., description="Average inference latency in milliseconds")
    p50_latency_ms: float = Field(..., description="Median (50th percentile) latency in milliseconds")
    p95_latency_ms: float = Field(..., description="95th percentile latency in milliseconds")
    min_latency_ms: float = Field(..., description="Minimum observed latency in milliseconds")
    max_latency_ms: float = Field(..., description="Maximum observed latency in milliseconds")
    models_served: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Per-model aggregated execution counts and latencies",
    )


class CacheInvalidationResponse(BaseModel):
    """Result of cache eviction operation."""
    model_name: str = Field(..., description="Model identifier")
    version: Optional[int] = Field(default=None, description="Evicted version number or None for all versions")
    evicted: bool = Field(..., description="Whether any cached instances were evicted")
    message: str = Field(..., description="Eviction confirmation message")
