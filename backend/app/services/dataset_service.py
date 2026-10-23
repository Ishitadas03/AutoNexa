import csv
import hashlib
import logging
from pathlib import Path
from typing import Optional, Tuple
import uuid

from fastapi import HTTPException, UploadFile, status
import pandas as pd

from app.core.config import Settings, get_settings
from app.db.models import utc_now
from app.db.repositories.dataset_repository import DatasetRepository
from app.db.session import get_db_context, init_db
from app.schemas.dataset import (
    DatasetListResponse,
    DatasetProfileResponse,
    DatasetSummary,
)

logger = logging.getLogger(__name__)

CHUNK_SIZE_BYTES = 64 * 1024  # 64 KB streaming chunk size


class DatasetService:
    """Service handling secure CSV uploads, structural validation, and profiling."""

    def __init__(
        self,
        upload_dir: Optional[Path] = None,
        max_upload_size_bytes: Optional[int] = None,
        metadata_db_path: Optional[Path] = None,
    ) -> None:
        settings: Settings = get_settings()
        self.upload_dir: Path = upload_dir or settings.resolved_upload_dir
        self.max_upload_size_bytes: int = max_upload_size_bytes or settings.max_upload_size_bytes
        self.metadata_db_path: Path = metadata_db_path or settings.resolved_metadata_db_path
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        # Ensure metadata schema is initialized
        try:
            init_db(db_path=self.metadata_db_path)
        except Exception as exc:
            logger.warning("Database schema check warning in DatasetService: %s", exc)

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
        hasher = hashlib.sha256()

        try:
            with open(target_path, "wb") as destination:
                while chunk := await file.read(CHUNK_SIZE_BYTES):
                    total_bytes += len(chunk)
                    if total_bytes > self.max_upload_size_bytes:
                        size_exceeded = True
                        break
                    destination.write(chunk)
                    hasher.update(chunk)
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

        logger.info(
            "Dataset upload validated | dataset_id=%s filename=%s bytes=%d sha256=%s",
            dataset_id,
            sanitized_filename,
            total_bytes,
            hasher.hexdigest()[:16],
        )
        return dataset_id, target_path, sanitized_filename, total_bytes, hasher.hexdigest()

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
            logger.warning("Dataset validation failed | dataset_id=%s reason=%s", dataset_id, validation_error)
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

    def resolve_dataset_file(self, dataset_id: str) -> Path:
        """Validate dataset ID and return the safe file path on disk."""
        if not dataset_id or not isinstance(dataset_id, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid dataset identifier must be provided.",
            )

        sanitized_id = Path(dataset_id).name
        if sanitized_id != dataset_id or ".." in dataset_id or "/" in dataset_id or "\\" in dataset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid dataset identifier format.",
            )

        file_path = (self.upload_dir / f"{sanitized_id}.csv").resolve()
        if not file_path.is_relative_to(self.upload_dir.resolve()):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsafe dataset path resolution.",
            )

        if not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset with identifier '{dataset_id}' does not exist.",
            )
        return file_path

    async def ingest_dataset(self, file: UploadFile) -> DatasetProfileResponse:
        """High-level orchestration: stream to disk, validate structure, record in catalog, and generate profile."""
        try:
            dataset_id, saved_path, display_name, file_size, sha256_hex = await self.save_and_validate_stream(file)
            profile = self.profile_csv(saved_path, dataset_id, display_name)

            # Persist metadata to SQLite catalog
            try:
                with get_db_context(self.metadata_db_path) as session:
                    repo = DatasetRepository(session)
                    repo.create_or_update(
                        dataset_id=dataset_id,
                        filename=display_name,
                        rows=profile.rows,
                        columns=profile.columns,
                        column_names=profile.column_names,
                        data_types=profile.data_types,
                        missing_values=profile.missing_values,
                        duplicate_rows=profile.duplicate_rows,
                        memory_usage_bytes=profile.memory_usage_bytes,
                        file_size_bytes=profile.file_size_bytes,
                        fingerprint_sha256=sha256_hex,
                        validation_status="validated",
                    )
            except Exception as db_err:
                logger.error("Failed to persist dataset %s to metadata database: %s", dataset_id, db_err)

            logger.info("Dataset profiling completed | dataset_id=%s rows=%d cols=%d", dataset_id, profile.rows, profile.columns)
            return profile
        finally:
            await file.close()

    def list_datasets(
        self,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status_filter: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> DatasetListResponse:
        """List and paginate persisted datasets from the metadata database."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))

        with get_db_context(self.metadata_db_path) as session:
            repo = DatasetRepository(session)
            records, total = repo.list_datasets(
                page=page,
                page_size=page_size,
                search=search,
                status=status_filter,
                sort_by=sort_by,
                sort_order=sort_order,
            )
            total_pages = (total + page_size - 1) // page_size if total > 0 else 0

            summaries = []
            for rec in records:
                exp_count = repo.count_associated_experiments(rec.dataset_id)
                pipe_count = repo.count_associated_pipelines(rec.dataset_id)
                summaries.append(
                    DatasetSummary(
                        dataset_id=rec.dataset_id,
                        filename=rec.filename,
                        rows=rec.rows,
                        columns=rec.columns,
                        column_names=rec.column_names,
                        data_types=rec.data_types,
                        missing_values=rec.missing_values,
                        duplicate_rows=rec.duplicate_rows,
                        memory_usage_bytes=rec.memory_usage_bytes,
                        file_size_bytes=rec.file_size_bytes,
                        fingerprint_sha256=rec.fingerprint_sha256,
                        validation_status=rec.validation_status,
                        created_at=rec.created_at.isoformat() if rec.created_at else utc_now().isoformat(),
                        updated_at=rec.updated_at.isoformat() if rec.updated_at else utc_now().isoformat(),
                        associated_experiments_count=exp_count,
                        associated_pipelines_count=pipe_count,
                    )
                )

            return DatasetListResponse(
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
                datasets=summaries,
            )

    def get_dataset(self, dataset_id: str) -> DatasetSummary:
        """Retrieve a specific dataset summary by ID from the catalog."""
        # Validate dataset_id format
        if not dataset_id or not isinstance(dataset_id, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A valid dataset identifier must be provided.",
            )
        sanitized_id = Path(dataset_id).name
        if sanitized_id != dataset_id or ".." in dataset_id or "/" in dataset_id or "\\" in dataset_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid dataset identifier format.",
            )

        with get_db_context(self.metadata_db_path) as session:
            repo = DatasetRepository(session)
            rec = repo.get_by_id(dataset_id)
            if rec is None:
                # Check if file exists on disk as fallback (e.g. legacy upload)
                file_path = (self.upload_dir / f"{sanitized_id}.csv").resolve()
                if not file_path.is_file():
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Dataset with identifier '{dataset_id}' not found.",
                    )
                # Profile on the fly and register
                profile = self.profile_csv(file_path, dataset_id, f"{dataset_id}.csv")
                hasher = hashlib.sha256()
                with open(file_path, "rb") as probe:
                    for chunk in iter(lambda: probe.read(65536), b""):
                        hasher.update(chunk)
                rec = repo.create_or_update(
                    dataset_id=dataset_id,
                    filename=profile.filename,
                    rows=profile.rows,
                    columns=profile.columns,
                    column_names=profile.column_names,
                    data_types=profile.data_types,
                    missing_values=profile.missing_values,
                    duplicate_rows=profile.duplicate_rows,
                    memory_usage_bytes=profile.memory_usage_bytes,
                    file_size_bytes=profile.file_size_bytes,
                    fingerprint_sha256=hasher.hexdigest(),
                    validation_status="validated",
                )

            exp_count = repo.count_associated_experiments(rec.dataset_id)
            pipe_count = repo.count_associated_pipelines(rec.dataset_id)

            return DatasetSummary(
                dataset_id=rec.dataset_id,
                filename=rec.filename,
                rows=rec.rows,
                columns=rec.columns,
                column_names=rec.column_names,
                data_types=rec.data_types,
                missing_values=rec.missing_values,
                duplicate_rows=rec.duplicate_rows,
                memory_usage_bytes=rec.memory_usage_bytes,
                file_size_bytes=rec.file_size_bytes,
                fingerprint_sha256=rec.fingerprint_sha256,
                validation_status=rec.validation_status,
                created_at=rec.created_at.isoformat() if rec.created_at else utc_now().isoformat(),
                updated_at=rec.updated_at.isoformat() if rec.updated_at else utc_now().isoformat(),
                associated_experiments_count=exp_count,
                associated_pipelines_count=pipe_count,
            )


def get_dataset_service() -> DatasetService:
    """Dependency provider for DatasetService."""
    return DatasetService()
