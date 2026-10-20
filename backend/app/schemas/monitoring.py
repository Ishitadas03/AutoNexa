"""Pydantic schemas for Model Monitoring, Drift Detection, Ground-Truth Performance Evaluation, and Automated Retraining."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ==============================================================================
# Enumerations
# ==============================================================================

class DriftMethod(str, Enum):
    """Statistical methods utilized to detect tabular distribution shifts."""
    PSI = "psi"
    KS_2SAMP = "ks_2samp"
    CATEGORICAL_PSI = "categorical_psi"
    UNSEEN_CATEGORIES = "unseen_categories"
    MISSING_RATE_DELTA = "missing_rate_delta"


class DriftStatus(str, Enum):
    """Evaluation status resulting from statistical drift testing."""
    NO_DRIFT = "no_drift"
    WARNING = "warning"
    DRIFT_DETECTED = "drift_detected"
    INSUFFICIENT_DATA = "insufficient_data"


class AlertSeverity(str, Enum):
    """Severity tier for model monitoring alerts."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    """Lifecycle state of an operational monitoring alert."""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class RetrainingTriggerPolicy(str, Enum):
    """Authorized trigger conditions for controlled model retraining."""
    PERFORMANCE_DEGRADATION = "performance_degradation"
    SUSTAINED_DRIFT = "sustained_drift"
    MANUAL = "manual"


class RetrainingJobStatus(str, Enum):
    """Execution lifecycle status for an automated retraining job."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CandidateValidationStatus(str, Enum):
    """Validation gate outcome for a retrained candidate model."""
    PENDING = "pending"
    PASSED = "passed"
    REJECTED = "rejected"
    FAILED = "failed"


# ==============================================================================
# Reference Profiling Schemas
# ==============================================================================

class NumericalFeatureSummary(BaseModel):
    """Statistical distribution summary for a numerical feature."""
    feature_name: str = Field(..., description="Feature column identifier")
    count: int = Field(..., ge=0, description="Count of non-missing samples")
    mean: float = Field(..., description="Arithmetic mean")
    std: float = Field(..., description="Standard deviation")
    min: float = Field(..., description="Minimum observed value")
    max: float = Field(..., description="Maximum observed value")
    p25: float = Field(..., description="25th percentile (1st quartile)")
    p50: float = Field(..., description="50th percentile (median)")
    p75: float = Field(..., description="75th percentile (3rd quartile)")
    missing_count: int = Field(..., ge=0, description="Count of missing/null values")
    missing_rate: float = Field(..., ge=0.0, le=1.0, description="Fraction of missing samples")
    bin_edges: List[float] = Field(default_factory=list, description="Bin boundary values for histogram/PSI calculation")
    bin_counts: List[int] = Field(default_factory=list, description="Sample count in each histogram bin")
    reference_sample: Optional[List[float]] = Field(
        default=None,
        description="Subsample of empirical baseline values for exact two-sample Kolmogorov-Smirnov test",
    )


class CategoricalFeatureSummary(BaseModel):
    """Frequency distribution summary for a categorical feature."""
    feature_name: str = Field(..., description="Feature column identifier")
    total_count: int = Field(..., ge=0, description="Total sample count including nulls")
    distinct_categories: int = Field(..., ge=0, description="Number of unique categorical classes")
    category_frequencies: Dict[str, float] = Field(
        default_factory=dict,
        description="Relative frequencies (probabilities) per category",
    )
    category_counts: Dict[str, int] = Field(
        default_factory=dict,
        description="Raw sample counts per category",
    )
    missing_count: int = Field(..., ge=0, description="Count of missing/null values")
    missing_rate: float = Field(..., ge=0.0, le=1.0, description="Fraction of missing samples")


class ReferenceProfileCreate(BaseModel):
    """Request payload to establish a reference profile from a validated dataset."""
    model_name: str = Field(..., min_length=1, description="Model family identifier")
    version: Optional[int] = Field(default=None, ge=1, description="Specific model version or active production")
    dataset_id: str = Field(..., min_length=1, description="Dataset identifier used to construct reference")
    split_source: str = Field(
        default="training",
        description="Dataset partition used: 'training', 'validation', or 'baseline'",
    )
    description: Optional[str] = Field(default=None, description="Human-readable provenance or context description")


