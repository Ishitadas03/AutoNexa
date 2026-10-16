"""Experiment metadata inspection, model artifact integrity, and tabular inference endpoints."""

from fastapi import APIRouter, Depends, File, Response, UploadFile, status

from app.schemas.prediction import (
    ExperimentInspectionResponse,
    PredictionRequest,
    PredictionResponse,
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
