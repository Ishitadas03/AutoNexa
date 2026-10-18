"""Pydantic schemas for Phase 10A: Controlled Hyperparameter Optimization (Random Search vs. Bayesian Optimization)."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ParameterDomain(BaseModel):
    """Specification of a single hyperparameter's tunable domain."""

    name: str = Field(..., description="Parameter attribute name on the estimator")
    param_type: Literal["int", "float", "categorical"] = Field(
        ..., description="Data type of the hyperparameter"
    )
    low: Optional[float] = Field(default=None, description="Minimum boundary for numeric parameters")
    high: Optional[float] = Field(default=None, description="Maximum boundary for numeric parameters")
    step: Optional[float] = Field(default=None, description="Discretization step size for numeric parameters")
    log: bool = Field(default=False, description="Whether to sample on a logarithmic scale")
    choices: Optional[List[Any]] = Field(
        default=None, description="Categorical choices list for categorical parameters"
    )
    description: Optional[str] = Field(default=None, description="Human-readable description of the parameter")


class HyperparameterSpace(BaseModel):
    """Structured hyperparameter search space for a specific model family."""

    model_id: str = Field(..., description="Unique model identifier matching the model registry")
    model_name: str = Field(..., description="Human-readable model name")
    task_type: str = Field(..., description="Compatible task type (classification or regression)")
    parameters: List[ParameterDomain] = Field(
        ..., description="List of tunable parameter domains"
    )


class HPOTrialRecord(BaseModel):
    """Record of an individual hyperparameter evaluation trial."""

    trial_number: int = Field(..., description="1-indexed sequence number of the trial within the search")
    strategy: Literal["random_search", "bayesian_optimization"] = Field(
        ..., description="Search strategy that proposed the configuration"
    )
    parameters: Dict[str, Any] = Field(
        ..., description="Sampled hyperparameter dictionary evaluated in this trial"
    )
    validation_score: Optional[float] = Field(
        default=None, description="Primary evaluation metric achieved on validation folds/split"
    )
    status: Literal["completed", "failed", "timeout"] = Field(
        ..., description="Execution status of this individual trial"
    )
    duration_seconds: float = Field(
        ..., description="Wall-clock duration in seconds to evaluate this trial"
    )
    best_so_far_score: Optional[float] = Field(
        default=None, description="Best validation metric observed up to and including this trial"
    )
    error_message: Optional[str] = Field(
        default=None, description="Exception or error message if status is failed"
    )


class HPOStrategyReplicateResult(BaseModel):
    """Execution results for a single search strategy on a specific seed replicate."""

    strategy: Literal["random_search", "bayesian_optimization"] = Field(
        ..., description="Search strategy identifier"
    )
    seed: int = Field(..., description="Random seed used for search sampling and model fitting")
    total_trials: int = Field(..., description="Total attempted trial budget")
    completed_trials: int = Field(..., description="Number of successfully evaluated trials")
    failed_trials: int = Field(..., description="Number of failed or errored trials")
    total_duration_seconds: float = Field(
        ..., description="Total wall-clock seconds spent across all trials for this strategy"
    )
    time_to_best_seconds: float = Field(
        ..., description="Cumulative wall-clock elapsed time until the best configuration was found"
    )
    trial_to_best: int = Field(
        ..., description="Trial index (1-based) at which the highest validation score was achieved"
    )
    best_trial_number: int = Field(
        ..., description="Trial number corresponding to the best observed configuration"
    )
    best_parameters: Dict[str, Any] = Field(
        ..., description="Optimal hyperparameter configuration selected based strictly on validation score"
    )
    best_validation_score: float = Field(
        ..., description="Peak validation score achieved by this strategy"
    )
    test_score: float = Field(
        ..., description="Generalization performance evaluated on the untouched holdout test partition"
    )
    test_metrics: Dict[str, Any] = Field(
        ..., description="Comprehensive evaluation metrics on the untouched test partition"
    )
    baseline_default_validation_score: Optional[float] = Field(
        default=None, description="Validation score achieved by the un-tuned default estimator"
    )
    improvement_over_default: Optional[float] = Field(
        default=None, description="Validation score delta achieved over un-tuned default model"
    )
    improvement_over_initial: Optional[float] = Field(
        default=None, description="Validation score delta achieved over the first attempted trial"
    )
    trials: List[HPOTrialRecord] = Field(
        ..., description="Chronological sequence of all attempted evaluation trials"
    )
    convergence_history: List[float] = Field(
        ..., description="Step-by-step best-so-far validation score at each trial step 1..T"
    )