class ReferenceProfileResponse(BaseModel):
    """Persisted reference baseline profile against which production windows are compared."""
    profile_id: str = Field(..., description="Unique reference profile identifier")
    model_name: str = Field(..., description="Target model family identifier")
    version: int = Field(..., description="Target model version")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_fingerprint: str = Field(..., description="SHA-256 fingerprint of the baseline dataset")
    split_source: str = Field(..., description="Baseline partition used")
    sample_count: int = Field(..., ge=1, description="Number of baseline samples profiled")
    numerical_features: Dict[str, NumericalFeatureSummary] = Field(
        default_factory=dict,
        description="Summaries for all numerical columns",
    )
    categorical_features: Dict[str, CategoricalFeatureSummary] = Field(
        default_factory=dict,
        description="Summaries for all categorical columns",
    )
    feature_names: List[str] = Field(default_factory=list, description="Ordered feature column names")
    created_at: str = Field(..., description="ISO 8601 profiling timestamp")
    is_active: bool = Field(default=True, description="Whether this profile is currently active for model drift checks")


# ==============================================================================
# Monitoring Windows & Telemetry Schemas
# ==============================================================================

class MonitoringWindowCreate(BaseModel):
    """Submission of a batch or time window of inference records for monitoring."""
    model_name: str = Field(..., min_length=1, description="Model family identifier")
    version: Optional[int] = Field(default=None, ge=1, description="Target version (defaults to active)")
    window_id: Optional[str] = Field(default=None, description="Optional caller-provided window identifier")
    records: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="List of feature records evaluated in this monitoring window",
    )
    prediction_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional correlation identifiers corresponding 1-to-1 with records",
    )


class MonitoringWindowResponse(BaseModel):
    """Metadata summary of a recorded monitoring window."""
    window_id: str = Field(..., description="Unique window identifier")
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., description="Model version")
    record_count: int = Field(..., ge=1, description="Number of records in this window")
    created_at: str = Field(..., description="ISO 8601 window registration timestamp")
    feature_names: List[str] = Field(default_factory=list, description="Features present in the window")
    status: str = Field(..., description="Processing status: 'active', 'analyzed', 'archived'")


class ServingTelemetryEvent(BaseModel):
    """Privacy-conscious operational telemetry record for a single serving request."""
    event_id: str = Field(..., description="Unique event identifier")
    timestamp: str = Field(..., description="ISO 8601 event timestamp")
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., description="Model version number")
    stage: str = Field(..., description="Model deployment stage")
    task_type: str = Field(..., description="Prediction task type")
    record_count: int = Field(..., ge=1, description="Number of records in request")
    latency_ms: float = Field(..., ge=0.0, description="Execution duration in milliseconds")
    outcome: str = Field(..., description="'success', 'validation_error', 'integrity_error', or 'inference_error'")
    correlation_id: Optional[str] = Field(default=None, description="Optional request correlation ID")
    window_id: Optional[str] = Field(default=None, description="Monitoring window identifier, if assigned")


# ==============================================================================
# Drift Detection Schemas
# ==============================================================================

class FeatureDriftResult(BaseModel):
    """Detailed statistical comparison between reference and current distribution for a single feature."""
    feature_name: str = Field(..., description="Feature column identifier")
    feature_type: str = Field(..., description="'numerical' or 'categorical'")
    drift_method: DriftMethod = Field(..., description="Primary statistical test method applied")
    statistic: float = Field(..., description="Computed test statistic (PSI, KS statistic, etc.)")
    p_value: Optional[float] = Field(default=None, description="p-value where applicable (e.g. KS test)")
    threshold: float = Field(..., description="Configured decision threshold for drift detection")
    drift_status: DriftStatus = Field(..., description="Decision: 'no_drift', 'warning', 'drift_detected', 'insufficient_data'")
    ref_sample_count: int = Field(..., ge=0, description="Sample count in reference profile")
    cur_sample_count: int = Field(..., ge=0, description="Sample count in current evaluation window")
    ref_missing_rate: float = Field(..., ge=0.0, le=1.0, description="Missing rate in reference")
    cur_missing_rate: float = Field(..., ge=0.0, le=1.0, description="Missing rate in current window")
    missing_rate_delta: float = Field(..., description="Difference in missing rate (current - reference)")
    unseen_categories_count: Optional[int] = Field(default=None, ge=0, description="Count of newly observed categorical values")
    unseen_categories_rate: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Fraction of records with unseen categories")
    warnings: List[str] = Field(default_factory=list, description="Methodological or data-quality warnings")
    distribution_summary: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Comparative bucket frequencies or quantile checkpoints for visualization",
    )


