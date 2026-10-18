"""Pydantic schemas for model explainability (global feature importance & local predictions)."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class FeatureImportanceItem(BaseModel):
    """Importance metric for an original input feature."""

    feature: str = Field(..., description="Original input feature name before transformation")
    importance: float = Field(..., description="Raw importance score (Gini decrease or mean score drop)")
    importance_std: Optional[float] = Field(
        default=None,
        description="Standard deviation of importance across permutation shuffles",
    )
    normalized_importance: Optional[float] = Field(
        default=None,
        description="Relative importance score normalized between 0 and 1 (only when mathematically valid)",
    )
    rank: int = Field(..., ge=1, description="Ranking relative to other features (1 is most influential)")


class TransformedFeatureImportanceItem(BaseModel):
    """Detailed importance for an individual transformed feature (e.g. after one-hot encoding)."""

    transformed_feature: str = Field(..., description="Column name emitted by fitted ColumnTransformer")
    source_feature: str = Field(..., description="Original dataset feature this column originated from")
    label: str = Field(..., description="Human-readable label (e.g. 'contract = one-year' or 'age')")
    importance: float = Field(..., description="Calculated importance score for this specific column")
    normalized_importance: Optional[float] = Field(
        default=None,
        description="Normalized importance score within the transformed feature space",
    )


class GlobalFeatureImportanceResponse(BaseModel):
    """Response containing global feature importances and methodology documentation."""

    experiment_id: str = Field(..., description="AutoML experiment identifier")
    model_id: str = Field(..., description="Selected model candidate identifier")
    model_name: str = Field(..., description="Human-readable name of the evaluated model")
    task_type: str = Field(..., description="Task type: binary_classification, multiclass_classification, or regression")
    target_column: str = Field(..., description="Target column modeled")
    importance_method: str = Field(
        ...,
        description="Importance calculation technique: 'native_tree_importance' or 'permutation_importance'",
    )
    sample_size: int = Field(..., ge=1, description="Number of dataset samples used in computing importance")
    features_count: int = Field(..., ge=1, description="Number of original input features evaluated")
    feature_importances: List[FeatureImportanceItem] = Field(
        ...,
        description="Original feature importances sorted descending by magnitude",
    )
    transformed_feature_importances: Optional[List[TransformedFeatureImportanceItem]] = Field(
        default=None,
        description="Per-transformed-feature breakdown (e.g., individual one-hot categories)",
    )
    evaluation_partition: str = Field(
        default="sample",
        description="Dataset partition used for evaluation (e.g., 'holdout_sample' or 'training_sample')",
    )
    random_state: Optional[int] = Field(
        default=None,
        description="Random seed utilized to ensure reproducible evaluation sampling and permutations",
    )
    method_details: str = Field(
        ...,
        description="Detailed description of the algorithm and parameters used to derive feature importances",
    )
    scientific_limitations: str = Field(
        default=(
            "Feature importance quantifies statistical association and predictive contribution within "
            "this model, not physical causation or causal mechanisms. Native tree importance may reflect "
            "impurity reduction on training data and can be biased toward high-cardinality features. "
            "Permutation importance evaluates performance degradation under feature shuffling and can be sensitive to correlated predictors."
        ),
        description="Scientific caveats and interpretation guidelines",
    )


class PredictionExplanationRequest(BaseModel):
    """Request payload for local instance prediction explanation."""

    records: List[Dict[str, Any]] = Field(
        ...,
        min_length=1,
        description="Tabular instances to generate local prediction explanations for",
        examples=[
            [
                {"age": 42, "tenure_months": 24, "monthly_charges": 75.5, "contract": "one-year"},
            ]
        ],
    )
    method: Literal["auto", "shap", "fallback"] = Field(
        default="auto",
        description="Explanation method preference: 'auto' (SHAP with fallback), 'shap' (strict SHAP), or 'fallback'",
    )


class FeatureContribution(BaseModel):
    """Local attribution of an individual feature towards an instance's prediction."""

    feature: str = Field(..., description="Original input feature name")
    value: Any = Field(..., description="Observed input value for this feature in the instance")
    contribution: float = Field(
        ...,
        description="Attribution magnitude (positive values push prediction higher/toward positive class, negative lower)",
    )
    relative_share: Optional[float] = Field(
        default=None,
        description="Relative proportion of total absolute feature attribution (0.0 to 1.0)",
    )
    details: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Underlying transformed feature attributions if feature was expanded (e.g. one-hot encoding)",
    )


class InstanceExplanation(BaseModel):
    """Explanation breakdown for a single input record."""

    record_index: int = Field(..., ge=0, description="0-indexed position in the request records array")
    input_features: Dict[str, Any] = Field(..., description="Input feature values provided")
    prediction: Any = Field(..., description="Model prediction output (class label or continuous value)")
    prediction_probabilities: Optional[Dict[str, float]] = Field(
        default=None,
        description="Class probabilities for classification tasks when supported",
    )
    base_value: float = Field(
        ...,
        description="Baseline expected model output across background reference data",
    )
    predicted_value: Optional[float] = Field(
        default=None,
        description="Model output score before or after transformation (e.g. log-odds or predicted value)",
    )
    feature_contributions: List[FeatureContribution] = Field(
        ...,
        description="Ranked list of feature attributions, sorted by absolute contribution magnitude descending",
    )
    class_attributions: Optional[Dict[str, List[FeatureContribution]]] = Field(
        default=None,
        description="Per-class feature attributions for multiclass classification tasks",
    )


class PredictionExplanationResponse(BaseModel):
    """Response containing instance-level prediction explanations."""

    experiment_id: str = Field(..., description="AutoML experiment identifier")
    model_id: str = Field(..., description="Selected model candidate identifier")
    task_type: str = Field(..., description="Task type modeled")
    target_column: str = Field(..., description="Target column modeled")
    explanation_method: str = Field(
        ...,
        description="Method used: 'shap_tree', 'shap_linear', 'shap_kernel', or 'local_perturbation_fallback'",
    )
    explanation_count: int = Field(..., ge=1, description="Number of explained instances")
    explanations: List[InstanceExplanation] = Field(..., description="Explanations for each submitted instance")
    baseline_summary: str = Field(
        ...,
        description="Description of the background reference dataset used to anchor expected baseline values",
    )
    scientific_limitations: str = Field(
        default=(
            "Local attributions represent additive feature contributions relative to the reference background "
            "distribution under the specific model architecture. They reflect model behavior, not causal mechanisms."
        ),
        description="Scientific caveats regarding local prediction attributions",
    )
