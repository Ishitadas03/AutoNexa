"""Pydantic schemas for dataset upload, validation, and profiling."""

from typing import Dict, List
from pydantic import BaseModel, Field


class DatasetProfileResponse(BaseModel):
    """Structured response schema representing an ingested and profiled tabular dataset."""

    dataset_id: str = Field(
        ...,
        description="Unique server-generated identifier for the stored dataset",
        examples=["7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a"],
    )
    filename: str = Field(
        ...,
        description="Sanitized client filename for display purposes only",
        examples=["california_housing.csv"],
    )
    rows: int = Field(
        ...,
        ge=1,
        description="Total count of valid data rows (excluding header)",
        examples=[1000],
    )
    columns: int = Field(
        ...,
        ge=1,
        description="Total count of columns present in the dataset",
        examples=[6],
    )
    column_names: List[str] = Field(
        ...,
        description="List of verified and parsed column names in ordinal order",
        examples=[["id", "square_feet", "bedrooms", "bathrooms", "price", "neighborhood"]],
    )
    data_types: Dict[str, str] = Field(
        ...,
        description="Inferred data type for each column (e.g., int64, float64, object, category)",
        examples=[{
            "id": "int64",
            "square_feet": "float64",
            "bedrooms": "int64",
            "bathrooms": "float64",
            "price": "float64",
            "neighborhood": "object",
        }],
    )
    missing_values: Dict[str, int] = Field(
        ...,
        description="Count of missing, null, or NaN entries per column",
        examples=[{
            "id": 0,
            "square_feet": 15,
            "bedrooms": 0,
            "bathrooms": 2,
            "price": 0,
            "neighborhood": 4,
        }],
    )
    duplicate_rows: int = Field(
        ...,
        ge=0,
        description="Total count of identical duplicate data rows",
        examples=[0],
    )
    memory_usage_bytes: int = Field(
        ...,
        ge=0,
        description="Estimated memory consumption in bytes for the loaded DataFrame",
        examples=[48216],
    )
    file_size_bytes: int = Field(
        ...,
        ge=1,
        description="Size in bytes of the safely stored CSV file on disk",
        examples=[24580],
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "dataset_id": "7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a",
                "filename": "california_housing.csv",
                "rows": 1000,
                "columns": 6,
                "column_names": ["id", "square_feet", "bedrooms", "bathrooms", "price", "neighborhood"],
                "data_types": {
                    "id": "int64",
                    "square_feet": "float64",
                    "bedrooms": "int64",
                    "bathrooms": "float64",
                    "price": "float64",
                    "neighborhood": "object",
                },
                "missing_values": {
                    "id": 0,
                    "square_feet": 15,
                    "bedrooms": 0,
                    "bathrooms": 2,
                    "price": 0,
                    "neighborhood": 4,
                },
                "duplicate_rows": 0,
                "memory_usage_bytes": 48216,
                "file_size_bytes": 24580,
            }
        }
    }


class DatasetSummary(DatasetProfileResponse):
    """Rich persistent dataset catalog entry with provenance fingerprint and operational status."""

    fingerprint_sha256: str = Field(
        ...,
        description="Cryptographic SHA-256 digest of the raw uploaded CSV file",
        examples=["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    )
    validation_status: str = Field(
        default="validated",
        description="Dataset health and integrity status (e.g. validated, corrupted, archived)",
        examples=["validated"],
    )
    created_at: str = Field(
        ...,
        description="ISO 8601 UTC timestamp of original dataset ingestion",
        examples=["2026-10-23T12:00:00Z"],
    )
    updated_at: str = Field(
        ...,
        description="ISO 8601 UTC timestamp of last metadata modification",
        examples=["2026-10-23T12:00:00Z"],
    )
    associated_experiments_count: int = Field(
        default=0,
        ge=0,
        description="Count of AutoML experiments evaluated against this dataset",
        examples=[3],
    )
    associated_pipelines_count: int = Field(
        default=0,
        ge=0,
        description="Count of end-to-end pipelines executed against this dataset",
        examples=[1],
    )


class DatasetListResponse(BaseModel):
    """Paginated collection response for dataset catalog queries."""

    total: int = Field(..., ge=0, description="Total count of datasets matching query filters")
    page: int = Field(..., ge=1, description="Current page number (1-indexed)")
    page_size: int = Field(..., ge=1, description="Requested number of items per page")
    total_pages: int = Field(..., ge=0, description="Total pages available under current page size")
    datasets: List[DatasetSummary] = Field(..., description="List of dataset catalog summaries for this page")
