"""Pydantic schemas for Phase 9: Research-grade experimental validation, repeated runs, and statistical benchmarking."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ExperimentalProtocol(BaseModel):
    """Configuration-driven experimental protocol capturing full provenance and reproducibility parameters."""

    protocol_version: str = Field(
        default="1.0",
        description="Version of the AutoNexa experimental protocol specification",
    )
    protocol_id: str = Field(..., description="Unique hash or identifier for this configuration")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 hash of raw input data")
    target_column: str = Field(..., description="Target variable name")
    task_type: str = Field(..., description="Machine learning task type")
    evaluation_strategy: str = Field(..., description="Splitting strategy (cross_validation or holdout)")
    cv_folds: Optional[int] = Field(default=None, description="Number of folds if CV is used")
    test_size: float = Field(..., description="Proportion of data allocated to final holdout test evaluation")
    primary_metric: str = Field(..., description="Optimization and ranking objective")
    primary_metric_greater_is_better: bool = Field(..., description="Whether higher metric values represent superior performance")
    models_configured: List[str] = Field(..., description="List of candidate model family identifiers evaluated")
    random_seeds: List[int] = Field(..., description="List of random seeds executed in this experiment group")
    fixed_split: bool = Field(
        default=False,
        description="If True, split partition is fixed across seeds and only model stochasticity varies",
    )
    variability_source: str = Field(
        ...,
        description="Methodological statement explaining what sources of variance are measured by this protocol",
    )
    hardware_metadata: Dict[str, Any] = Field(default_factory=dict, description="Execution environment platform and CPU information")
    package_versions: Dict[str, str] = Field(default_factory=dict, description="Python package dependency environment versions")
    reproducibility_notes: str = Field(
        default=(
            "Exact numerical reproducibility across distinct hardware architectures or OS platforms is not guaranteed "
            "by seeds alone due to floating-point rounding, threading nondeterminism, and BLAS/LAPACK implementations. "
            "Statistical summaries reflect empirical replicates under the documented environment."
        ),
        description="Scientific limitations and reproducibility caveats",
    )


class RepeatedRunRequest(BaseModel):
    """Request payload to initiate a repeated-seed experimental series on a dataset."""

    dataset_id: str = Field(..., description="Identifier of the uploaded dataset")
    target_column: str = Field(..., description="Name of the prediction target column")
    task_type: Optional[str] = Field(default=None, description="Optional task type override (classification, regression)")
    seeds: List[int] = Field(
        default=[42, 123, 456, 789, 999],
        min_length=2,
        max_length=10,
        description="List of 2 to 10 distinct random seeds for repeated evaluation",
        examples=[[42, 123, 456, 789, 999]],
    )
    models: Optional[List[str]] = Field(
        default=None,
        description="Optional subset of candidate models to evaluate (defaults to standard task candidate pool)",
    )
    evaluation_strategy: Literal["cross_validation", "holdout"] = Field(
        default="cross_validation",
        description="Evaluation protocol per run",
    )
    cv_folds: int = Field(default=3, ge=2, le=10, description="Cross-validation fold count")
    test_size: float = Field(default=0.2, gt=0.0, lt=0.5, description="Holdout test proportion")
    primary_metric: Optional[str] = Field(default=None, description="Primary evaluation metric name")
    fixed_split: bool = Field(
        default=False,
        description="If True, uses a fixed seed (42) for data splitting and varies only model fitting seeds",
    )
    bootstrap_resamples: int = Field(
        default=1000,
        ge=100,
        le=5000,
        description="Number of resamples for non-parametric bootstrap confidence intervals",
    )


class IndividualRunRecord(BaseModel):
    """Detailed outcome record for a single random seed replicate."""

    run_index: int = Field(..., ge=1, description="1-based index of this replicate within the series")
    seed: int = Field(..., description="Random seed executed")
    status: Literal["successful", "failed"] = Field(..., description="Execution outcome")
    experiment_id: Optional[str] = Field(default=None, description="Underlying experiment identifier if persisted")
    best_model: Optional[str] = Field(default=None, description="Winning candidate model identifier")
    best_model_name: Optional[str] = Field(default=None, description="Human-readable winning model name")
    best_validation_score: Optional[float] = Field(default=None, description="Validation metric score achieved")
    test_metrics: Dict[str, float] = Field(default_factory=dict, description="Evaluation metrics on independent test partition")
    duration_seconds: float = Field(..., description="Wall-clock duration of this run in seconds")
    peak_memory_bytes: Optional[int] = Field(default=None, description="Peak memory delta recorded during run execution")
    error_message: Optional[str] = Field(default=None, description="Error details if the run failed")


class MetricStatisticalSummary(BaseModel):
    """Rigorous statistical summary and uncertainty bounds for an individual evaluation metric."""

    metric_name: str = Field(..., description="Metric name")
    valid_runs: int = Field(..., ge=0, description="Count of successful runs with valid numeric metric scores")
    mean: float = Field(..., description="Arithmetic mean of metric across valid runs")
    std: Optional[float] = Field(default=None, description="Sample standard deviation (ddof=1, None if valid_runs < 2)")
    median: float = Field(..., description="Median metric score")
    q25: Optional[float] = Field(default=None, description="25th percentile (1st quartile)")
    q75: Optional[float] = Field(default=None, description="75th percentile (3rd quartile)")
    iqr: Optional[float] = Field(default=None, description="Interquartile range (q75 - q25)")
    min: float = Field(..., description="Minimum metric score recorded")
    max: float = Field(..., description="Maximum metric score recorded")
    ci_95_t: Optional[List[float]] = Field(
        default=None,
        description="Student's t-distribution 95% confidence interval [lower, upper] (requires N >= 2)",
    )
    ci_95_bootstrap: Optional[List[float]] = Field(
        default=None,
        description="Non-parametric percentile bootstrap 95% confidence interval [lower, upper]",
    )
    interpretation_notes: str = Field(
        ...,
        description="Methodological note regarding standard error, distribution assumptions, and uncertainty interpretation",
    )


class BaselineComparisonResult(BaseModel):
    """Comparison of candidate model performance against canonical simple baselines."""

    baseline_name: str = Field(..., description="Baseline identifier (e.g., 'dummy_most_frequent', 'linear_baseline')")
    baseline_strategy: str = Field(..., description="Description of heuristic strategy implemented")
    baseline_metrics: Dict[str, Any] = Field(default_factory=dict, description="Evaluation metrics scored by baseline")
    model_metrics: Dict[str, Any] = Field(default_factory=dict, description="Evaluation metrics scored by evaluated model")
    primary_metric: str = Field(..., description="Target comparison metric")
    delta_absolute: float = Field(
        ...,
        description="Absolute difference: model_score - baseline_score",
    )
    delta_percentage: Optional[float] = Field(
        default=None,
        description="Percentage change: ((model - baseline) / |baseline|) * 100. Omitted if baseline <= 0 or near zero",
    )
    selection_quality: Literal["outperformed", "tied", "underperformed"] = Field(
        ...,
        description="Evaluation verdict: 'outperformed' (delta > 0.001), 'tied' (|delta| <= 0.001), or 'underperformed'",
    )
    notes: str = Field(..., description="Methodological commentary regarding baseline validity")


class ResourceEfficiencyReport(BaseModel):
    """Resource consumption, latency throughput, and cost analysis measurements."""

    total_wall_clock_seconds: float = Field(..., description="Total wall-clock duration of the repeated series")
    avg_fit_duration_seconds: float = Field(..., description="Average fitting duration per run")
    avg_eval_duration_seconds: float = Field(..., description="Average evaluation duration per run")
    prediction_latency_ms_per_sample: Optional[float] = Field(
        default=None,
        description="Mean single-sample prediction latency measured in milliseconds",
    )
    prediction_throughput_samples_per_sec: Optional[float] = Field(
        default=None,
        description="Prediction throughput in samples per second for benchmarked batch size",
    )
    model_artifact_size_bytes: Optional[int] = Field(
        default=None,
        description="File size on disk of the serialized best model pipeline artifact",
    )
    peak_memory_bytes: Optional[int] = Field(
        default=None,
        description="Peak memory allocated during training (captured via Python tracemalloc)",
    )
    hardware_metadata: Dict[str, Any] = Field(default_factory=dict, description="System hardware platform metadata")
    efficiency_score_ratio: Optional[float] = Field(
        default=None,
        description="Efficiency trade-off ratio: primary metric score per wall-clock second",
    )


class RepeatedRunGroupResponse(BaseModel):
    """Complete research-grade benchmark report for a repeated-seed experimental group."""

    run_group_id: str = Field(..., description="Unique server-generated identifier for this repeated experiment group")
    dataset_id: str = Field(..., description="Evaluated dataset identifier")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 dataset hash")
    target_column: str = Field(..., description="Target variable name")
    task_type: str = Field(..., description="Machine learning task type")
    protocol: ExperimentalProtocol = Field(..., description="Complete reproducible experimental protocol specification")
    n_requested_runs: int = Field(..., ge=2, description="Count of random seeds requested")
    n_successful_runs: int = Field(..., ge=0, description="Count of successfully executed replicates")
    n_failed_runs: int = Field(..., ge=0, description="Count of failed replicates")
    primary_metric: str = Field(..., description="Primary ranking metric")
    greater_is_better: bool = Field(..., description="Optimization direction for primary metric")
    metric_summaries: Dict[str, MetricStatisticalSummary] = Field(
        default_factory=dict,
        description="Descriptive statistics and 95% confidence intervals for each evaluated metric",
    )
    runs: List[IndividualRunRecord] = Field(..., description="Per-run outcome records and diagnostics")
    baseline_comparisons: List[BaselineComparisonResult] = Field(
        default_factory=list,
        description="Comparative evaluation against standard heuristic and linear baselines",
    )
    resource_efficiency: ResourceEfficiencyReport = Field(..., description="Timing, latency, throughput, and memory audit")
    comparability_verdict: Literal["strictly_comparable", "conditionally_comparable", "non_comparable"] = Field(
        ...,
        description="Comparability verdict across runs in this series",
    )
    scientific_disclaimer: str = Field(
        default=(
            "Cross-validation fold scores are not statistically independent replicates. "
            "Reported confidence intervals characterize variability across seeds under the specified protocol. "
            "Overlapping confidence intervals do not prove model equivalence without formal equivalence testing."
        ),
        description="Scientific interpretation guidance for research reporting",
    )


class BaselineComparisonRequest(BaseModel):
    """Request payload to execute baseline comparison against an existing experiment."""

    experiment_id: str = Field(..., description="Identifier of the experiment to compare against baselines")
    primary_metric: Optional[str] = Field(default=None, description="Optional metric to focus baseline delta on")