class MultivariateDriftResult(BaseModel):
    """Multivariate distribution shift detection result based on feature correlation Frobenius norm delta."""
    method: str = Field(default="correlation_frobenius_shift", description="Multivariate drift method name")
    statistic: float = Field(..., description="Relative Frobenius distance between correlation matrices")
    threshold: float = Field(..., description="Configured multivariate shift threshold")
    drift_detected: bool = Field(..., description="True if multivariate shift exceeds threshold")
    explanation: str = Field(..., description="Interpretation of multivariate correlation structure change")


class DriftAnalysisRequest(BaseModel):
    """Request payload to execute drift analysis on a window or provided records."""
    model_name: str = Field(..., min_length=1, description="Model family identifier")
    version: Optional[int] = Field(default=None, ge=1, description="Target version (defaults to active)")
    reference_profile_id: Optional[str] = Field(default=None, description="Optional explicit profile ID (defaults to active profile)")
    window_id: Optional[str] = Field(default=None, description="Identifier of stored window to analyze")
    records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        max_length=5000,
        description="Optional ad-hoc records to evaluate against reference (if window_id not provided)",
    )
    psi_warning_threshold: Optional[float] = Field(default=None, ge=0.01, description="Override warning PSI threshold")
    psi_critical_threshold: Optional[float] = Field(default=None, ge=0.01, description="Override critical PSI threshold")
    ks_pvalue_threshold: Optional[float] = Field(default=None, ge=0.001, le=0.5, description="Override KS p-value threshold")


class DriftAnalysisResponse(BaseModel):
    """Comprehensive drift analysis report covering all features and aggregate status."""
    report_id: str = Field(..., description="Unique drift report identifier")
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., description="Evaluated model version")
    reference_profile_id: str = Field(..., description="Reference profile identifier compared against")
    window_id: Optional[str] = Field(default=None, description="Monitoring window identifier if evaluated from window")
    sample_count: int = Field(..., ge=0, description="Number of evaluated records in current window")
    features_evaluated_count: int = Field(..., ge=0, description="Total features analyzed")
    drifted_features_count: int = Field(..., ge=0, description="Count of features flagged with critical drift")
    warning_features_count: int = Field(..., ge=0, description="Count of features flagged with moderate warning drift")
    drift_share: float = Field(..., ge=0.0, le=1.0, description="Proportion of evaluated features exhibiting critical drift")
    overall_status: DriftStatus = Field(..., description="Aggregate status: 'no_drift', 'warning', 'drift_detected', or 'insufficient_data'")
    feature_results: List[FeatureDriftResult] = Field(default_factory=list, description="Per-feature evaluation results")
    multivariate_result: Optional[MultivariateDriftResult] = Field(default=None, description="Multivariate distribution check")
    data_quality_warnings: List[str] = Field(default_factory=list, description="Dataset-level or schema mismatch warnings")
    timestamp: str = Field(..., description="ISO 8601 analysis execution timestamp")


# ==============================================================================
# Ground-Truth Performance Monitoring Schemas
# ==============================================================================

class GroundTruthRecord(BaseModel):
    """Single ground-truth label aligned by prediction_id or 0-indexed position."""
    prediction_id: Optional[str] = Field(default=None, description="Correlation identifier matching inference record")
    record_index: Optional[int] = Field(default=None, ge=0, description="Positional index within the target window")
    true_label: Any = Field(..., description="Actual ground-truth target value (scalar)")


class GroundTruthIngestRequest(BaseModel):
    """Payload for submitting delayed ground-truth labels for a model version or window."""
    model_name: str = Field(..., min_length=1, description="Model family identifier")
    version: Optional[int] = Field(default=None, ge=1, description="Model version evaluated")
    window_id: Optional[str] = Field(default=None, description="Target window identifier if aligning by index")
    labels: List[GroundTruthRecord] = Field(..., min_length=1, max_length=5000, description="List of ground-truth labels")


