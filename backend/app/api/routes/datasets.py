"""Dataset ingestion, profiling, intelligence analysis, and AutoML training endpoints."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, File, Query, UploadFile, status

from app.core.security import require_admin_role, require_inference_role
from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.schemas.dataset import (
    DatasetListResponse,
    DatasetProfileResponse,
    DatasetSummary,
)
from app.schemas.training import TrainingRequest, TrainingResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.get(
    "",
    response_model=DatasetListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Persistent Datasets from Catalog",
    description=(
        "Retrieves a paginated list of cataloged tabular datasets stored on the server. "
        "Supports filtering by validation status, search across filename/fingerprint/ID, "
        "and deterministic sorting. Requires inference/read credentials."
    ),
)
def list_datasets(
    page: int = Query(default=1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(default=10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(default=None, description="Search filter for ID, filename, or SHA-256 fingerprint"),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status (validated, corrupted)"),
    sort_by: str = Query(default="created_at", description="Field to sort by (created_at, filename, rows, file_size_bytes)"),
    sort_order: str = Query(default="desc", description="Sort order direction ('asc' or 'desc')"),
    service: DatasetService = Depends(get_dataset_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> DatasetListResponse:
    """List persisted datasets with pagination and filtering."""
    return service.list_datasets(
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status_filter,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{dataset_id}",
    response_model=DatasetSummary,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Dataset Metadata by Identifier",
    description=(
        "Retrieves detailed metadata for a specific dataset from the persistent catalog, "
        "including structural summary, column types, fingerprint, and experiment association counts. "
        "Requires inference/read credentials."
    ),
)
def get_dataset(
    dataset_id: str,
    service: DatasetService = Depends(get_dataset_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> DatasetSummary:
    """Retrieve metadata for a specific dataset."""
    return service.get_dataset(dataset_id=dataset_id)



@router.post(
    "/upload",
    response_model=DatasetProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and Profile Tabular CSV Dataset",
    description=(
        "Streams a multipart CSV dataset, enforces file size constraints, validates tabular integrity, "
        "persists the file under a safe server identifier, and computes a non-sensitive summary profile. "
        "Requires administrator credentials."
    ),
)
async def upload_dataset(
    file: UploadFile = File(..., description="Multipart CSV dataset file to ingest and profile"),
    service: DatasetService = Depends(get_dataset_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> DatasetProfileResponse:
    """Ingest a CSV dataset, validate its schema and data rows, and return its summary profile."""
    return await service.ingest_dataset(file)


@router.post(
    "/{dataset_id}/analyze",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze Dataset Intelligence & Task Detection",
    description=(
        "Performs in-depth dataset diagnostics on an already-uploaded dataset: "
        "detects column types and roles, reports missingness and duplicate stats, "
        "evaluates data quality risks (constant features, high cardinality, class imbalance, leakage), "
        "identifies candidate target columns, and provides heuristic ML task recommendations."
    ),
)
def analyze_dataset(
    dataset_id: str,
    request: Optional[AnalysisRequest] = None,
    service: AnalysisService = Depends(get_analysis_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> AnalysisResponse:
    """Analyze an uploaded dataset and infer machine learning task configuration."""
    return service.analyze(dataset_id=dataset_id, request=request)


@router.post(
    "/{dataset_id}/train",
    response_model=TrainingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute Resource-Aware AutoML Model Selection and Training",
    description=(
        "Executes a leakage-safe AutoML training pipeline on an uploaded dataset. "
        "Splits data into train and holdout validation sets, fits scikit-learn candidate estimators "
        "(including baselines, linear/tree models, and ensemble boosting), enforces training time "
        "budgets and dataset bounds, computes holdout metrics, ranks models, and persists experiment artifacts. "
        "Requires administrator credentials."
    ),
)
def train_dataset(
    dataset_id: str,
    request: TrainingRequest,
    service: TrainingService = Depends(get_training_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> TrainingResponse:
    """Train candidate machine learning models under resource constraints and return experiment leaderboard."""
    return service.train_experiment(dataset_id=dataset_id, request=request)

