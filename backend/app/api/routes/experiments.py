"""Experiment metadata inspection, model artifact integrity, tabular inference, explainability, and error analysis endpoints."""

from typing import Any, Dict, Literal, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse

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
from app.schemas.tracking import (
    ArtifactVerificationResponse,
    ExperimentCompareRequest,
    ExperimentComparisonResponse,
    ExperimentDetailResponse,
    ExperimentListResponse,
    ReproducibilityManifest,
)
from app.services.automl.error_analysis_service import (
    ErrorAnalysisService,
    get_error_analysis_service,
)
from app.services.automl.experiment_tracker_service import (
    ExperimentTrackerService,
    get_experiment_tracker_service,
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
    "",
    response_model=ExperimentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Experiments with Pagination and Filters",
    description=(
        "Retrieves a paginated list of persisted AutoML experiments with filtering by task type, "
        "execution status, dataset identifier, or search keywords. Excludes internal benchmarking suites."
    ),
)
def list_experiments(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=10, ge=1, le=100, description="Items per page"),
    task_type: Optional[str] = Query(default=None, description="Filter by task type"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status"),
    dataset_id: Optional[str] = Query(default=None, description="Filter by dataset ID"),
    search: Optional[str] = Query(default=None, description="Search keyword across ID, name, and columns"),
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> ExperimentListResponse:
    """List persisted AutoML experiments with pagination and filtering."""
    return tracker.list_experiments(
        page=page,
        page_size=page_size,
        task_type=task_type,
        status=status_filter,
        dataset_id=dataset_id,
        search=search,
    )


@router.post(
    "/compare",
    response_model=ExperimentComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare Selected Experiments",
    description=(
        "Evaluates side-by-side metric differences, task compatibility, configuration variations, "
        "and execution runtimes across 2 to 10 selected AutoML experiments."
    ),
)
def compare_experiments(
    request: ExperimentCompareRequest,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> ExperimentComparisonResponse:
    """Compare multiple AutoML experiments side-by-side."""
    return tracker.compare_experiments(request.experiment_ids)


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


@router.get(
    "/{experiment_id}/details",
    response_model=ExperimentDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Full Experiment Details and Diagnostics",
    description=(
        "Retrieves detailed experiment metadata, candidate model evaluations, CV metrics, "
        "software environment versions, and diagnostic error reports if the experiment failed."
    ),
)
def get_experiment_details(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> ExperimentDetailResponse:
    """Retrieve full experiment details and candidate evaluations."""
    return tracker.get_experiment_detail(experiment_id=experiment_id)


@router.get(
    "/{experiment_id}/metrics",
    status_code=status.HTTP_200_OK,
    summary="Retrieve Experiment Metrics Summary",
    description="Extracts validation, cross-validation, and holdout test metrics for an experiment.",
)
def get_experiment_metrics(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> Dict[str, Any]:
    """Retrieve metrics dictionary for an experiment."""
    return tracker.get_experiment_metrics(experiment_id=experiment_id)


@router.get(
    "/{experiment_id}/reproducibility-manifest",
    response_model=ReproducibilityManifest,
    status_code=status.HTTP_200_OK,
    summary="Export Cryptographic Reproducibility Manifest",
    description=(
        "Generates a complete, machine-readable reproducibility manifest capturing dataset fingerprint, "
        "random seeds, feature preprocessing pipeline, model configurations, library dependencies, "
        "and SHA-256 artifact checksum."
    ),
)
def get_reproducibility_manifest(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> ReproducibilityManifest:
    """Generate and export the experiment's reproducibility manifest."""
    return tracker.get_reproducibility_manifest(experiment_id=experiment_id)


@router.get(
    "/{experiment_id}/reproducibility-manifest/verify",
    response_model=ArtifactVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify Physical Artifact Integrity",
    description="Performs real-time cryptographic verification of the experiment's stored model binary against recorded checksums.",
)
def verify_experiment_artifact(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> ArtifactVerificationResponse:
    """Verify physical artifact presence and SHA-256 integrity."""
    return tracker.verify_manifest_integrity(experiment_id=experiment_id)


@router.get(
    "/{experiment_id}/artifact",
    status_code=status.HTTP_200_OK,
    summary="Download Model Artifact Binary",
    description="Streams the serialized .joblib model pipeline after verifying existence and integrity.",
    responses={
        200: {
            "content": {"application/octet-stream": {}},
            "description": "Serialized scikit-learn model pipeline binary (.joblib).",
        }
    },
)
def download_experiment_artifact(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
):
    """Download verified model artifact binary."""
    verification = tracker.verify_manifest_integrity(experiment_id)
    if not verification.artifact_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model artifact for experiment '{experiment_id}' does not exist on disk.",
        )
    if not verification.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot download model artifact: {verification.message}",
        )
    exp_dir = tracker.safe_resolve_experiment_dir(experiment_id)
    model_path = exp_dir / "best_model.joblib"
    return FileResponse(
        path=str(model_path),
        filename=f"autonexa_model_{experiment_id[:8]}.joblib",
        media_type="application/octet-stream",
        headers={"X-Artifact-SHA256": verification.actual_sha256 or ""},
    )


@router.delete(
    "/{experiment_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete Experiment and Artifacts",
    description="Permanently deletes an experiment directory and associated model artifacts from disk storage.",
)
def delete_experiment(
    experiment_id: str,
    tracker: ExperimentTrackerService = Depends(get_experiment_tracker_service),
) -> Dict[str, Any]:
    """Delete an experiment and its artifacts."""
    success = tracker.delete_experiment(experiment_id)
    return {"success": success, "message": f"Experiment '{experiment_id}' deleted successfully."}


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
