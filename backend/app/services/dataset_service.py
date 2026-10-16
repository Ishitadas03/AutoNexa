"""Dataset ingestion, validation, and profiling service."""

import csv
import logging
from pathlib import Path
from typing import Optional, Tuple
import uuid

from fastapi import HTTPException, UploadFile, status
import pandas as pd

from app.core.config import Settings, get_settings
from app.schemas.dataset import DatasetProfileResponse

logger = logging.getLogger(__name__)

CHUNK_SIZE_BYTES = 64 * 1024  # 64 KB streaming chunk size


class DatasetService:
    """Service handling secure CSV uploads, structural validation, and profiling."""

    def __init__(self, upload_dir: Optional[Path] = None, max_upload_size_bytes: Optional[int] = None) -> None:
        settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or settings.resolved_upload_dir
        self.max_upload_size_bytes: int = max_upload_size_bytes or settings.max_upload_size_bytes
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    async def save_and_validate_stream(self, file: UploadFile) -> Tuple[str, Path, str, int]:
        """Stream an uploaded file to disk, enforcing extension and size limits.

        Returns:
            Tuple[dataset_id, target_file_path, sanitized_display_filename, file_size_bytes]
        """
        # Validate filename presence
        raw_filename = file.filename or ""
        if not raw_filename.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid CSV file must be provided.",
            )

        # Sanitize filename (prevent directory traversal in metadata)
        sanitized_filename = Path(raw_filename).name
        if not sanitized_filename.lower().endswith(".csv") or sanitized_filename.strip().lower() == ".csv":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only files with a valid .csv extension are supported.",
            )

        # Generate unique, non-guessable storage identifier
        dataset_id = str(uuid.uuid4())
        target_path = (self.upload_dir / f"{dataset_id}.csv").resolve()

        # Prevent filesystem path traversal
        if not target_path.is_relative_to(self.upload_dir.resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsafe file path detected.",
            )

        total_bytes = 0
        size_exceeded = False
        limit_mb = self.max_upload_size_bytes / (1024 * 1024)

        try:
            with open(target_path, "wb") as destination:
                while chunk := await file.read(CHUNK_SIZE_BYTES):
                    total_bytes += len(chunk)
                    if total_bytes > self.max_upload_size_bytes:
                        size_exceeded = True
                        break
                    destination.write(chunk)
        except Exception as exc:
            target_path.unlink(missing_ok=True)
            logger.error("Error writing uploaded file to disk: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to persist uploaded dataset.",
            ) from exc

        if size_exceeded:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File size exceeds maximum permitted limit of {limit_mb:.1f} MB.",
            )

        # Check for empty files
        if total_bytes == 0:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )

        # Check for whitespace-only content (safely closing handle before unlinking)
        is_whitespace = False
        try:
            with open(target_path, "rb") as probe:
                sample = probe.read(8192)
                if not sample.strip():
                    remaining = probe.read()
                    if not remaining.strip():
                        is_whitespace = True
        except Exception as exc:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to verify uploaded file contents.",
            ) from exc

        if is_whitespace:
            target_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded CSV file contains only whitespace.",
            )

        return dataset_id, target_path, sanitized_filename, total_bytes

    def profile_csv(self, file_path: Path, dataset_id: str, original_filename: str) -> DatasetProfileResponse:
        """Parse the saved CSV, validate its structure, and compute a non-sensitive summary profile."""
        # 1. Structural pre-validation using standard library csv reader
        validation_error: Optional[str] = None
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as text_file:
                reader = csv.reader(text_file)
                try:
                    header = next(reader, None)
                except csv.Error:
                    validation_error = "Malformed CSV: unable to parse header row."
                    header = None

                if not validation_error:
                    if header is None or len(header) == 0 or all(col.strip() == "" for col in header):
                        validation_error = "CSV file contains no usable columns."
                    else:
                        expected_columns = len(header)
                        row_count_scan = 0
                        for row_idx, row in enumerate(reader, start=2):
                            row_count_scan += 1
                            if len(row) != expected_columns:
                                validation_error = (
                                    f"Malformed CSV: row {row_idx} has {len(row)} columns; "
                                    f"expected {expected_columns} columns as declared in header."
                                )
                                break
                        if not validation_error and row_count_scan == 0:
                            validation_error = "CSV file contains headers but no data rows."
        except Exception:
            validation_error = "Malformed CSV: structural validation failed."

        if validation_error:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=validation_error,
            )

        # 2. Tabular parsing and statistical profiling with pandas
        try:
            try:
                df = pd.read_csv(file_path, encoding="utf-8")
            except UnicodeDecodeError:
                df = pd.read_csv(file_path, encoding="latin1")
        except pd.errors.EmptyDataError as exc:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV file contains no parseable columns or data.",
            ) from exc
        except pd.errors.ParserError as exc:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed CSV: inconsistent row or column structure.",
            ) from exc
        except Exception as exc:
            file_path.unlink(missing_ok=True)
            logger.error("Unexpected CSV parsing error: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to parse CSV file. Ensure valid delimited tabular format.",
            ) from exc

        # Reject MultiIndex caused by abnormal structure
        if isinstance(df.index, pd.MultiIndex):
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Malformed CSV: inconsistent column counts across data rows.",
            )

        # Validate usable columns
        if len(df.columns) == 0:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV file contains no usable columns.",
            )

        # Validate usable data rows
        if len(df) == 0:
            file_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV file contains headers but no data rows.",
            )

        # Compute summary metrics without exposing raw rows
        row_count = int(len(df))
        column_count = int(len(df.columns))
        parsed_column_names = [str(col) for col in df.columns]
        inferred_types = {str(col): str(dtype) for col, dtype in df.dtypes.items()}
        missing_counts = {str(col): int(df[col].isna().sum()) for col in df.columns}
        duplicate_count = int(df.duplicated().sum())
        memory_usage = int(df.memory_usage(deep=True).sum())
        actual_file_size = int(file_path.stat().st_size)

        logger.info(
            "Dataset %s successfully profiled (rows=%d, cols=%d, size_bytes=%d)",
            dataset_id,
            row_count,
            column_count,
            actual_file_size,
        )

        return DatasetProfileResponse(
            dataset_id=dataset_id,
            filename=original_filename,
            rows=row_count,
            columns=column_count,
            column_names=parsed_column_names,
            data_types=inferred_types,
            missing_values=missing_counts,
            duplicate_rows=duplicate_count,
            memory_usage_bytes=memory_usage,
            file_size_bytes=actual_file_size,
        )

    async def ingest_dataset(self, file: UploadFile) -> DatasetProfileResponse:
        """High-level orchestration: stream to disk, validate structure, and generate profile."""
        try:
            dataset_id, saved_path, display_name, _ = await self.save_and_validate_stream(file)
            return self.profile_csv(saved_path, dataset_id, display_name)
        finally:
            await file.close()


def get_dataset_service() -> DatasetService:
    """Dependency provider for DatasetService."""
    return DatasetService()