class HPOReplicateComparison(BaseModel):
    """Matched comparison between Random Search and Bayesian Optimization on an identical seed partition."""

    replicate_index: int = Field(..., description="Index of this replicate within the seed series (0-based)")
    seed: int = Field(..., description="Random seed governing partition and search initialization")
    random_search: HPOStrategyReplicateResult = Field(
        ..., description="Outcome of Random Search on this replicate"
    )
    bayesian_optimization: HPOStrategyReplicateResult = Field(
        ..., description="Outcome of Bayesian Optimization on this replicate"
    )
    delta_validation: float = Field(
        ..., description="Difference in best validation score (Bayesian - Random Search)"
    )
    delta_test: float = Field(
        ..., description="Difference in holdout test score (Bayesian - Random Search)"
    )
    validation_winner: Literal["bayesian", "random", "tied"] = Field(
        ..., description="Winner based on validation score"
    )
    test_winner: Literal["bayesian", "random", "tied"] = Field(
        ..., description="Winner based on independent test score"
    )


class HPOStrategyAggregateSummary(BaseModel):
    """Statistical aggregation of a search strategy across all evaluated seed replicates."""

    strategy: Literal["random_search", "bayesian_optimization"] = Field(
        ..., description="Search strategy identifier"
    )
    n_replicates: int = Field(..., description="Number of evaluated seed replicates")
    validation_mean: float = Field(..., description="Sample mean of best validation scores across replicates")
    validation_std: Optional[float] = Field(
        default=None, description="Sample standard deviation (ddof=1) of validation scores"
    )
    validation_median: float = Field(..., description="Median validation score")
    validation_min: float = Field(..., description="Minimum validation score across replicates")
    validation_max: float = Field(..., description="Maximum validation score across replicates")
    test_mean: float = Field(..., description="Sample mean of holdout test scores across replicates")
    test_std: Optional[float] = Field(
        default=None, description="Sample standard deviation (ddof=1) of test scores"
    )
    test_median: float = Field(..., description="Median test score across replicates")
    test_min: float = Field(..., description="Minimum test score across replicates")
    test_max: float = Field(..., description="Maximum test score across replicates")
    avg_total_duration_seconds: float = Field(
        ..., description="Average total search duration in seconds across replicates"
    )
    avg_time_to_best_seconds: float = Field(
        ..., description="Average elapsed seconds to encounter the best configuration"
    )
    avg_trial_to_best: float = Field(
        ..., description="Average trial number at which the best configuration was discovered"
    )
    mean_convergence_curve: List[float] = Field(
        ..., description="Mean best-so-far validation score at each trial index across replicates"
    )


class HPOStatisticalComparison(BaseModel):
    """Rigorous scientific comparative analysis between Random Search and Bayesian Optimization."""

    metric_name: str = Field(..., description="Primary optimization metric evaluated")
    greater_is_better: bool = Field(..., description="Direction of optimization")
    n_replicates: int = Field(..., description="Number of paired replicates evaluated")
    mean_validation_difference: float = Field(
        ..., description="Mean paired difference in validation scores (Bayesian - Random)"
    )
    std_validation_difference: Optional[float] = Field(
        default=None, description="Sample standard deviation of paired validation differences"
    )
    mean_test_difference: float = Field(
        ..., description="Mean paired difference in holdout test scores (Bayesian - Random)"
    )
    std_test_difference: Optional[float] = Field(
        default=None, description="Sample standard deviation of paired test differences"
    )
    t_statistic_validation: Optional[float] = Field(
        default=None, description="Paired Student's t-statistic on validation score differences"
    )
    p_value_validation: Optional[float] = Field(
        default=None, description="Two-tailed p-value for paired Student's t-test on validation scores"
    )
    t_statistic_test: Optional[float] = Field(
        default=None, description="Paired Student's t-statistic on holdout test score differences"
    )
    p_value_test: Optional[float] = Field(
        default=None, description="Two-tailed p-value for paired Student's t-test on test scores"
    )
    bayesian_validation_wins: int = Field(..., description="Count of replicates where Bayesian won on validation")
    random_validation_wins: int = Field(..., description="Count of replicates where Random Search won on validation")
    validation_ties: int = Field(..., description="Count of replicates where validation scores tied")
    bayesian_test_wins: int = Field(..., description="Count of replicates where Bayesian won on test set")
    random_test_wins: int = Field(..., description="Count of replicates where Random Search won on test set")
    test_ties: int = Field(..., description="Count of replicates where test scores tied")
    scientific_conclusion: str = Field(
        ..., description="Evidence-based conclusion answering the research question under the experimental conditions"
    )
    uncertainty_limitations: str = Field(
        ..., description="Disclosed methodological caveats, sample size limitations, and degrees of freedom"
    )


