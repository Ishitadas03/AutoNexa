"""Pydantic schemas for AutoML training requests, model evaluation, and experiment results."""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ModelStatus(str, Enum):
    """Execution status for an individual candidate model."""
    SUCCESSFUL = "successful"
    FAILED = "failed"
    SKIPPED_TIMEOUT = "skipped_timeout"


class TrainingRequest(BaseModel):
    """Configuration payload for training AutoML candidate models on an uploaded dataset."""

    target_column: str = Field(
        ...,
        min_length=1,
        description="Name of the target column to model and predict",
        examples=["churn", "price", "label"],
    )
    task_type: Optional[Literal["classification", "regression"]] = Field(
        default=None,
        description="Optional task override. If omitted, task is inferred via dataset intelligence heuristics.",
        examples=["classification", "regression"],
    )
    test_size: float = Field(
        default=0.2,
        ge=0.05,
        le=0.5,
        description="Fraction of data reserved for holdout evaluation (0.05 to 0.50)",
        examples=[0.2],
    )
    random_state: int = Field(
        default=42,
        description="Reproducible pseudo-random seed for data splitting and stochastic estimators",
        examples=[42],
    )
    time_budget_seconds: int = Field(
        default=60,
        ge=5,
        le=300,
        description="Maximum execution time budget in seconds (5 to 300 seconds)",
        examples=[60],
    )
    models: Optional[List[str]] = Field(
        default=None,
        description="Optional list of specific candidate model identifiers to evaluate",
        examples=[["dummy", "logistic_regression", "random_forest"]],
    )
    primary_metric: Optional[str] = Field(
        default=None,
        description=(
            "Primary metric for ranking candidate models. "
            "Supported for classification: 'f1_weighted', 'accuracy', 'precision_weighted', 'recall_weighted', 'roc_auc'. "
            "Supported for regression: 'rmse', 'mae', 'r2'."
        ),
        examples=["f1_weighted", "rmse"],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "target_column": "purchased",
                "task_type": "classification",
                "test_size": 0.2,
                "random_state": 42,
                "time_budget_seconds": 60,
                "models": ["dummy", "logistic_regression", "random_forest"],
                "primary_metric": "f1_weighted",
            }
        }
    }


class ModelEvaluationResult(BaseModel):
    """Detailed evaluation outcome and performance metrics for a candidate estimator."""

    model_id: str = Field(..., description="Unique estimator identifier", examples=["random_forest"])
    model_name: str = Field(..., description="Human-readable model name", examples=["Random Forest Classifier"])
    status: ModelStatus = Field(..., description="Execution status: successful, failed, or skipped_timeout")
    metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Calculated validation metrics on the holdout evaluation set",
        examples=[{"accuracy": 0.85, "f1_weighted": 0.84, "precision_weighted": 0.86, "recall_weighted": 0.85}],
    )
    duration_seconds: float = Field(
        ...,
        ge=0.0,
        description="Training and validation duration in seconds",
        examples=[0.342],
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Sanitized failure description if estimator training failed",
    )


class TrainingResponse(BaseModel):
    """Comprehensive experiment outcome from an AutoML model selection and training run."""

    experiment_id: str = Field(..., description="Unique server-generated experiment identifier")
    dataset_id: str = Field(..., description="Identifier of the dataset used for training")
    target_column: str = Field(..., description="Target column modeled")
    task_type: str = Field(..., description="Task type executed: binary_classification, multiclass_classification, or regression")
    primary_metric: str = Field(..., description="Metric utilized for ranking models")
    primary_metric_greater_is_better: bool = Field(
        ...,
        description="True if higher metric values indicate superior performance; False if lower is better (e.g., RMSE, MAE)",
    )
    random_state: int = Field(..., description="Random seed used for the experiment")
    test_size: float = Field(..., description="Holdout evaluation split fraction")
    train_rows: int = Field(..., ge=1, description="Number of samples used for training and preprocessing fits")
    test_rows: int = Field(..., ge=1, description="Number of samples reserved for unbiased holdout evaluation")
    features_count: int = Field(..., ge=1, description="Number of feature columns utilized (excluding target)")
    models_evaluated: List[ModelEvaluationResult] = Field(..., description="Detailed per-model evaluation results")
    ranked_models: List[str] = Field(
        ...,
        description="Ordered list of successful model identifiers ranked from best to worst by primary metric",
    )
    best_model: Optional[str] = Field(
        default=None,
        description="Identifier of the top-performing candidate model",
    )
    total_duration_seconds: float = Field(
        ...,
        ge=0.0,
        description="Total wall-clock duration of the AutoML training experiment in seconds",
    )
    artifacts_saved: bool = Field(
        ...,
        description="True if model pipeline binary and metadata were persisted to disk",
    )
    disclaimer: str = Field(
        default=(
            "Evaluation metrics reflect performance on a holdout test split. "
            "Results are empirical estimates and may vary with different dataset splits, distributions, or sample sizes."
        ),
        description="Scientific reporting disclaimer regarding holdout evaluation estimates",
    )
