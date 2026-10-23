"""Repository for indexed end-to-end AutoML pipeline execution records."""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import PipelineModel, utc_now

logger = logging.getLogger(__name__)


class PipelineRepository:
    """Data access layer for pipeline executions and indexed status queries."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, pipeline_id: str) -> Optional[PipelineModel]:
        """Retrieve a pipeline record by primary key."""
        stmt = select(PipelineModel).where(PipelineModel.pipeline_id == pipeline_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert_pipeline(
        self,
        pipeline_id: str,
        name: str,
        model_name: str,
        dataset_id: str,
        target_column: str,
        status: str,
        manifest_json: Dict[str, Any],
        current_stage: Optional[str] = None,
        total_stages: int = 0,
        completed_stages: int = 0,
        retry_count: int = 0,
        failure_reason: Optional[str] = None,
        duration_seconds: Optional[float] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
    ) -> PipelineModel:
        """Atomically upsert a pipeline execution state record."""
        existing = self.get_by_id(pipeline_id)
        now = utc_now()
        eff_created_at = created_at or now
        eff_updated_at = updated_at or now

        if existing is not None:
            existing.name = name
            existing.model_name = model_name
            existing.dataset_id = dataset_id
            existing.target_column = target_column
            existing.status = status
            existing.current_stage = current_stage
            existing.total_stages = total_stages
            existing.completed_stages = completed_stages
            existing.retry_count = retry_count
            existing.failure_reason = failure_reason
            existing.duration_seconds = duration_seconds
            existing.updated_at = eff_updated_at
            existing.completed_at = completed_at
            existing.manifest_json = manifest_json
            self.session.flush()
            return existing

        model = PipelineModel(
            pipeline_id=pipeline_id,
            name=name,
            model_name=model_name,
            dataset_id=dataset_id,
            target_column=target_column,
            status=status,
            current_stage=current_stage,
            total_stages=total_stages,
            completed_stages=completed_stages,
            retry_count=retry_count,
            failure_reason=failure_reason,
            duration_seconds=duration_seconds,
            created_at=eff_created_at,
            updated_at=eff_updated_at,
            completed_at=completed_at,
            manifest_json=manifest_json,
        )
        self.session.add(model)
        self.session.flush()
        return model

    def upsert(self, model: PipelineModel) -> PipelineModel:
        """Upsert a PipelineModel entity directly."""
        existing = self.get_by_id(model.pipeline_id)
        if existing is not None:
            for attr in [
                "name", "model_name", "dataset_id", "target_column", "status",
                "current_stage", "total_stages", "completed_stages", "retry_count",
                "failure_reason", "duration_seconds", "completed_at", "manifest_json",
            ]:
                val = getattr(model, attr, None)
                if val is not None:
                    setattr(existing, attr, val)
            existing.updated_at = model.updated_at or utc_now()
            self.session.flush()
            return existing

        self.session.add(model)
        self.session.flush()
        return model

    def list_pipelines(
        self,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        model_name: Optional[str] = None,
        dataset_id: Optional[str] = None,
    ) -> Tuple[List[PipelineModel], int]:
        """Perform indexed query, filtering, and pagination over pipeline runs."""
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        stmt = select(PipelineModel)
        count_stmt = select(func.count()).select_from(PipelineModel)

        conditions = []
        if status:
            clean_status = status.strip().lower()
            conditions.append(func.lower(PipelineModel.status) == clean_status)

        if model_name:
            clean_model = model_name.strip().lower()
            conditions.append(func.lower(PipelineModel.model_name) == clean_model)

        if dataset_id:
            clean_ds = dataset_id.strip()
            conditions.append(PipelineModel.dataset_id == clean_ds)

        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        # Deterministic sorting: created_at descending, tie-break on pipeline_id descending
        stmt = stmt.order_by(PipelineModel.created_at.desc(), PipelineModel.pipeline_id.desc())
        stmt = stmt.offset(offset).limit(limit)

        total_count = self.session.execute(count_stmt).scalar() or 0
        items = list(self.session.execute(stmt).scalars().all())

        return items, total_count

    def delete_pipeline(self, pipeline_id: str) -> bool:
        """Remove pipeline record from database."""
        item = self.get_by_id(pipeline_id)
        if item is not None:
            self.session.delete(item)
            self.session.flush()
            return True
        return False
