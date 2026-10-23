"""Repository for indexed AutoML experiment metadata querying and persistence."""

from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import ExperimentModel, utc_now

logger = logging.getLogger(__name__)


def parse_datetime(val: Any) -> Optional[datetime]:
    """Parse various datetime representations into a timezone-aware datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        try:
            # Handle ISO string with or without Z
            cleaned = val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None
    return None


class ExperimentRepository:
    """Data access layer for relational experiment metadata and indexed queries."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, experiment_id: str) -> Optional[ExperimentModel]:
        """Retrieve indexed experiment record by primary key."""
        stmt = select(ExperimentModel).where(ExperimentModel.experiment_id == experiment_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def upsert_experiment(
        self,
        experiment_id: str,
        name: str,
        dataset_id: str,
        dataset_fingerprint: str,
        task_type: str,
        target_column: str,
        status: str,
        primary_metric: str,
        description: Optional[str] = None,
        best_model: Optional[str] = None,
        best_score: Optional[float] = None,
        primary_metric_greater_is_better: Optional[bool] = None,
        evaluation_strategy: Optional[str] = None,
        total_duration_seconds: Optional[float] = None,
        models_count: int = 0,
        has_artifact: bool = False,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        artifacts_manifest: Optional[Dict[str, Any]] = None,
    ) -> ExperimentModel:
        """Atomically insert or update an experiment metadata index record."""
        existing = self.get_by_id(experiment_id)
        now = utc_now()
        eff_created_at = created_at or now
        eff_updated_at = updated_at or now

        if existing is not None:
            existing.name = name
            existing.description = description
            existing.dataset_id = dataset_id
            existing.dataset_fingerprint = dataset_fingerprint
            existing.task_type = task_type
            existing.target_column = target_column
            existing.status = status
            existing.best_model = best_model
            existing.best_score = best_score
            existing.primary_metric = primary_metric
            existing.primary_metric_greater_is_better = primary_metric_greater_is_better
            existing.evaluation_strategy = evaluation_strategy
            existing.total_duration_seconds = total_duration_seconds
            existing.models_count = models_count
            existing.has_artifact = has_artifact
            existing.updated_at = eff_updated_at
            if artifacts_manifest is not None:
                existing.artifacts_manifest = artifacts_manifest
            self.session.flush()
            return existing

        model = ExperimentModel(
            experiment_id=experiment_id,
            name=name,
            description=description,
            dataset_id=dataset_id,
            dataset_fingerprint=dataset_fingerprint,
            task_type=task_type,
            target_column=target_column,
            status=status,
            best_model=best_model,
            best_score=best_score,
            primary_metric=primary_metric,
            primary_metric_greater_is_better=primary_metric_greater_is_better,
            evaluation_strategy=evaluation_strategy,
            total_duration_seconds=total_duration_seconds,
            models_count=models_count,
            has_artifact=has_artifact,
            created_at=eff_created_at,
            updated_at=eff_updated_at,
            artifacts_manifest=artifacts_manifest,
        )
        self.session.add(model)
        self.session.flush()
        return model

    def upsert(self, model: ExperimentModel) -> ExperimentModel:
        """Upsert an ExperimentModel entity directly."""
        existing = self.get_by_id(model.experiment_id)
        if existing is not None:
            for attr in [
                "name", "description", "dataset_id", "dataset_fingerprint", "task_type",
                "target_column", "status", "best_model", "best_score", "primary_metric",
                "primary_metric_greater_is_better", "evaluation_strategy", "total_duration_seconds",
                "models_count", "has_artifact", "artifacts_manifest",
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

    def list_experiments(
        self,
        page: int = 1,
        page_size: int = 10,
        task_type: Optional[str] = None,
        status: Optional[str] = None,
        dataset_id: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[ExperimentModel], int]:
        """Perform indexed query, filtering, and pagination over experiment runs."""
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        offset = (page - 1) * page_size

        stmt = select(ExperimentModel)
        count_stmt = select(func.count()).select_from(ExperimentModel)

        conditions = []
        if task_type:
            tt_clean = f"%{task_type.strip().lower()}%"
            conditions.append(func.lower(ExperimentModel.task_type).like(tt_clean))

        if status:
            st_clean = status.strip().lower()
            conditions.append(func.lower(ExperimentModel.status) == st_clean)

        if dataset_id:
            ds_clean = f"%{dataset_id.strip()}%"
            conditions.append(ExperimentModel.dataset_id.like(ds_clean))

        if search:
            query = f"%{search.strip().lower()}%"
            conditions.append(
                or_(
                    func.lower(ExperimentModel.experiment_id).like(query),
                    func.lower(ExperimentModel.name).like(query),
                    func.lower(ExperimentModel.target_column).like(query),
                    func.lower(ExperimentModel.best_model).like(query),
                    func.lower(ExperimentModel.dataset_id).like(query),
                )
            )

        if conditions:
            stmt = stmt.where(*conditions)
            count_stmt = count_stmt.where(*conditions)

        # Deterministic ordering: created_at descending, tie-break on experiment_id descending
        stmt = stmt.order_by(ExperimentModel.created_at.desc(), ExperimentModel.experiment_id.desc())
        stmt = stmt.offset(offset).limit(page_size)

        total_count = self.session.execute(count_stmt).scalar() or 0
        items = list(self.session.execute(stmt).scalars().all())

        return items, total_count

    def delete_experiment(self, experiment_id: str) -> bool:
        """Remove experiment index record."""
        item = self.get_by_id(experiment_id)
        if item is not None:
            self.session.delete(item)
            self.session.flush()
            return True
        return False
