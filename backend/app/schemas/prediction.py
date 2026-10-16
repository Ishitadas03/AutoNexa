"""Pydantic schemas for experiment inspection, safe artifact metadata, and prediction requests/responses."""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ArtifactAvailability(BaseModel):
    """Presence, integrity, and metadata of experiment artifacts on server storage."""

    metadata_exists: bool = Field(..., description="Whether metadata.json is present on disk")
    model_file_exists: bool = Field(..., description="Whether best_model.joblib is present on disk")
    model_format: str = Field(default="joblib", description="Serialization format of the trained model pipeline")
    model_size_bytes: Optional[int] = Field(default=None, description="Size of model artifact in bytes")
    model_sha256: Optional[str] = Field(default=None, description="Cryptographic SHA-256 checksum of model artifact")


class ExperimentInspectionResponse(BaseModel):
    """Sanitized, validated summary of a trained AutoML experiment and its winning model artifact."""

    experiment_id: str = Field(..., description="Unique server-generated experiment identifier")
    status: str = Field(..., description="Experiment status: completed, incomplete, or failed")
    dataset_id: str = Field(..., description="Identifier of the dataset used for training")
    dataset_fingerprint: str = Field(..., description="Cryptographic SHA-256 fingerprint of the dataset")
    target_column: str = Field(..., description="Target column modeled")
    task_type: str = Field(..., description="Task type: binary_classification, multiclass_classification, or regression")
    evaluation_strategy: str = Field(..., description="Evaluation strategy used: holdout or cross_validation")
    primary_metric: str = Field(..., description="Metric utilized for ranking models")
    primary_metric_greater_is_better: Optional[bool] = Field(
        default=None,
        description="True if higher metric values indicate superior performance",
    )
    best_model: Optional[str] = Field(
        default=None,
        description="Top-performing candidate model identifier",
    )
    best_score: Optional[float] = Field(
        default=None,
        description="Validation score of the top-performing model",
    )
    test_metrics: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Independent holdout test set performance metrics of the winning pipeline",
    )
    ranked_models: List[str] = Field(
        default_factory=list,
        description="Ordered list of evaluated candidate models from best to worst",
    )
    features_count: int = Field(..., ge=1, description="Number of feature columns expected by the model")
    feature_names: List[str] = Field(..., description="Ordered list of feature column names expected for inference")
    numeric_features: Optional[List[str]] = Field(default=None, description="Identified numeric feature names")
    categorical_features: Optional[List[str]] = Field(default=None, description="Identified categorical feature names")
    artifact_availability: ArtifactAvailability = Field(
        ...,
        description="Disk presence and cryptographic integrity of serialized artifacts",
    )
    tracking_status: str = Field(
        default="disabled",
        description="Status of MLflow experiment tracking: completed, disabled, or failed",
    )
    mlflow_run_id: Optional[str] = Field(
        default=None,
        description="MLflow parent run ID for this experiment if tracked",
    )
    mlflow_experiment_id: Optional[str] = Field(
        default=None,
        description="MLflow experiment ID if tracked",
    )
    tracking_warning: Optional[str] = Field(
        default=None,
        description="Sanitized warning message if experiment tracking experienced degraded functionality",
    )
    evaluation_protocol: Optional[str] = Field(
        default=None,
        description="Documentation of the evaluation strategy, fold stratification, and test set separation",
    )
    total_duration_seconds: Optional[float] = Field(
        default=None,
        description="Total wall-clock duration of the AutoML training experiment in seconds",
    )
    package_versions: Optional[Dict[str, str]] = Field(
        default=None,
        description="Runtime package versions recorded during model training",
    )
    security_notice: str = Field(
        default=(
            "Joblib/pickle-based artifacts can execute arbitrary code during deserialization. "
            "AutoNexa restricts model loading to trusted internal server artifacts only and never "
            "accepts arbitrary client-provided model files."
        ),
        description="Security advisory regarding serialized model artifacts",
    )


class PredictionRequest(BaseModel):
    """Input payload containing tabular records for inference."""

    records: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="List of tabular records as dictionaries mapping feature name to value.",
        examples=[
            [
                {"age": 35, "income": 52000, "city": "Kolkata"},
                {"age": 42, "income": 71000, "city": "Siliguri"},
            ]
        ],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "records": [
                    {"age": 35, "income": 52000, "city": "Kolkata"},
                    {"age": 42, "income": 71000, "city": "Siliguri"},
                ]
            }
        }
    }


class PredictionResponse(BaseModel):
    """Predictions generated by the trained winning pipeline."""

    experiment_id: str = Field(..., description="Unique experiment identifier used for inference")
    task_type: str = Field(..., description="Task type of the model: binary_classification, multiclass_classification, or regression")
    target_column: str = Field(..., description="Target column modeled")
    selected_model: str = Field(..., description="Identifier of the model used for predictions")
    prediction_count: int = Field(..., ge=1, description="Number of predicted records")
    predictions: List[Any] = Field(..., description="List of predicted target values or labels")
    probabilities: Optional[List[Dict[str, float]]] = Field(
        default=None,
        description="Class probability distributions for classification models when supported by the estimator",
    )
    class_labels: Optional[List[str]] = Field(
        default=None,
        description="Ordered list of unique target class labels corresponding to probability distributions",
    )
    warnings: Optional[List[str]] = Field(
        default=None,
        description="Non-fatal warnings encountered during prediction processing",
    )
