"""Repository for dataset catalog persistence, querying, and relationship metrics."""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import DatasetModel, ExperimentModel, PipelineModel, utc_now

logger = logging.getLogger(__name__)


class DatasetRepository:
    """Data access layer for the persistent dataset catalog."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, dataset_id: str) -> Optional[DatasetModel]:
        """Fetch a single dataset record by primary key."""
        stmt = select(DatasetModel).where(DatasetModel.dataset_id == dataset_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_fingerprint(self, fingerprint: str) -> Optional[DatasetModel]:
        """Fetch a dataset record by cryptographic SHA-256 fingerprint."""
        stmt = select(DatasetModel).where(DatasetModel.fingerprint_sha256 == fingerprint)
        return self.session.execute(stmt).scalar_one_or_none()

    def create_or_update(
        self,
        dataset_id: str,
        filename: str,
        rows: int,
        columns: int,
        column_names: List[str],
        data_types: Dict[str, str],
        missing_values: Dict[str, int],
        duplicate_rows: int,
        memory_usage_bytes: int,
        file_size_bytes: int,
        fingerprint_sha256: str,
        validation_status: str = "validated",
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
    ) -> DatasetModel:
        """Atomically upsert a dataset catalog entry."""
        existing = self.get_by_id(dataset_id)
        now = utc_now()
        eff_created_at = created_at or now
        eff_updated_at = updated_at or now

        if existing is not None:
            existing.filename = filename
            existing.rows = rows
            existing.columns = columns
            existing.column_names = column_names
            existing.data_types = data_types
            existing.missing_values = missing_values
            existing.duplicate_rows = duplicate_rows
            existing.memory_usage_bytes = memory_usage_bytes
            existing.file_size_bytes = file_size_bytes
            existing.fingerprint_sha256 = fingerprint_sha256
            existing.validation_status = validation_status
            existing.updated_at = eff_updated_at
            self.session.flush()
            return existing

        model = DatasetModel(
            dataset_id=dataset_id,
            filename=filename,
            rows=rows,
            columns=columns,
            column_names=column_names,
            data_types=data_types,
            missing_values=missing_values,
            duplicate_rows=duplicate_rows,
            memory_usage_bytes=memory_usage_bytes,
            file_size_bytes=file_size_bytes,
            fingerprint_sha256=fingerprint_sha256,
            validation_status=validation_status,
            created_at=eff_created_at,
            updated_at=eff_updated_at,
        )
        self.session.add(model)
        self.session.flush()
        return model

    def upsert(self, model: DatasetModel) -> DatasetModel:
        """Upsert a DatasetModel entity directly."""
        existing = self.get_by_id(model.dataset_id)
        if existing is not None:
            existing.filename = model.filename
            existing.rows = model.rows
            existing.columns = model.columns
            existing.column_names = model.column_names
            existing.data_types = model.data_types
            existing.missing_values = model.missing_values
            existing.duplicate_rows = model.duplicate_rows
            existing.memory_usage_bytes = model.memory_usage_bytes
            existing.file_size_bytes = model.file_size_bytes
            existing.fingerprint_sha256 = model.fingerprint_sha256
            existing.validation_status = model.validation_status
            existing.updated_at = model.updated_at or utc_now()
            self.session.flush()
            return existing

        self.session.add(model)
        self.session.flush()
        return model

    def list_datasets(
        self,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status: Optional[str] = None,
        validation_status: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> Tuple[List[DatasetModel], int]:
        """Query, filter, and paginate catalog datasets with deterministic sorting."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        offset = (page - 1) * page_size

        # Base query
        stmt = select(DatasetModel)
        count_stmt = select(func.count()).select_from(DatasetModel)

        # Filters
        conditions = []
        eff_status = validation_status or status
        if eff_status:
            clean_status = eff_status.strip().lower()
            conditions.append(func.lower(DatasetModel.validation_status) == clean_status)

        if search:
            pattern = f"%{search.strip().lower()}%"
            conditions.append(
                or_(
                    func.lower(DatasetModel.dataset_id).like(pattern),
                    func.lower(DatasetModel.filename).like(pattern),
                    func.lower(DatasetModel.fingerprint_sha256).like(pattern),
                )
            )

        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        # Deterministic sorting
        is_desc = sort_order.lower() == "desc"
        sort_col = {
            "filename": DatasetModel.filename,
            "rows": DatasetModel.rows,
            "file_size_bytes": DatasetModel.file_size_bytes,
            "created_at": DatasetModel.created_at,
            "updated_at": DatasetModel.updated_at,
        }.get(sort_by.lower(), DatasetModel.created_at)

        primary_order = sort_col.desc() if is_desc else sort_col.asc()
        # Always tie-break on dataset_id for deterministic pagination
        stmt = stmt.order_by(primary_order, DatasetModel.dataset_id.desc())
        stmt = stmt.offset(offset).limit(page_size)

        total_count = self.session.execute(count_stmt).scalar() or 0
        items = list(self.session.execute(stmt).scalars().all())

        return items, total_count

    def count_associated_experiments(self, dataset_id: str) -> int:
        """Safely compute count of experiments linked to this dataset."""
        stmt = select(func.count()).select_from(ExperimentModel).where(ExperimentModel.dataset_id == dataset_id)
        return self.session.execute(stmt).scalar() or 0

    def count_associated_pipelines(self, dataset_id: str) -> int:
        """Safely compute count of pipelines linked to this dataset."""
        stmt = select(func.count()).select_from(PipelineModel).where(PipelineModel.dataset_id == dataset_id)
        return self.session.execute(stmt).scalar() or 0

    def delete_dataset(self, dataset_id: str) -> bool:
        """Delete a dataset catalog record if present."""
        item = self.get_by_id(dataset_id)
        if item is not None:
            self.session.delete(item)
            self.session.flush()
            return True
        return False