class GroundTruthIngestResponse(BaseModel):
    """Outcome of ground-truth label ingestion and deduplication."""
    ingested_count: int = Field(..., ge=0, description="Number of new ground-truth labels recorded")
    duplicate_count: int = Field(..., ge=0, description="Duplicate labels discarded to prevent inflation")
    matched_count: int = Field(..., ge=0, description="Labels successfully paired with recorded predictions")
    unmatched_count: int = Field(..., ge=0, description="Labels stored awaiting matching predictions")
    message: str = Field(..., description="Human-readable outcome description")


class PerformanceMetricReport(BaseModel):
    """Delayed empirical model performance report calculated against ground-truth labels."""
    report_id: str = Field(..., description="Unique performance report identifier")
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., description="Evaluated model version")
    task_type: str = Field(..., description="Task type (binary_classification, multiclass_classification, regression)")
    evaluation_window_id: Optional[str] = Field(default=None, description="Window identifier if window-scoped")
    sample_size: int = Field(..., ge=1, description="Number of evaluated prediction-label pairs")
    baseline_metric_name: str = Field(..., description="Primary metric name from training validation")
    baseline_metric_score: Optional[float] = Field(default=None, description="Score recorded at training/registration")
    current_metric_score: Optional[float] = Field(default=None, description="Score achieved on production ground truth")
    metric_delta: Optional[float] = Field(default=None, description="Raw difference: current_score - baseline_score")
    metric_delta_percentage: Optional[float] = Field(default=None, description="Relative percentage change vs baseline")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Detailed dictionary of all computed metrics")
    degradation_detected: bool = Field(..., description="True if performance dropped beyond acceptable tolerance")
    degradation_percentage: Optional[float] = Field(default=None, description="Percentage degradation observed")
    warnings: List[str] = Field(default_factory=list, description="Sample size or class distribution warnings")
    evaluated_at: str = Field(..., description="ISO 8601 evaluation timestamp")


# ==============================================================================
# Monitoring Alerts Schemas
# ==============================================================================

class MonitoringAlertRecord(BaseModel):
    """Operational alert raised when drift, quality degradation, or performance drops occur."""
    alert_id: str = Field(..., description="Unique alert identifier")
    model_name: str = Field(..., description="Model family identifier")
    version: int = Field(..., description="Model version")
    alert_type: str = Field(
        ...,
        description="'feature_drift', 'performance_degradation', 'data_quality', 'high_latency', or 'error_rate'",
    )
    severity: AlertSeverity = Field(..., description="Alert severity level")
    status: AlertStatus = Field(default=AlertStatus.ACTIVE, description="Alert lifecycle state")
    message: str = Field(..., description="Concise human-readable explanation")
    evidence: Dict[str, Any] = Field(default_factory=dict, description="Supporting metrics and statistical evidence")
    created_at: str = Field(..., description="ISO 8601 alert generation timestamp")
    acknowledged_at: Optional[str] = Field(default=None, description="Timestamp of administrative acknowledgement")
    acknowledged_by: Optional[str] = Field(default=None, description="Operator identifier who acknowledged alert")


class AlertAcknowledgeRequest(BaseModel):
    """Request payload to acknowledge an active operational alert."""
    acknowledged_by: Optional[str] = Field(default="admin", description="Operator identity acknowledging the alert")
    note: Optional[str] = Field(default=None, description="Optional resolution or triage notes")


# ==============================================================================
# Automated Retraining Schemas
# ==============================================================================

class CandidateValidationResult(BaseModel):
    """Rigorous validation gate result comparing a retrained candidate to the active production model."""
    status: CandidateValidationStatus = Field(..., description="Gate outcome: 'passed', 'rejected', or 'failed'")
    candidate_model_id: str = Field(..., description="Identifier of the retrained candidate model")
    candidate_score: float = Field(..., description="Candidate validation score")
    baseline_score: float = Field(..., description="Active production model baseline score")
    metric_name: str = Field(..., description="Primary metric evaluated")
    regression_percentage: float = Field(..., description="Observed relative regression (negative indicates improvement)")
    tolerance_percentage: float = Field(..., description="Configured maximum allowable regression threshold")
    passed: bool = Field(..., description="True if candidate satisfies validation criteria")
    details: Dict[str, Any] = Field(default_factory=dict, description="Detailed fold or split comparison breakdown")
    reasons: List[str] = Field(default_factory=list, description="Detailed explanation of acceptance or rejection")


