"""Experiment metadata inspection, model artifact integrity, tabular inference, explainability, and error analysis endpoints."""

from typing import Literal, Optional
from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status

from app.schemas.error_analysis import (
    ErrorAnalysisRequest,
    ErrorAnalysisResponse,
)
from app.schemas.explainability import (
    GlobalFeatureImportanceResponse,
    PredictionExplanationRequest,
    PredictionExplanationResponse,
)
from app.schemas.prediction import (
    ExperimentInspectionResponse,
    PredictionRequest,
    PredictionResponse,
)
from app.services.automl.error_analysis_service import (
    ErrorAnalysisService,
    get_error_analysis_service,
)
from app.services.automl.explainability_service import (
    ExplainabilityService,
    get_explainability_service,
)
from app.services.automl.prediction_service import (
    PredictionService,
    get_prediction_service,
)

router = APIRouter(prefix="/experiments", tags=["Experiments"])


@router.get(
    "/{experiment_id}",
    response_model=ExperimentInspectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspect Experiment and Model Metadata",
    description=(
        "Retrieves a validated, sanitized summary of a completed AutoML experiment. "
        "Exposes task configuration, target column, feature schema, model rankings, "
        "artifact presence, SHA-256 integrity checksums, and tracking status. "
        "Does not expose absolute filesystem paths, secrets, or internal stack traces."
    ),
)
def inspect_experiment(
    experiment_id: str,
    service: PredictionService = Depends(get_prediction_service),
) -> ExperimentInspectionResponse:
    """Inspect an AutoML experiment's metadata and winning model state."""
    return service.inspect_experiment(experiment_id=experiment_id)


@router.post(
    "/{experiment_id}/predict",
    response_model=PredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Tabular Predictions from Winning Pipeline",
    description=(
        "Executes inference on a bounded batch of tabular records using the experiment's saved winning pipeline. "
        "Strictly validates required feature columns, rejects unexpected features, preserves training feature order, "
        "applies fitted preprocessing transformations (imputation, scaling, encoding), and returns JSON predictions. "
        "For classification tasks, returns class probabilities when supported by the fitted estimator."
    ),
)
def predict(
    experiment_id: str,
    request: PredictionRequest,
    service: PredictionService = Depends(get_prediction_service),
) -> PredictionResponse:
    """Generate model predictions for a bounded list of tabular records."""
    return service.predict_records(experiment_id=experiment_id, request=request)


@router.post(
    "/{experiment_id}/predict-csv",
    status_code=status.HTTP_200_OK,
    summary="Batch Tabular Prediction from CSV Dataset",
    description=(
        "Uploads a CSV dataset, validates expected feature columns, executes batch inference using the saved winning pipeline, "
        "and returns a downloadable CSV containing the original data with predicted target columns and probabilities."
    ),
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "Downloadable CSV file containing original records appended with prediction columns.",
        }
    },
)
async def predict_csv(
    experiment_id: str,
    file: UploadFile = File(..., description="CSV dataset for batch prediction"),
    service: PredictionService = Depends(get_prediction_service),
) -> Response:
    """Execute batch inference on an uploaded CSV file and return a downloadable CSV response."""
    return await service.predict_csv(experiment_id=experiment_id, file=file)


@router.get(
    "/{experiment_id}/explainability/importance",
    response_model=GlobalFeatureImportanceResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute Global Feature Importance",
    description=(
        "Calculates global feature importances for the experiment's winning pipeline. "
        "Supports native tree feature importance for compatible tree-based estimators and model-agnostic "
        "permutation importance over a reproducible evaluation sample. Maps transformed and one-hot encoded "
        "columns back to human-readable labels and original input feature names without data leakage."
    ),
)
def get_feature_importance(
    experiment_id: str,
    method: Literal["auto", "native", "permutation"] = Query(
        default="auto",
        description="Calculation method: 'auto' (native tree if available, else permutation), 'native', or 'permutation'",
    ),
    sample_size: Optional[int] = Query(
        default=None,
        ge=5,
        le=500,
        description="Maximum sample size used for permutation evaluation (5 to 500)",
    ),
    random_state: Optional[int] = Query(
        default=None,
        description="Optional seed override for evaluation sampling and permutation shuffling",
    ),
    service: ExplainabilityService = Depends(get_explainability_service),
) -> GlobalFeatureImportanceResponse:
    """Compute global feature importances for the experiment's trained model."""
    return service.compute_global_importance(
        experiment_id=experiment_id,
        method=method,
        sample_size=sample_size,
        random_state=random_state,
    )


@router.post(
    "/{experiment_id}/explainability/prediction",
    response_model=PredictionExplanationResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute Local Prediction Explanations",
    description=(
        "Generates local feature attributions for individual tabular records using SHAP (TreeExplainer, "
        "LinearExplainer, or generic explainer) or a robust model-agnostic marginal perturbation fallback. "
        "Aggregates preprocessed categorical contributions back to original feature spaces and provides base expected values."
    ),
)
def explain_prediction(
    experiment_id: str,
    request: PredictionExplanationRequest,
    service: ExplainabilityService = Depends(get_explainability_service),
) -> PredictionExplanationResponse:
    """Generate instance-level prediction explanations for tabular records."""
    return service.compute_local_explanations(experiment_id=experiment_id, request=request)


@router.post(
    "/{experiment_id}/error-analysis",
    response_model=ErrorAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Perform Prediction Error Analysis",
    description=(
        "Executes comprehensive error diagnostics on model predictions. For classification: confusion matrix, "
        "per-class precision/recall/F1, false positives/negatives, probability calibration buckets, and prioritized "
        "misclassified instances. For regression: signed and absolute residual statistics, feature-error correlations, "
        "categorical error slices, and high-error outlier samples. Evaluates strictly on the independent test partition "
        "by default to prevent training optimism and data leakage."
    ),
)
def analyze_prediction_errors(
    experiment_id: str,
    request: ErrorAnalysisRequest = ErrorAnalysisRequest(),
    service: ErrorAnalysisService = Depends(get_error_analysis_service),
) -> ErrorAnalysisResponse:
    """Compute comprehensive prediction error analysis for the experiment's winning pipeline."""
    return service.analyze_errors(experiment_id=experiment_id, request=request)
