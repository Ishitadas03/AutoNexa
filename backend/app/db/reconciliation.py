"""Idempotent reconciliation and migration engine for datasets, experiments, and pipelines."""

from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import utc_now
from app.db.repositories.dataset_repository import DatasetRepository
from app.db.repositories.experiment_repository import ExperimentRepository, parse_datetime
from app.db.repositories.pipeline_repository import PipelineRepository
from app.db.session import get_db_context, init_db
from app.schemas.pipeline import PipelineResponse

logger = logging.getLogger(__name__)

RESERVED_EXPERIMENT_DIRS: Set[str] = {
    "mlruns",
    "models",
    "pipelines",
    "benchmarks",
    "monitoring",
    "model_registry",
    "__pycache__",
    ".pytest_cache",
}

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


class MetadataReconciliationService:
    """Orchestrates idempotent discovery, validation, and relational migration of legacy file metadata."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings: Settings = settings or get_settings()

    def reconcile_datasets(self, session: Session, upload_dir: Optional[Path] = None) -> int:
        """Scan upload directory for untracked CSV files and register them into the dataset catalog."""
        target_dir = upload_dir or self.settings.resolved_upload_dir
        if not target_dir.is_dir():
            return 0

        repo = DatasetRepository(session)
        reconciled_count = 0

        # Lazy import of profiling logic to avoid circular import
        from app.services.dataset_service import DatasetService

        dataset_service = DatasetService(upload_dir=target_dir)

        for csv_path in sorted(target_dir.glob("*.csv")):
            if not csv_path.is_file():
                continue

            dataset_id = csv_path.stem
            # Verify record doesn't already exist in database
            if repo.get_by_id(dataset_id) is not None:
                continue

            try:
                # Compute SHA-256 fingerprint
                hasher = hashlib.sha256()
                with open(csv_path, "rb") as f:
                    for chunk in iter(lambda: f.read(65536), b""):
                        hasher.update(chunk)
                fingerprint = hasher.hexdigest()

                # Determine timestamp from file modification time
                mtime = csv_path.stat().st_mtime
                created_dt = datetime.fromtimestamp(mtime, tz=timezone.utc)

                # Attempt non-destructive profiling
                try:
                    profile = dataset_service.profile_csv(
                        file_path=csv_path,
                        dataset_id=dataset_id,
                        original_filename=f"{dataset_id}.csv",
                    )
                    repo.create_or_update(
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
                        fingerprint_sha256=fingerprint,
                        validation_status="validated",
                        created_at=created_dt,
                        updated_at=created_dt,
                    )
                    reconciled_count += 1
                except Exception as prof_err:
                    logger.warning("Dataset %s failed profiling during reconciliation: %s", dataset_id, prof_err)
                    # Register corrupted record so it is cataloged and visible to admins
                    repo.create_or_update(
                        dataset_id=dataset_id,
                        filename=f"{dataset_id}.csv",
                        rows=0,
                        columns=0,
                        column_names=[],
                        data_types={},
                        missing_values={},
                        duplicate_rows=0,
                        memory_usage_bytes=0,
                        file_size_bytes=csv_path.stat().st_size,
                        fingerprint_sha256=fingerprint,
                        validation_status="corrupted",
                        created_at=created_dt,
                        updated_at=created_dt,
                    )
                    reconciled_count += 1
            except Exception as exc:
                logger.error("Failed to reconcile dataset file %s: %s", csv_path.name, exc)

        return reconciled_count

    def reconcile_experiments(self, session: Session, experiments_dir: Optional[Path] = None) -> int:
        """Scan experiment directories on disk and populate relational index for unindexed runs."""
        target_dir = experiments_dir or self.settings.resolved_experiments_dir
        if not target_dir.is_dir():
            return 0

        repo = ExperimentRepository(session)
        reconciled_count = 0

        for child in sorted(target_dir.iterdir()):
            if not child.is_dir() or child.name in RESERVED_EXPERIMENT_DIRS:
                continue

            exp_id = child.name
            if repo.get_by_id(exp_id) is not None:
                continue

            metadata_file = child / "metadata.json"
            model_file = child / "best_model.joblib"
            has_artifact = model_file.is_file()

            try:
                mtime = child.stat().st_mtime
                default_dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
            except Exception:
                default_dt = utc_now()

            if not metadata_file.is_file():
                # Incomplete experiment directory
                repo.upsert_experiment(
                    experiment_id=exp_id,
                    name=f"Experiment {exp_id[:8]}",
                    dataset_id="unknown",
                    dataset_fingerprint="unknown",
                    task_type="unknown",
                    target_column="unknown",
                    status="incomplete",
                    primary_metric="metric",
                    has_artifact=has_artifact,
                    created_at=default_dt,
                    updated_at=default_dt,
                )
                reconciled_count += 1
                continue

            try:
                with open(metadata_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                models_eval = data.get("models_evaluated") or []
                created_dt = parse_datetime(data.get("created_at")) or default_dt

                raw_status = data.get("status")
                if not raw_status:
                    raw_status = "completed" if has_artifact else "failed"

                repo.upsert_experiment(
                    experiment_id=exp_id,
                    name=data.get("name") or f"AutoML Run {exp_id[:8]}",
                    description=data.get("description"),
                    dataset_id=str(data.get("dataset_id") or "unknown"),
                    dataset_fingerprint=str(data.get("dataset_fingerprint") or "unknown"),
                    task_type=str(data.get("task_type") or "unknown"),
                    target_column=str(data.get("target_column") or "unknown"),
                    status=str(raw_status),
                    best_model=data.get("best_model"),
                    best_score=data.get("best_score"),
                    primary_metric=str(data.get("primary_metric") or "metric"),
                    primary_metric_greater_is_better=data.get("primary_metric_greater_is_better"),
                    evaluation_strategy=data.get("evaluation_strategy"),
                    total_duration_seconds=data.get("total_duration_seconds"),
                    models_count=len(models_eval),
                    has_artifact=has_artifact,
                    created_at=created_dt,
                    updated_at=created_dt,
                    artifacts_manifest=data.get("artifacts"),
                )
                reconciled_count += 1
            except Exception as exc:
                logger.warning("Failed to reconcile experiment manifest in %s: %s", child.name, exc)

        return reconciled_count

    def reconcile_pipelines(self, session: Session, pipelines_dir: Optional[Path] = None) -> int:
        """Scan pipeline manifest directory on disk and populate relational index for unindexed pipelines."""
        target_dir = pipelines_dir or self.settings.resolved_pipelines_dir
        manifests_dir = target_dir / "manifests"
        if not manifests_dir.is_dir():
            return 0

        repo = PipelineRepository(session)
        reconciled_count = 0

        for manifest_file in sorted(manifests_dir.glob("*.json")):
            pipeline_id = manifest_file.stem
            if repo.get_by_id(pipeline_id) is not None:
                continue

            try:
                with open(manifest_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                parsed = PipelineResponse(**data)
                pipeline_name = data.get("name") or data.get("description") or parsed.pipeline_id
                created_dt = parse_datetime(parsed.created_at) or utc_now()
                updated_dt = parse_datetime(data.get("updated_at")) or created_dt
                completed_dt = parse_datetime(parsed.completed_at)

                completed_stages_count = sum(1 for s in parsed.stages if s.status == "completed")

                repo.upsert_pipeline(
                    pipeline_id=parsed.pipeline_id,
                    name=pipeline_name,
                    model_name=parsed.model_name,
                    dataset_id=parsed.dataset_id,
                    target_column=parsed.target_column,
                    status=parsed.status.value,
                    manifest_json=data,
                    current_stage=parsed.current_stage.value if parsed.current_stage else None,
                    total_stages=len(parsed.stages),
                    completed_stages=completed_stages_count,
                    retry_count=parsed.retry_count,
                    failure_reason=parsed.failure_reason,
                    duration_seconds=parsed.duration_seconds,
                    created_at=created_dt,
                    updated_at=updated_dt,
                    completed_at=completed_dt,
                )
                reconciled_count += 1
            except Exception as exc:
                logger.warning("Failed to reconcile pipeline manifest %s: %s", manifest_file.name, exc)

        return reconciled_count

    def reconcile_all(
        self,
        db_path: Optional[Path] = None,
        upload_dir: Optional[Path] = None,
        experiments_dir: Optional[Path] = None,
        pipelines_dir: Optional[Path] = None,
    ) -> Dict[str, int]:
        """Perform comprehensive reconciliation pass across datasets, experiments, and pipelines."""
        init_db(db_path=db_path)
        with get_db_context(db_path=db_path) as session:
            ds_count = self.reconcile_datasets(session, upload_dir=upload_dir)
            exp_count = self.reconcile_experiments(session, experiments_dir=experiments_dir)
            pipe_count = self.reconcile_pipelines(session, pipelines_dir=pipelines_dir)

        results = {
            "reconciled_datasets": ds_count,
            "reconciled_experiments": exp_count,
            "reconciled_pipelines": pipe_count,
            "datasets": ds_count,
            "experiments": exp_count,
            "pipelines": pipe_count,
            "total": ds_count + exp_count + pipe_count,
        }
        if any(results.values()):
            logger.info("Metadata reconciliation completed: %s", results)
        else:
            logger.info("Metadata reconciliation verified: index is fully up to date.")
        return results