class RetrainingJobTriggerRequest(BaseModel):
    """Request payload to trigger an automated retraining job under a defined policy."""
    model_name: str = Field(..., min_length=1, description="Model family identifier to retrain")
    version: Optional[int] = Field(default=None, ge=1, description="Source model version (defaults to active)")
    dataset_id: str = Field(..., min_length=1, description="Dataset identifier to train new candidate on")
    trigger_policy: RetrainingTriggerPolicy = Field(
        default=RetrainingTriggerPolicy.MANUAL,
        description="Trigger condition policy: 'performance_degradation', 'sustained_drift', or 'manual'",
    )
    trigger_evidence: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Supporting drift report or performance report evidence justifying retraining",
    )
    target_column: Optional[str] = Field(default=None, description="Target column name (defaults to source model target)")
    time_budget_seconds: Optional[int] = Field(default=30, ge=5, le=300, description="AutoML training budget in seconds")
    tolerance_percentage: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=0.2,
        description="Allowable relative regression percentage vs current production (defaults to settings)",
    )


class RetrainingJobRecord(BaseModel):
    """Auditable state record for an automated retraining job."""
    job_id: str = Field(..., description="Unique retraining job identifier")
    model_name: str = Field(..., description="Target model family identifier")
    source_version: int = Field(..., description="Source model version being replaced or evaluated against")
    dataset_id: str = Field(..., description="Dataset identifier used for training")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 fingerprint of the retraining dataset")
    trigger_policy: RetrainingTriggerPolicy = Field(..., description="Policy that initiated retraining")
    trigger_reason: str = Field(..., description="Detailed justification or trigger event summary")
    status: RetrainingJobStatus = Field(..., description="Execution status: 'queued', 'running', 'completed', 'failed'")
    created_at: str = Field(..., description="ISO 8601 job creation timestamp")
    started_at: Optional[str] = Field(default=None, description="ISO 8601 execution start timestamp")
    completed_at: Optional[str] = Field(default=None, description="ISO 8601 completion timestamp")
    experiment_id: Optional[str] = Field(default=None, description="Resulting AutoML experiment identifier")
    candidate_model_id: Optional[str] = Field(default=None, description="Candidate algorithm/model identifier")
    candidate_version: Optional[int] = Field(default=None, description="Registered model version number, if registered")
    candidate_validation: Optional[CandidateValidationResult] = Field(
        default=None,
        description="Validation gate outcome comparing candidate to production",
    )
    promoted_to_stage: Optional[str] = Field(default=None, description="Lifecycle stage promoted to, if promoted")
    promotion_timestamp: Optional[str] = Field(default=None, description="ISO 8601 promotion timestamp")
    error_message: Optional[str] = Field(default=None, description="Diagnostics if retraining or validation failed")


class RetrainingPromotionRequest(BaseModel):
    """Request payload to promote an eligible retrained candidate model to production or staging."""
    target_stage: str = Field(default="production", description="Target lifecycle stage: 'production' or 'staging'")
    operator: Optional[str] = Field(default="admin", description="Operator identity authorizing the promotion")
    reason: Optional[str] = Field(default=None, description="Audit reason for model promotion")


# ==============================================================================
# Overview & Operational Summary Schemas
# ==============================================================================

class MonitoringOverviewResponse(BaseModel):
    """Consolidated operational overview for the model monitoring dashboard."""
    total_telemetry_events: int = Field(..., ge=0, description="Total logged inference requests")
    models_monitored_count: int = Field(..., ge=0, description="Number of distinct model families monitored")
    active_alerts_count: int = Field(..., ge=0, description="Current unacknowledged active alerts")
    drift_detected_models_count: int = Field(..., ge=0, description="Models currently exhibiting critical drift")
    recent_alerts: List[MonitoringAlertRecord] = Field(default_factory=list, description="Latest operational alerts")
    recent_drift_reports: List[DriftAnalysisResponse] = Field(default_factory=list, description="Latest drift reports")
    recent_retraining_jobs: List[RetrainingJobRecord] = Field(default_factory=list, description="Latest retraining jobs")