class HPOExperimentProtocol(BaseModel):
    """Provenance and specification metadata for the controlled HPO research experiment."""

    protocol_version: str = Field(default="1.0", description="Protocol specification version")
    protocol_id: str = Field(..., description="Unique hash identifying this experiment configuration")
    dataset_id: str = Field(..., description="Source dataset identifier")
    dataset_name: str = Field(..., description="Source dataset filename or name")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 hash of source dataset")
    dataset_shape: List[int] = Field(..., description="[rows, columns] dimension of the raw dataset")
    target_column: str = Field(..., description="Target variable name")
    task_type: str = Field(..., description="Machine learning task type")
    model_id: str = Field(..., description="Model family evaluated")
    model_name: str = Field(..., description="Human-readable model name")
    search_space: HyperparameterSpace = Field(..., description="Tunable hyperparameter space specification")
    trial_budget: int = Field(..., description="Number of completed trials allocated per search strategy")
    seeds: List[int] = Field(..., description="List of random seeds used for replicated evaluation")
    evaluation_strategy: str = Field(..., description="Validation splitting strategy (cross_validation or holdout)")
    cv_folds: Optional[int] = Field(default=None, description="Fold count if CV was used")
    test_size: float = Field(..., description="Proportion allocated to untouched holdout test partition")
    primary_metric: str = Field(..., description="Primary optimization metric")
    greater_is_better: bool = Field(..., description="Optimization direction")
    bayesian_library: str = Field(default="optuna", description="Library used for Bayesian optimization")
    bayesian_surrogate: str = Field(
        default="Tree-structured Parzen Estimator (TPE)",
        description="Surrogate and acquisition method used by Bayesian optimizer",
    )
    n_startup_trials: int = Field(
        default=5, description="Number of initial random trials before Bayesian guidance engages"
    )
    software_manifest: Dict[str, str] = Field(
        default_factory=dict, description="Versions of python, optuna, scikit-learn, numpy, pandas, etc."
    )
    hardware_metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Host CPU and OS execution platform details"
    )


class HPOExperimentRequest(BaseModel):
    """User request payload to trigger a controlled Random Search vs Bayesian Optimization experiment."""

    dataset_id: str = Field(..., description="Dataset identifier previously uploaded")
    target_column: str = Field(..., description="Target column name")
    task_type: Optional[str] = Field(default=None, description="Optional task type override")
    model_id: str = Field(default="random_forest", description="Model family ID to optimize")
    trial_budget: int = Field(
        default=20,
        ge=5,
        le=100,
        description="Maximum completed trials per search strategy per replicate (default 20)",
        examples=[20],
    )
    seeds: List[int] = Field(
        default=[42, 123, 456],
        min_length=1,
        max_length=10,
        description="List of random seeds for replicated evaluation",
        examples=[[42, 123, 456]],
    )
    evaluation_strategy: Literal["cross_validation", "holdout"] = Field(
        default="cross_validation",
        description="Strategy for estimating validation score during hyperparameter search",
    )
    cv_folds: int = Field(default=3, ge=2, le=5, description="Fold count for cross validation")
    test_size: float = Field(
        default=0.2, gt=0.05, lt=0.5, description="Untouched final test set proportion"
    )
    primary_metric: Optional[str] = Field(
        default=None, description="Primary optimization metric (defaults to task default)"
    )


class HPOExperimentResponse(BaseModel):
    """Complete experimental report for the controlled HPO comparison."""

    experiment_id: str = Field(..., description="Unique identifier for this HPO experiment")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    protocol: HPOExperimentProtocol = Field(..., description="Experimental protocol and provenance")
    replicates: List[HPOReplicateComparison] = Field(
        ..., description="Matched comparisons for each evaluated seed replicate"
    )
    random_search_summary: HPOStrategyAggregateSummary = Field(
        ..., description="Aggregated summary of Random Search performance"
    )
    bayesian_summary: HPOStrategyAggregateSummary = Field(
        ..., description="Aggregated summary of Bayesian Optimization performance"
    )
    statistical_comparison: HPOStatisticalComparison = Field(
        ..., description="Paired inferential statistics and evidence-based conclusion"
    )
    overall_winner: Literal["bayesian_optimization", "random_search", "inconclusive"] = Field(
        ..., description="Overall empirical conclusion based on test and validation results"
    )
    total_wall_clock_seconds: float = Field(
        ..., description="Total wall-clock duration in seconds for the entire experiment series"
    )
    csv_export_url: str = Field(..., description="API endpoint to download per-trial raw CSV")
