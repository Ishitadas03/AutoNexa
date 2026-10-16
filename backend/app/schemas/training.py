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
    evaluation_strategy: Literal["holdout", "cross_validation"] = Field(
        default="holdout",
        description="Evaluation protocol: 'holdout' (single split) or 'cross_validation' (K-fold CV on training data with optional independent test set)",
        examples=["holdout", "cross_validation"],
    )
    cv_folds: int = Field(
        default=5,
        ge=2,
        le=10,
        description="Number of folds for cross-validation evaluation (2 to 10)",
        examples=[5],
    )
    cv_rare_class_fallback: bool = Field(
        default=True,
        description=(
            "When true, allows classification CV to gracefully fall back from StratifiedKFold to KFold "
            "if rare classes have fewer samples than cv_folds, recording an audit warning in the evaluation protocol. "
            "When false, raises a validation error."
        ),
    )
    holdout_test: bool = Field(
        default=True,
        description=(
            "When true in cross-validation mode, reserves an independent holdout test split (sized by test_size) "
            "that remains completely untouched during candidate selection and hyperparameter decisions, "
            "evaluating the selected best model on it once for an unbiased final performance estimate."
        ),
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
                "evaluation_strategy": "holdout",
                "cv_folds": 5,
                "holdout_test": True,
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
        description="Validation metrics (holdout set or aggregated CV mean metrics)",
        examples=[{"accuracy": 0.85, "f1_weighted": 0.84, "precision_weighted": 0.86, "recall_weighted": 0.85}],
    )
    cv_scores: Optional[List[float]] = Field(
        default=None,
        description="Per-fold scores for the primary metric across valid cross-validation folds",
    )
    cv_mean: Optional[float] = Field(
        default=None,
        description="Mean primary metric score across valid folds",
    )
    cv_std: Optional[float] = Field(
        default=None,
        description="Sample standard deviation (ddof=1) across valid folds; null if fewer than 2 valid folds",
    )
    valid_folds_count: Optional[int] = Field(
        default=None,
        description="Number of folds that successfully produced valid numeric metrics",
    )
    fold_metrics: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Detailed per-fold evaluation metric dictionaries",
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
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 hash of the stored dataset file")
    target_column: str = Field(..., description="Target column modeled")
    task_type: str = Field(..., description="Task type executed: binary_classification, multiclass_classification, or regression")
    evaluation_strategy: str = Field(..., description="Evaluation strategy executed: holdout or cross_validation")
    cv_folds: Optional[int] = Field(default=None, description="Number of folds used if cross-validation was executed")
    primary_metric: str = Field(..., description="Metric utilized for ranking models")
    primary_metric_greater_is_better: bool = Field(
        ...,
        description="True if higher metric values indicate superior performance; False if lower is better (e.g., RMSE, MAE)",
    )
    random_state: int = Field(..., description="Random seed used for the experiment")
    test_size: float = Field(..., description="Holdout evaluation split fraction")
    train_rows: int = Field(..., ge=1, description="Number of samples used for candidate training and validation folds")
    test_rows: int = Field(..., ge=0, description="Number of samples reserved for final holdout evaluation (0 if holdout_test disabled)")
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
    test_metrics: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Final independent performance metrics of the best model evaluated on the untouched holdout test set",
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
    mlflow_run_id: Optional[str] = Field(
        default=None,
        description="MLflow parent run ID for this experiment if MLflow tracking succeeded",
    )
    mlflow_experiment_id: Optional[str] = Field(
        default=None,
        description="MLflow experiment ID if MLflow tracking succeeded",
    )
    tracking_status: str = Field(
        default="disabled",
        description="Status of experiment tracking: completed, disabled, or failed",
    )
    tracking_warning: Optional[str] = Field(
        default=None,
        description="Sanitized warning message if experiment tracking failed or experienced degraded functionality",
    )
    evaluation_protocol: str = Field(
        ...,
        description="Documentation of the evaluation strategy, fold stratification, and test set separation protocol",
    )
    disclaimer: str = Field(
        default=(
            "Evaluation metrics reflect empirical performance on the specified validation protocol. "
            "Results are empirical estimates and may vary with different dataset splits, distributions, or sample sizes."
        ),
        description="Scientific reporting disclaimer regarding evaluation estimates",
    )
