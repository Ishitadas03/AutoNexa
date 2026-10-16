"""Dataset ingestion and profiling endpoints."""

from fastapi import APIRouter, Depends, File, UploadFile, status

from app.schemas.dataset import DatasetProfileResponse
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
