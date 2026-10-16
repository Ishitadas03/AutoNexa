"""Dataset ingestion, profiling, and intelligence analysis endpoints."""

from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, status

from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.schemas.dataset import DatasetProfileResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.dataset_service import DatasetService, get_dataset_service

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post(
    "/upload",
    response_model=DatasetProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and Profile Tabular CSV Dataset",
    description=(
        "Streams a multipart CSV dataset, enforces file size constraints, validates tabular integrity, "
        "persists the file under a safe server identifier, and computes a non-sensitive summary profile."
    ),
)
async def upload_dataset(
    file: UploadFile = File(..., description="Multipart CSV dataset file to ingest and profile"),
    service: DatasetService = Depends(get_dataset_service),
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
) -> AnalysisResponse:
    """Analyze an uploaded dataset and infer machine learning task configuration."""
    return service.analyze(dataset_id=dataset_id, request=request)
