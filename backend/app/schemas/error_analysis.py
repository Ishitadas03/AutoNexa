"""Pydantic schemas for classification and regression prediction error analysis."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ErrorAnalysisRequest(BaseModel):
    """Configuration payload for prediction error analysis."""

    split: Literal["test", "train", "full"] = Field(
        default="test",
        description="Dataset partition to evaluate: 'test' (independent holdout test partition), 'train', or 'full'",
    )
    max_error_examples: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Maximum number of top misclassified or high-residual instances to return (1 to 100)",
    )
    custom_records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional batch of custom tabular records including the true target column for ad-hoc error analysis",
    )


class ClassErrorSummary(BaseModel):
    """Detailed error and performance breakdown for a single class label."""

    class_label: str = Field(..., description="Target class identifier")
    precision: Optional[float] = Field(default=None, description="Class precision score")
    recall: Optional[float] = Field(default=None, description="Class recall / sensitivity score")
    f1_score: Optional[float] = Field(default=None, description="Class harmonic F1 score")
    support: int = Field(..., ge=0, description="Number of true instances of this class in evaluation set")
    true_positives: int = Field(..., ge=0, description="Correctly identified instances of this class")
    false_positives: int = Field(..., ge=0, description="Instances incorrectly predicted as this class")
    false_negatives: int = Field(..., ge=0, description="Instances of this class incorrectly predicted as another class")
    true_negatives: int = Field(..., ge=0, description="Instances of other classes correctly not predicted as this class")


class ConfidenceBucket(BaseModel):
    """Calibration bin comparing mean model confidence against observed accuracy."""

    bin_range: str = Field(..., description="Confidence interval range (e.g., '0.80 - 0.90')")
    mean_confidence: float = Field(..., description="Average predicted probability within this confidence interval")
    observed_accuracy: float = Field(..., description="Proportion of correct predictions in this bin")
    sample_count: int = Field(..., ge=0, description="Number of instances placed into this bucket")


class MisclassifiedInstance(BaseModel):
    """Summary of a single misclassified sample."""

    record_index: int = Field(..., ge=0, description="0-indexed sample identifier within evaluated partition")
    true_label: str = Field(..., description="Ground-truth target label")
    predicted_label: str = Field(..., description="Label predicted by the winning model pipeline")
    confidence: Optional[float] = Field(
        default=None,
        description="Model confidence assigned to the predicted label (when predict_proba is supported)",
    )
    probabilities: Optional[Dict[str, float]] = Field(
        default=None,
        description="Predicted class probability distribution across all classes",
    )
    input_features: Dict[str, Any] = Field(..., description="Observed feature values for this instance")


class ClassificationErrorAnalysis(BaseModel):
    """Comprehensive error diagnostic results for classification tasks."""

    accuracy: float = Field(..., description="Overall accuracy on the evaluated split")
    balanced_accuracy: Optional[float] = Field(default=None, description="Balanced accuracy accounting for class imbalance")
    f1_weighted: Optional[float] = Field(default=None, description="Weighted average F1 score across classes")
    f1_macro: Optional[float] = Field(default=None, description="Unweighted macro average F1 score across classes")
    brier_score_loss: Optional[float] = Field(
        default=None,
        description="Brier score quadratic error loss (available when probability estimates are supported)",
    )
    confusion_matrix: List[List[int]] = Field(..., description="Confusion matrix where rows are actual and cols are predicted")
    class_labels: List[str] = Field(..., description="Class labels ordered to match confusion matrix rows/columns")
    class_metrics: List[ClassErrorSummary] = Field(..., description="Per-class precision, recall, F1, and error counts")
    total_samples: int = Field(..., ge=1, description="Total number of evaluated records")
    misclassified_count: int = Field(..., ge=0, description="Total count of erroneous predictions")
    error_rate: float = Field(..., description="Fraction of misclassified predictions (1.0 - accuracy)")
    class_imbalance_ratio: Optional[float] = Field(
        default=None,
        description="Ratio of majority class count to minority class count (1.0 represents perfect balance)",
    )
    confidence_buckets: Optional[List[ConfidenceBucket]] = Field(
        default=None,
        description="Binned confidence calibration distribution (when probabilities are supported)",
    )
    top_misclassified_examples: List[MisclassifiedInstance] = Field(
        ...,
        description="High-error instances prioritized by model confidence (most confident mistakes first)",
    )


class RegressionResidualSummary(BaseModel):
    """Statistical summary of continuous prediction residuals (e = actual - predicted)."""

    mean_residual: float = Field(..., description="Mean of signed residuals (indicates model bias)")
    std_residual: float = Field(..., description="Standard deviation of residuals")
    min_residual: float = Field(..., description="Minimum signed residual")
    p25_residual: float = Field(..., description="25th percentile of residuals")
    median_residual: float = Field(..., description="50th percentile (median) of residuals")
    p75_residual: float = Field(..., description="75th percentile of residuals")
    max_residual: float = Field(..., description="Maximum signed residual")
    mae: float = Field(..., description="Mean Absolute Error")
    rmse: float = Field(..., description="Root Mean Squared Error")
    median_absolute_error: float = Field(..., description="Median Absolute Error (robust to outliers)")
    r2_score: Optional[float] = Field(default=None, description="Coefficient of determination (R²)")
    max_absolute_error: float = Field(..., description="Largest single absolute error observed")


class FeatureErrorCorrelation(BaseModel):
    """Correlation between continuous feature values and magnitude of prediction error."""

    feature_name: str = Field(..., description="Feature column name")
    correlation_with_absolute_error: float = Field(
        ...,
        description="Correlation with absolute residual |actual - predicted| (-1.0 to +1.0)",
    )
    interpretation: str = Field(
        ...,
        description="Verbal summary (e.g. 'Higher feature values associate with larger prediction errors')",
    )


class CategoryErrorSlice(BaseModel):
    """Mean absolute error stratified by discrete category level."""

    feature_name: str = Field(..., description="Categorical feature column name")
    category_value: str = Field(..., description="Specific categorical group level")
    mae: float = Field(..., description="Mean Absolute Error observed for instances within this group")
    sample_count: int = Field(..., ge=1, description="Number of instances belonging to this category")


class RegressionOutlierInstance(BaseModel):
    """Instance exhibiting severe prediction error."""

    record_index: int = Field(..., ge=0, description="0-indexed position within evaluated partition")
    true_value: float = Field(..., description="Actual continuous target value")
    predicted_value: float = Field(..., description="Predicted continuous value")
    residual: float = Field(..., description="Signed residual (actual - predicted)")
    absolute_error: float = Field(..., description="Absolute magnitude of residual |actual - predicted|")
    input_features: Dict[str, Any] = Field(..., description="Feature values for this record")


class RegressionErrorAnalysis(BaseModel):
    """Comprehensive diagnostic results for regression tasks."""

    total_samples: int = Field(..., ge=1, description="Total number of evaluated samples")
    residual_summary: RegressionResidualSummary = Field(..., description="Distributional properties of residuals")
    feature_error_correlations: List[FeatureErrorCorrelation] = Field(
        default_factory=list,
        description="Linear correlations between numeric predictors and absolute error magnitude",
    )
    categorical_slices: Optional[List[CategoryErrorSlice]] = Field(
        default=None,
        description="Stratified error performance across categorical subgroups",
    )
    top_error_examples: List[RegressionOutlierInstance] = Field(
        ...,
        description="Top instances exhibiting largest absolute prediction errors",
    )


class ErrorAnalysisResponse(BaseModel):
    """Top-level diagnostic response for prediction error analysis."""

    experiment_id: str = Field(..., description="AutoML experiment identifier")
    model_id: str = Field(..., description="Evaluated winning model identifier")
    task_type: str = Field(..., description="Task type: binary_classification, multiclass_classification, or regression")
    target_column: str = Field(..., description="Target column modeled")
    evaluation_split: str = Field(
        ...,
        description="Partition evaluated: 'test' (independent holdout test partition), 'train', or 'custom'",
    )
    sample_size: int = Field(..., ge=1, description="Number of samples evaluated")
    is_independent_test_evaluation: bool = Field(
        ...,
        description="True if evaluated strictly on the untouched holdout test partition",
    )
    classification_analysis: Optional[ClassificationErrorAnalysis] = Field(
        default=None,
        description="Diagnostic error analysis for classification tasks",
    )
    regression_analysis: Optional[RegressionErrorAnalysis] = Field(
        default=None,
        description="Diagnostic error analysis for regression tasks",
    )
    evaluation_notice: str = Field(
        ...,
        description="Scientific audit notice confirming whether evaluation is independent or subject to training bias",
    )
