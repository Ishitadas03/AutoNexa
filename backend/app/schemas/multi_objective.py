"""Pydantic schemas for Phase 10B: Multi-Objective AutoML Optimization & Resource-Aware Model Selection."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


ObjectiveDirection = Literal["maximize", "minimize"]
SelectionPolicy = Literal[
    "best_performance_constrained",
    "lowest_latency_constrained",
    "lowest_size_constrained",
    "balanced_compromise",
]


class ObjectiveDefinition(BaseModel):
    """Formal definition of an evaluation objective in the multi-objective Pareto space."""

    name: str = Field(..., description="Human-readable objective name")
    key: str = Field(..., description="Machine-readable attribute key")
    direction: ObjectiveDirection = Field(
        ..., description="Optimization direction (maximize or minimize)"
    )
    unit: str = Field(..., description="Unit of measurement (e.g. score, ms, bytes, seconds)")
    description: str = Field(..., description="Detailed description of what this metric measures")


class ResourceConstraints(BaseModel):
    """User-specified resource boundaries and minimum acceptable performance limits."""

    max_training_duration_seconds: Optional[float] = Field(
        default=None, gt=0, description="Upper bound on permissible model training time in seconds"
    )
    max_inference_latency_ms: Optional[float] = Field(
        default=None, gt=0, description="Upper bound on allowable per-sample prediction latency in milliseconds"
    )
    max_artifact_size_bytes: Optional[int] = Field(
        default=None, gt=0, description="Upper bound on serialized model disk footprint in bytes"
    )
    max_peak_memory_bytes: Optional[int] = Field(
        default=None, gt=0, description="Upper bound on peak RAM allocated during training in bytes"
    )
    min_predictive_score: Optional[float] = Field(
        default=None, description="Lower bound on acceptable validation performance score"
    )
    max_complexity: Optional[float] = Field(
        default=None, gt=0, description="Upper bound on model complexity indicator"
    )


class ConstraintViolation(BaseModel):
    """Structured record of an unmet user resource constraint."""

    constraint_name: str = Field(..., description="Name of the breached constraint")
    threshold: float = Field(..., description="User-configured boundary threshold")
    actual_value: float = Field(..., description="Empirically measured value on candidate model")
    unit: str = Field(..., description="Measurement unit")
    message: str = Field(..., description="Human-readable explanation of the violation")


class ModelComplexityMetadata(BaseModel):
    """Model-family specific structural complexity quantification."""

    estimator_type: str = Field(..., description="Underlying scikit-learn estimator class name")
    tree_count: Optional[int] = Field(default=None, description="Number of trees in ensemble estimators")
    max_depth: Optional[int] = Field(default=None, description="Observed maximum tree depth")
    total_tree_nodes: Optional[int] = Field(default=None, description="Sum of internal and leaf nodes across trees")
    leaf_count: Optional[int] = Field(default=None, description="Total leaf count across trees")
    n_parameters: Optional[int] = Field(default=None, description="Total tunable parameter count")
    n_nonzero_coefficients: Optional[int] = Field(
        default=None, description="Number of non-zero feature weights in linear estimators"
    )
    summary_complexity_score: float = Field(
        ..., description="Primary scalar complexity score for comparative Pareto analysis"
    )
    complexity_unit: str = Field(..., description="Unit of the summary complexity score")
    notes: str = Field(..., description="Explanation of how structural complexity was quantified")


class CandidateMeasurement(BaseModel):
    """Empirical measurements across predictive and operational dimensions for a candidate model."""

    candidate_id: str = Field(..., description="Unique identifier for the evaluated candidate configuration")
    model_id: str = Field(..., description="Model family identifier (e.g. random_forest, ridge)")
    model_name: str = Field(..., description="Human-readable model name")
    hyperparameters: Dict[str, Any] = Field(default_factory=dict, description="Hyperparameter configuration dictionary")
    status: Literal["completed", "failed"] = Field(..., description="Execution status of candidate profiling")
    error_message: Optional[str] = Field(default=None, description="Diagnostic message if profiling failed")

    # Predictive Performance (Validation)
    predictive_metric: str = Field(..., description="Name of the primary predictive metric")
    predictive_direction: ObjectiveDirection = Field(..., description="Direction of primary predictive metric")
    validation_score: Optional[float] = Field(
        default=None, description="Primary validation score computed out-of-fold or on validation split"
    )
    cv_std: Optional[float] = Field(default=None, description="Sample standard deviation across cross-validation folds")

    # Operational & Resource Metrics
    training_duration_seconds: float = Field(
        ..., description="Monotonic wall-clock seconds to fit the full pipeline"
    )
    inference_latency_ms_per_sample: float = Field(
        ..., description="Inference latency in milliseconds per individual sample under repeated benchmark"
    )
    inference_throughput_samples_per_sec: float = Field(
        ..., description="Predicted samples per second under batch evaluation"
    )
    model_artifact_size_bytes: int = Field(
        ..., description="Serialized pipeline disk size in bytes (joblib)"
    )
    peak_memory_bytes: Optional[int] = Field(
        default=None,
        description="Peak memory allocated during training in bytes on the Python heap via tracemalloc (excludes external native C/C++ library buffers)",
    )
    peak_process_rss_bytes: Optional[int] = Field(
        default=None,
        description="Operating system process Resident Set Size (RSS) in bytes measured via psutil at training completion",
    )
    rss_delta_bytes: Optional[int] = Field(
        default=None,
        description="Change in process Resident Set Size (RSS) during training in bytes via psutil",
    )

    # Complexity
    complexity: ModelComplexityMetadata = Field(..., description="Quantified structural model complexity")

    # Post-selection independent holdout test evaluation (populated only when candidate is selected)
    test_score: Optional[float] = Field(
        default=None, description="Independent holdout test score evaluated only after model selection"
    )
    test_metrics: Optional[Dict[str, Any]] = Field(
        default=None, description="Full metric dictionary on untouched test partition"
    )


class ParetoCandidateResult(BaseModel):
    """Evaluation result for a candidate within the multi-objective Pareto space."""

    measurement: CandidateMeasurement = Field(..., description="Underlying measured operational and predictive metrics")
    is_feasible: bool = Field(..., description="Whether the candidate satisfies all user-configured resource constraints")
    constraint_violations: List[ConstraintViolation] = Field(
        default_factory=list, description="List of violated resource constraints"
    )
    is_pareto_optimal: bool = Field(
        ..., description="Whether candidate belongs to the non-dominated Pareto frontier (among feasible candidates)"
    )
    dominated_by: List[str] = Field(
        default_factory=list, description="Candidate IDs of competing models that strictly dominate this candidate"
    )
    dominates: List[str] = Field(
        default_factory=list, description="Candidate IDs of competing models dominated by this candidate"
    )
    status_explanation: str = Field(
        ..., description="Human-readable justification of Pareto optimality, dominance, or feasibility failure"
    )
    normalized_scores: Dict[str, float] = Field(
        default_factory=dict, description="Normalized [0, 1] utility scores per objective (1.0 = best observed)"
    )
    distance_to_utopia: Optional[float] = Field(
        default=None, description="Euclidean distance to ideal utopia point in normalized objective space"
    )


class MultiObjectiveSelectionRequest(BaseModel):
    """Request payload to apply custom resource constraints and selection policies on an existing experiment."""

    constraints: Optional[ResourceConstraints] = Field(
        default=None, description="User-configured resource limits and performance thresholds"
    )
    policy: SelectionPolicy = Field(
        default="best_performance_constrained",
        description="Selection policy governing model choice among feasible Pareto candidates",
    )
    custom_weights: Optional[Dict[str, float]] = Field(
        default=None, description="Optional relative weights for balanced compromise selection"
    )


class MultiObjectiveSelectionResult(BaseModel):
    """Outcome of resource-aware model selection."""

    selected_candidate_id: Optional[str] = Field(
        default=None, description="Candidate ID of the model selected under the specified policy"
    )
    policy_used: SelectionPolicy = Field(..., description="Applied selection policy")
    satisfies_all_constraints: bool = Field(
        ..., description="True if at least one candidate satisfied all specified constraints"
    )
    feasible_candidates_count: int = Field(..., description="Count of evaluated candidates satisfying all constraints")
    infeasible_candidates_count: int = Field(..., description="Count of candidates violating at least one constraint")
    selection_explanation: str = Field(
        ..., description="Evidence-based rationale explaining the selected model and trade-offs"
    )
    selected_candidate: Optional[ParetoCandidateResult] = Field(
        default=None, description="Detailed profile of the selected model"
    )
    tied_candidate_ids: List[str] = Field(
        default_factory=list, description="Candidate IDs of alternative models tied under the selection criteria"
    )
    untouched_test_evaluation: Optional[Dict[str, Any]] = Field(
        default=None, description="Unbiased holdout test set evaluation metrics for the selected model"
    )


class MultiObjectiveExperimentRequest(BaseModel):
    """Payload to launch a full multi-objective AutoML evaluation across candidate models."""

    dataset_id: str = Field(..., description="Source dataset identifier")
    target_column: str = Field(..., description="Target variable name")
    task_type: Optional[str] = Field(default=None, description="Optional task type override")
    candidate_models: Optional[List[str]] = Field(
        default=None,
        description="List of model family IDs to evaluate (defaults to all supported families)",
    )
    include_hpo_candidates: bool = Field(
        default=True,
        description="Whether to include tuned hyperparameter variants alongside standard default models",
    )
    evaluation_strategy: Literal["cross_validation", "holdout"] = Field(
        default="cross_validation", description="Validation strategy during model training"
    )
    cv_folds: int = Field(default=3, ge=2, le=5, description="Number of folds if cross-validation is used")
    test_size: float = Field(default=0.2, gt=0.05, lt=0.5, description="Proportion allocated to untouched holdout test partition")
    primary_metric: Optional[str] = Field(default=None, description="Predictive optimization metric name")
    random_state: int = Field(default=42, description="Random seed for data splitting and estimator initialization")
    constraints: Optional[ResourceConstraints] = Field(
        default=None, description="Optional initial resource constraints"
    )
    selection_policy: SelectionPolicy = Field(
        default="best_performance_constrained", description="Initial model selection policy"
    )


class MultiObjectiveExperimentResponse(BaseModel):
    """Complete experimental report for multi-objective optimization and resource-aware selection."""

    experiment_id: str = Field(..., description="Unique identifier for this multi-objective experiment")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_name: str = Field(..., description="Source dataset filename")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 hash of raw input data")
    task_type: str = Field(..., description="Machine learning task type")
    primary_metric: str = Field(..., description="Predictive performance metric evaluated")
    objectives_evaluated: List[ObjectiveDefinition] = Field(
        ..., description="List of objectives analyzed in this multi-objective space"
    )
    candidates: List[ParetoCandidateResult] = Field(
        ..., description="Full list of evaluated candidate models with operational measurements and Pareto flags"
    )
    pareto_frontier_candidate_ids: List[str] = Field(
        ..., description="IDs of non-dominated feasible candidates forming the Pareto frontier"
    )
    selection: MultiObjectiveSelectionResult = Field(
        ..., description="Outcome of resource-aware model selection under active constraints and policy"
    )
    execution_platform: Dict[str, Any] = Field(
        ..., description="Hardware and software context (CPU, RAM, OS, library versions) for measurement reproducibility"
    )
    profiling_methodology_disclaimer: str = Field(
        ..., description="Disclosed methodological details regarding warm-up, timing precision, and memory measurement"
    )
    csv_export_url: str = Field(..., description="API endpoint to download candidates as CSV")
