"""Pydantic schemas for reproducible research benchmarking and multi-experiment comparison."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class BenchmarkCompareRequest(BaseModel):
    """Configuration payload for benchmarking and comparing trained AutoML experiments."""

    experiment_ids: List[str] = Field(
        ...,
        min_length=2,
        max_length=20,
        description="List of 2 to 20 unique experiment IDs to benchmark and compare",
        examples=[["exp-1", "exp-2"]],
    )
    baseline_experiment_id: Optional[str] = Field(
        default=None,
        description="Optional experiment ID to serve as reference baseline for computing relative performance deltas",
    )
    sort_metric: Optional[str] = Field(
        default=None,
        description="Optional primary metric name to sort leaderboard (defaults to experiments' common primary metric)",
    )


class ComparabilityWarning(BaseModel):
    """Audit finding regarding potential non-equivalence in benchmark conditions."""

    dimension: str = Field(
        ...,
        description="Evaluation dimension: 'dataset_fingerprint', 'target_column', 'evaluation_strategy', 'random_state', 'split_sizes', or 'features'",
    )
    severity: Literal["critical", "warning", "info"] = Field(
        ...,
        description="Severity level: 'critical' (renders direct metric comparison invalid), 'warning', or 'info'",
    )
    message: str = Field(..., description="Explanation of condition discrepancy and scientific implications")


class ModelBenchmarkEntry(BaseModel):
    """Benchmark metrics and reproducibility metadata for an individual experiment candidate."""

    rank: int = Field(..., ge=1, description="Relative position on leaderboard based on sort metric")
    experiment_id: str = Field(..., description="AutoML experiment identifier")
    model_id: str = Field(..., description="Winning candidate model identifier")
    model_name: str = Field(..., description="Human-readable model name")
    task_type: str = Field(..., description="Task type modeled")
    target_column: str = Field(..., description="Target column predicted")
    dataset_id: str = Field(..., description="Dataset identifier")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 fingerprint of the dataset")
    evaluation_strategy: str = Field(..., description="Evaluation protocol used (holdout or cross_validation)")
    random_state: Optional[int] = Field(default=None, description="Random seed used for splitting and training")
    test_size: Optional[float] = Field(default=None, description="Holdout test proportion")
    train_rows: Optional[int] = Field(default=None, description="Number of training samples")
    test_rows: Optional[int] = Field(default=None, description="Number of test samples")
    features_count: int = Field(..., ge=1, description="Number of input features")
    primary_metric_name: str = Field(..., description="Primary metric evaluated")
    primary_metric_score: Optional[float] = Field(default=None, description="Score on primary metric")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="All recorded evaluation metrics")
    training_duration_seconds: Optional[float] = Field(default=None, description="Wall-clock duration of training")
    is_baseline: bool = Field(default=False, description="True if this experiment serves as the comparison baseline")
    delta_primary_metric: Optional[float] = Field(
        default=None,
        description="Absolute difference relative to baseline: (model_score - baseline_score)",
    )
    delta_percentage: Optional[float] = Field(
        default=None,
        description="Percentage change relative to baseline: ((model_score - baseline_score) / |baseline_score|) * 100",
    )
    package_versions: Optional[Dict[str, str]] = Field(
        default=None,
        description="Recorded environment package versions",
    )
    mlflow_run_id: Optional[str] = Field(default=None, description="MLflow run ID if tracking was enabled")


class BenchmarkComparisonResponse(BaseModel):
    """Machine-readable benchmark report comparing multiple experiments."""

    benchmark_id: str = Field(..., description="Unique server-generated benchmark report identifier")
    task_type: str = Field(..., description="Common task type evaluated across experiments")
    sort_metric: str = Field(..., description="Metric utilized to rank models on the leaderboard")
    sort_metric_greater_is_better: bool = Field(
        ...,
        description="True if higher metric score represents superior performance",
    )
    is_strictly_comparable: bool = Field(
        ...,
        description="True if all models were trained and evaluated under strictly identical conditions",
    )
    comparability_verdict: Literal["strictly_comparable", "conditionally_comparable", "non_comparable"] = Field(
        ...,
        description="Scientific comparability classification based on dataset, split, and evaluation alignment",
    )
    comparability_warnings: List[ComparabilityWarning] = Field(
        default_factory=list,
        description="List of detected differences in datasets, splits, random seeds, or evaluation protocols",
    )
    baseline_experiment_id: Optional[str] = Field(
        default=None,
        description="Experiment ID designated as comparison baseline",
    )
    models_compared_count: int = Field(..., ge=2, description="Count of compared experiments")
    leaderboard: List[ModelBenchmarkEntry] = Field(
        ...,
        description="Ranked leaderboard of models ordered from best to worst by sort metric",
    )
    reproducibility_manifest: Dict[str, Any] = Field(
        ...,
        description="Reproducibility parameters, dataset fingerprints, seed configurations, and software versions",
    )
    scientific_guidance: str = Field(
        default=(
            "Valid model comparison requires identical data partitions, identical feature definitions, "
            "and matched metric definitions. A higher metric score does not imply true superiority if "
            "evaluations were performed across different splits, seeds, or dataset revisions."
        ),
        description="Scientific benchmarking interpretation principles",
    )
