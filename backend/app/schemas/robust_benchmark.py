"""Pydantic schemas for Phase 11: Robust AutoML Benchmarking & Statistical Reliability."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from app.schemas.research_benchmark import MetricStatisticalSummary


class DatasetCatalogEntry(BaseModel):
    """Metadata profile and provenance record for a benchmark dataset."""

    dataset_id: str = Field(..., description="Unique dataset identifier")
    name: str = Field(..., description="Human-readable title")
    source: Literal["local_fixture", "openml", "pmlb", "custom"] = Field(
        ..., description="Origin provider of the dataset"
    )
    provenance: str = Field(..., description="Detailed provenance, OpenML ID, or citation")
    license: str = Field(..., description="Data usage license")
    task_type: Literal["binary_classification", "multiclass_classification", "regression"] = Field(
        ..., description="Machine learning task type"
    )
    target_column: str = Field(..., description="Prediction target variable name")
    n_rows: int = Field(..., ge=1, description="Number of instances (samples)")
    n_features: int = Field(..., ge=1, description="Number of input features excluding target")
    numeric_features_count: int = Field(..., ge=0, description="Count of continuous / numeric features")
    categorical_features_count: int = Field(..., ge=0, description="Count of categorical / string features")
    has_missing_values: bool = Field(..., description="Whether any cell contains missing / null data")
    missing_cells_count: int = Field(default=0, ge=0, description="Total count of null entries across all cells")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 hash of raw CSV bytes")
    is_cached: bool = Field(..., description="Whether dataset is currently present on local disk")
    description: str = Field(..., description="Brief summary of domain and characteristics")


class PairedSeedDifferenceRecord(BaseModel):
    """Individual seed-matched delta between candidate method and baseline."""

    seed: int = Field(..., description="Random seed executed")
    score_a: float = Field(..., description="Metric score achieved by Method A (Candidate)")
    score_b: float = Field(..., description="Metric score achieved by Method B (Baseline)")
    delta: float = Field(..., description="Score difference: score_a - score_b")


class PairedComparisonResult(BaseModel):
    """Rigorous statistical comparison between matched seed runs of two methods."""

    method_a: str = Field(..., description="Candidate method identifier")
    method_b: str = Field(..., description="Baseline method identifier")
    metric_name: str = Field(..., description="Evaluation metric compared")
    greater_is_better: bool = Field(..., description="True if higher metric value represents superior performance")
    n_matched_seeds: int = Field(..., ge=0, description="Number of matched seeds where both methods succeeded")
    mean_difference: float = Field(..., description="Mean paired difference: mean(score_a - score_b)")
    std_difference: Optional[float] = Field(default=None, description="Sample standard deviation of paired differences (ddof=1)")
    ci_95_difference: Optional[List[float]] = Field(
        default=None,
        description="Student's t 95% confidence interval [lower, upper] for mean paired difference",
    )
    cohens_dz: Optional[float] = Field(
        default=None,
        description="Paired Cohen's dz effect size: mean_difference / std_difference",
    )
    cohens_dz_magnitude: Literal["negligible", "small", "medium", "large", "zero"] = Field(
        ...,
        description="Standard effect size interpretation magnitude (|dz| < 0.2: negligible, < 0.5: small, < 0.8: medium, >= 0.8: large)",
    )
    t_statistic: Optional[float] = Field(default=None, description="Paired Student's t-test statistic")
    t_test_p_value: Optional[float] = Field(default=None, description="Two-tailed p-value from paired Student's t-test")
    wilcoxon_statistic: Optional[float] = Field(default=None, description="Wilcoxon signed-rank test statistic (non-parametric)")
    wilcoxon_p_value: Optional[float] = Field(default=None, description="Two-tailed p-value from Wilcoxon signed-rank test")
    bonferroni_adjusted_p_value: Optional[float] = Field(
        default=None,
        description="Bonferroni-adjusted p-value accounting for family-wise error rate across multiple comparisons",
    )
    verdict: Literal[
        "statistically_superior",
        "statistically_inferior",
        "inconclusive_high_variance",
        "statistically_equivalent",
        "insufficient_sample_size",
    ] = Field(
        ...,
        description="Methodological verdict taking into account effect size, confidence bounds, and sample size",
    )
    per_seed_differences: List[PairedSeedDifferenceRecord] = Field(
        default_factory=list,
        description="Granular seed-by-seed paired scores and deltas",
    )
    interpretation: str = Field(..., description="Plain-language scientific summary of the statistical comparison")


class SeedRunRecord(BaseModel):
    """Raw empirical measurement record for a single model under a specific random seed."""

    run_id: str = Field(..., description="Unique execution record identifier")
    seed: int = Field(..., description="Random seed executed")
    method_name: str = Field(..., description="Automated model or strategy identifier")
    status: Literal["completed", "failed"] = Field(..., description="Execution status")
    validation_score: Optional[float] = Field(default=None, description="Out-of-fold cross-validation primary metric score")
    holdout_test_score: Optional[float] = Field(default=None, description="Independent holdout test partition score (evaluated post-selection)")
    training_duration_seconds: float = Field(..., description="Monotonic wall-clock seconds to fit the full pipeline")
    inference_latency_ms: float = Field(..., description="Repeated benchmark inference latency in ms per individual sample")
    inference_throughput_sec: float = Field(..., description="Inference throughput in samples per second")
    model_artifact_size_bytes: int = Field(..., description="Serialized pipeline disk size in bytes (joblib)")
    peak_heap_bytes: Optional[int] = Field(default=None, description="Peak Python heap memory in bytes via tracemalloc")
    peak_process_rss_bytes: Optional[int] = Field(default=None, description="Peak OS process Resident Set Size in bytes via psutil")
    rss_delta_bytes: Optional[int] = Field(default=None, description="Process RSS delta (post-fit minus pre-fit) in bytes via psutil")
    complexity_score: float = Field(..., description="Quantified structural complexity score")
    complexity_unit: str = Field(..., description="Estimator-specific complexity unit")
    error_message: Optional[str] = Field(default=None, description="Failure diagnostic message if status is failed")


class MethodAggregateStatistics(BaseModel):
    """Comprehensive statistical aggregation and uncertainty bounds for an AutoML method across evaluated seeds."""

    method_name: str = Field(..., description="Model or strategy name")
    n_seeds_requested: int = Field(..., ge=1, description="Count of random seeds requested")
    n_seeds_successful: int = Field(..., ge=0, description="Count of seeds that successfully trained and evaluated")
    n_seeds_failed: int = Field(..., ge=0, description="Count of failed seeds")
    validation_score: MetricStatisticalSummary = Field(..., description="Validation primary metric summary (mean, std, median, IQR, 95% CIs)")
    holdout_test_score: Optional[MetricStatisticalSummary] = Field(default=None, description="Untouched holdout test score summary")
    training_duration_seconds: MetricStatisticalSummary = Field(..., description="Training duration summary")
    inference_latency_ms: MetricStatisticalSummary = Field(..., description="Inference latency summary")
    model_artifact_size_bytes: MetricStatisticalSummary = Field(..., description="Model artifact disk footprint summary")
    peak_heap_bytes: MetricStatisticalSummary = Field(..., description="Python heap peak memory summary (tracemalloc)")
    peak_process_rss_bytes: Optional[MetricStatisticalSummary] = Field(default=None, description="OS process RSS peak memory summary (psutil)")
    rss_delta_bytes: Optional[MetricStatisticalSummary] = Field(default=None, description="OS process RSS delta summary (psutil)")


class RobustBenchmarkRequest(BaseModel):
    """Payload to launch a multi-seed, multi-dataset robust benchmarking experiment."""

    dataset_id: str = Field(..., description="Source dataset identifier from catalog or uploaded datasets")
    target_column: Optional[str] = Field(default=None, description="Target column override")
    task_type: Optional[str] = Field(default=None, description="Task type override")
    seeds: List[int] = Field(
        default=[42, 123, 456, 789, 1011],
        min_length=2,
        max_length=15,
        description="List of 2 to 15 distinct random seeds for multi-seed matched evaluation",
    )
    candidate_strategies: Optional[List[str]] = Field(
        default=None,
        description="Optional list of model family IDs to evaluate (defaults to task candidate pool)",
    )
    baseline_strategy: Optional[str] = Field(
        default=None,
        description="Designated baseline method identifier to compute paired differences against",
    )
    evaluation_strategy: Literal["cross_validation", "holdout"] = Field(
        default="cross_validation",
        description="Validation strategy per seed run",
    )
    cv_folds: int = Field(default=3, ge=2, le=5, description="Number of cross-validation folds")
    test_size: float = Field(default=0.2, gt=0.05, lt=0.5, description="Proportion allocated to untouched holdout test partition")
    primary_metric: Optional[str] = Field(default=None, description="Primary evaluation metric name")
    alpha: float = Field(default=0.05, gt=0.001, lt=0.2, description="Significance level alpha for confidence intervals and hypothesis tests")
    bootstrap_resamples: int = Field(default=1000, ge=100, le=5000, description="Bootstrap resample count for 95% bootstrap CIs")


class RobustBenchmarkResponse(BaseModel):
    """Comprehensive experimental report for robust multi-seed benchmarking with statistical reliability."""

    robust_benchmark_id: str = Field(..., description="Unique identifier for this robust benchmark experiment")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    dataset: DatasetCatalogEntry = Field(..., description="Detailed provenance, license, and fingerprint of the evaluated dataset")
    seeds_evaluated: List[int] = Field(..., description="List of random seeds evaluated")
    primary_metric: str = Field(..., description="Primary optimization and ranking metric")
    greater_is_better: bool = Field(..., description="True if higher metric score represents superior performance")
    baseline_strategy: str = Field(..., description="Designated baseline model against which paired differences were evaluated")
    method_summaries: Dict[str, MethodAggregateStatistics] = Field(
        ..., description="Aggregated statistics, quantiles, and uncertainty bounds per method across seeds"
    )
    paired_comparisons: List[PairedComparisonResult] = Field(
        default_factory=list,
        description="Formal statistical hypothesis tests and effect sizes comparing candidates to the baseline",
    )
    raw_seed_runs: List[SeedRunRecord] = Field(
        ..., description="Complete trace of all individual seed executions and resource measurements"
    )
    execution_platform: Dict[str, Any] = Field(
        ..., description="Hardware and software context (CPU, RAM, OS, library versions, memory profiler scope)"
    )
    scientific_guidance: str = Field(
        ..., description="Scientific interpretation guidance explaining uncertainty, non-independence, and limitations"
    )
    csv_export_url: str = Field(..., description="Direct URL endpoint to download the seed results CSV export")
