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
