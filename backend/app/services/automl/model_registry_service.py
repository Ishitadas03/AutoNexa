"""Persistent model registry service with cryptographic integrity, semantic versioning, and auditable lifecycle transitions."""

from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
import shutil
import tempfile
import threading
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from app.core.config import Settings, get_settings
from app.schemas.tracking import (
    ArtifactVerificationResponse,
    LifecycleAuditEntry,
    LifecycleStage,
    ModelRegistrationRequest,
    ModelRegistryListResponse,
    ModelVersionRecord,
    RegisteredModelSummary,
    StageTransitionRequest,
)
from app.services.automl.experiment_tracker_service import ExperimentTrackerService
from app.services.automl.prediction_service import EXPERIMENT_ID_PATTERN, sanitize_scalar

logger = logging.getLogger(__name__)

# Strict model name identifier pattern
MODEL_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")

# Global re-entrant lock for thread-safe model registration and stage transitions
_REGISTRY_LOCK = threading.RLock()


class ModelRegistryService:
    """Manages versioned, cryptographically audited machine learning model artifacts."""

    def __init__(
        self,
        experiments_dir: Optional[Path] = None,
        tracker_service: Optional[ExperimentTrackerService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.experiments_dir: Path = experiments_dir or self.settings.resolved_experiments_dir
        self.registry_dir: Path = (self.experiments_dir / "model_registry").resolve()
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        self.tracker: ExperimentTrackerService = tracker_service or ExperimentTrackerService(self.experiments_dir)

    def _safe_resolve_model_dir(self, model_name: str) -> Path:
        """Resolve and validate model family directory, preventing directory traversal."""
        cleaned_name = model_name.strip()
        if not cleaned_name or not MODEL_NAME_PATTERN.match(cleaned_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid model name. Only alphanumeric characters, hyphens, and underscores are allowed.",
            )

        model_dir = (self.registry_dir / cleaned_name).resolve()
        base_dir = self.registry_dir.resolve()

        if not model_dir.is_relative_to(base_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Model path escapes registry root directory.",
            )

        return model_dir

    def _safe_resolve_version_dir(self, model_name: str, version: int) -> Path:
        """Resolve and validate a specific model version directory."""
        if version < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Model version must be a positive integer >= 1.",
            )

        model_dir = self._safe_resolve_model_dir(model_name)
        version_dir = (model_dir / f"v{version}").resolve()

        if not version_dir.is_relative_to(model_dir):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Security violation: Version path escapes model directory.",
            )

        return version_dir

    def register_model(self, request: ModelRegistrationRequest) -> ModelVersionRecord:
        """Register a validated model artifact from a completed experiment under a model family name."""
        with _REGISTRY_LOCK:
            model_name = request.model_name.strip()
            if not MODEL_NAME_PATTERN.match(model_name):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid model name. Only alphanumeric characters, hyphens, and underscores are allowed.",
                )

            # 1. Inspect source experiment
            exp_detail = self.tracker.get_experiment_detail(request.experiment_id)

            # Validate that experiment completed successfully
            if exp_detail.status != "completed":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot register model from experiment '{request.experiment_id}' with status '{exp_detail.status}'. Only 'completed' experiments can be registered.",
                )

            if not exp_detail.best_model:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Experiment '{request.experiment_id}' has no winning model identified for registration.",
                )

            # 2. Verify source artifact on disk
            exp_dir = self.tracker.safe_resolve_experiment_dir(request.experiment_id)
            source_model_file = exp_dir / "best_model.joblib"

            if not source_model_file.is_file():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Model artifact 'best_model.joblib' is missing from experiment '{request.experiment_id}'.",
                )

            # Compute real-time SHA-256 and size of source model
            hasher = hashlib.sha256()
            with open(source_model_file, "rb") as mf:
                for chunk in iter(lambda: mf.read(65536), b""):
                    hasher.update(chunk)
            computed_sha256 = hasher.hexdigest()
            model_size_bytes = source_model_file.stat().st_size

            # Check integrity against experiment metadata if recorded
            expected_sha256 = exp_detail.artifacts.get("model_sha256") if exp_detail.artifacts else None
            if expected_sha256 and expected_sha256 != computed_sha256:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Artifact checksum mismatch between experiment metadata and disk file. Registration aborted for safety.",
                )

            model_dir = self._safe_resolve_model_dir(model_name)
            model_dir.mkdir(parents=True, exist_ok=True)

            # 3. Determine next version number (monotonically increasing) or return existing for idempotency
            existing_versions = self._get_version_numbers(model_name)
            for v in existing_versions:
                existing_record = self._load_version_record(model_name, v)
                if existing_record.experiment_id == request.experiment_id:
                    logger.info(
                        "Idempotent registration: experiment '%s' already registered as '%s' v%d",
                        request.experiment_id,
                        model_name,
                        v,
                    )
                    return existing_record

            next_version = (max(existing_versions) + 1) if existing_versions else 1

            version_dir = model_dir / f"v{next_version}"
            version_dir.mkdir(parents=True, exist_ok=False)

            dest_artifact_file = version_dir / "best_model.joblib"
            # Atomically copy artifact into immutable version directory
            with tempfile.NamedTemporaryFile("wb", dir=version_dir, delete=False) as tf:
                temp_art_path = Path(tf.name)
            shutil.copyfile(source_model_file, temp_art_path)
            temp_art_path.replace(dest_artifact_file)

            now_iso = datetime.now(timezone.utc).isoformat()

            audit_entry = LifecycleAuditEntry(
                timestamp=now_iso,
                from_stage="none",
                to_stage=request.initial_stage.value,
                reason=request.description or f"Initial registration from experiment {request.experiment_id}",
                operator="system",
            )

            record = ModelVersionRecord(
                model_name=model_name,
                version=next_version,
                version_tag=f"v{next_version}",
                experiment_id=request.experiment_id,
                stage=request.initial_stage,
                task_type=exp_detail.task_type,
                model_family=exp_detail.best_model,
                primary_metric=exp_detail.primary_metric,
                score=exp_detail.best_score,
                test_metrics=exp_detail.test_metrics,
                dataset_id=exp_detail.dataset_id,
                dataset_fingerprint=exp_detail.dataset_fingerprint,
                artifact_filename="best_model.joblib",
                artifact_sha256=computed_sha256,
                artifact_size_bytes=model_size_bytes,
                status="active",
                description=request.description,
                tags=request.tags,
                created_at=now_iso,
                updated_at=now_iso,
                audit_history=[audit_entry],
            )

            # Save version record JSON
            version_meta_file = version_dir / "version.json"
            with tempfile.NamedTemporaryFile("w", dir=version_dir, delete=False, encoding="utf-8") as tf:
                json.dump(record.model_dump(), tf, indent=2)
                temp_v_path = Path(tf.name)
            temp_v_path.replace(version_meta_file)

            # If registered directly to Production, demote any previous production version
            if request.initial_stage == LifecycleStage.PRODUCTION:
                self._handle_production_exclusivity(model_name, exempt_version=next_version)

            logger.info("Successfully registered model '%s' version %d (stage: %s)", model_name, next_version, request.initial_stage.value)
            return record

    def _get_version_numbers(self, model_name: str) -> List[int]:
        """Return sorted list of existing version numbers for a model name."""
        model_dir = self._safe_resolve_model_dir(model_name)
        if not model_dir.is_dir():
            return []

        versions = []
        for child in model_dir.iterdir():
            if child.is_dir() and child.name.startswith("v"):
                try:
                    num = int(child.name[1:])
                    if (child / "version.json").is_file():
                        versions.append(num)
                except ValueError:
                    pass
        return sorted(versions)

    def _load_version_record(self, model_name: str, version: int) -> ModelVersionRecord:
        """Read and validate a ModelVersionRecord from disk."""
        v_dir = self._safe_resolve_version_dir(model_name, version)
        v_meta = v_dir / "version.json"

        if not v_meta.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model '{model_name}' version {version} not found.",
            )

        try:
            with open(v_meta, "r", encoding="utf-8") as f:
                data = json.load(f)
            return ModelVersionRecord(**data)
        except Exception as exc:
            logger.error("Failed to parse version record for %s v%d: %s", model_name, version, exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Version record for '{model_name}' v{version} is corrupted.",
            ) from exc

    def _save_version_record(self, record: ModelVersionRecord) -> None:
        """Atomically persist a ModelVersionRecord to its version directory."""
        v_dir = self._safe_resolve_version_dir(record.model_name, record.version)
        v_meta = v_dir / "version.json"

        with tempfile.NamedTemporaryFile("w", dir=v_dir, delete=False, encoding="utf-8") as tf:
            json.dump(record.model_dump(), tf, indent=2)
            temp_path = Path(tf.name)
        temp_path.replace(v_meta)

    def _handle_production_exclusivity(self, model_name: str, exempt_version: int) -> None:
        """Ensure only one version of a model is in 'production' at any given time."""
        versions = self._get_version_numbers(model_name)
        now_iso = datetime.now(timezone.utc).isoformat()

        for v in versions:
            if v == exempt_version:
                continue
            v_record = self._load_version_record(model_name, v)
            if v_record.stage == LifecycleStage.PRODUCTION:
                v_record.stage = LifecycleStage.ARCHIVED
                v_record.updated_at = now_iso
                v_record.audit_history.append(
                    LifecycleAuditEntry(
                        timestamp=now_iso,
                        from_stage=LifecycleStage.PRODUCTION.value,
                        to_stage=LifecycleStage.ARCHIVED.value,
                        reason=f"Superceded by promotion of version v{exempt_version} to Production",
                        operator="system",
                    )
                )
                self._save_version_record(v_record)
                logger.info("Demoted model '%s' v%d from production to archived (superceded by v%d)", model_name, v, exempt_version)

    def list_models(self) -> ModelRegistryListResponse:
        """List all registered model families with summaries and version counts."""
        with _REGISTRY_LOCK:
            summaries: List[RegisteredModelSummary] = []

            if self.registry_dir.is_dir():
                for child in self.registry_dir.iterdir():
                    if not child.is_dir() or not MODEL_NAME_PATTERN.match(child.name):
                        continue

                    model_name = child.name
                    versions = self._get_version_numbers(model_name)
                    if not versions:
                        continue

                    records = [self._load_version_record(model_name, v) for v in versions]
                    latest = max(records, key=lambda r: r.version)

                    prod_ver = next((r.version for r in records if r.stage == LifecycleStage.PRODUCTION), None)
                    staging_ver = next((r.version for r in records if r.stage == LifecycleStage.STAGING), None)

                    summaries.append(
                        RegisteredModelSummary(
                            model_name=model_name,
                            latest_version=latest.version,
                            production_version=prod_ver,
                            staging_version=staging_ver,
                            versions_count=len(versions),
                            task_type=latest.task_type,
                            latest_primary_metric=latest.primary_metric,
                            latest_score=latest.score,
                            created_at=records[0].created_at,
                            updated_at=latest.updated_at,
                        )
                    )

            # Sort alphabetically by model name
            summaries.sort(key=lambda s: s.model_name.lower())
            return ModelRegistryListResponse(models=summaries, total=len(summaries))

    def get_model_summary(self, model_name: str) -> RegisteredModelSummary:
        """Retrieve aggregated summary for a specific registered model family."""
        with _REGISTRY_LOCK:
            self._safe_resolve_model_dir(model_name)
            versions = self._get_version_numbers(model_name)
            if not versions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Model family '{model_name}' has no registered versions.",
                )

            records = [self._load_version_record(model_name, v) for v in versions]
            latest = max(records, key=lambda r: r.version)

            prod_ver = next((r.version for r in records if r.stage == LifecycleStage.PRODUCTION), None)
            staging_ver = next((r.version for r in records if r.stage == LifecycleStage.STAGING), None)

            return RegisteredModelSummary(
                model_name=model_name,
                latest_version=latest.version,
                production_version=prod_ver,
                staging_version=staging_ver,
                versions_count=len(versions),
                task_type=latest.task_type,
                latest_primary_metric=latest.primary_metric,
                latest_score=latest.score,
                created_at=records[0].created_at,
                updated_at=latest.updated_at,
            )

    def get_model_versions(self, model_name: str) -> List[ModelVersionRecord]:
        """List all version records for a specified model family."""
        with _REGISTRY_LOCK:
            versions = self._get_version_numbers(model_name)
            if not versions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Model family '{model_name}' has no registered versions.",
                )
            return [self._load_version_record(model_name, v) for v in reversed(versions)]

    def get_version_details(self, model_name: str, version: int) -> ModelVersionRecord:
        """Retrieve full details of a specific model version."""
        with _REGISTRY_LOCK:
            return self._load_version_record(model_name, version)

    def get_model_version(self, model_name: str, version: int) -> ModelVersionRecord:
        """Retrieve details of a specific model version (alias for get_version_details)."""
        return self.get_version_details(model_name=model_name, version=version)

    def transition_stage(
        self,
        model_name: str,
        version: int,
        request: StageTransitionRequest,
    ) -> ModelVersionRecord:
        """Promote or transition a model version's lifecycle stage with complete audit logging."""
        with _REGISTRY_LOCK:
            record = self._load_version_record(model_name, version)
            old_stage = record.stage

            if old_stage == request.new_stage:
                # Idempotent stage transition
                return record

            # Safeguard: Never mark a model as production-ready when its artifact does not exist or cannot be validated
            if request.new_stage == LifecycleStage.PRODUCTION:
                verification = self.verify_version_artifact(model_name, version)
                if not verification.verified or not verification.artifact_exists:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot promote to Production: Artifact integrity verification failed ({verification.message}).",
                    )

            now_iso = datetime.now(timezone.utc).isoformat()
            record.stage = request.new_stage
            record.updated_at = now_iso

            audit_entry = LifecycleAuditEntry(
                timestamp=now_iso,
                from_stage=old_stage.value,
                to_stage=request.new_stage.value,
                reason=request.reason or f"Transitioned from {old_stage.value} to {request.new_stage.value}",
                operator="operator",
            )
            record.audit_history.append(audit_entry)

            self._save_version_record(record)

            # Handle exclusivity if promoted to Production
            if request.new_stage == LifecycleStage.PRODUCTION:
                self._handle_production_exclusivity(model_name, exempt_version=version)

            logger.info("Transitioned model '%s' v%d: %s -> %s", model_name, version, old_stage.value, request.new_stage.value)
            return record

    def verify_version_artifact(self, model_name: str, version: int) -> ArtifactVerificationResponse:
        """Verify real-time integrity and SHA-256 checksum of registered model version artifact."""
        with _REGISTRY_LOCK:
            record = self._load_version_record(model_name, version)
            v_dir = self._safe_resolve_version_dir(model_name, version)
            artifact_file = v_dir / record.artifact_filename

            if not artifact_file.is_file():
                return ArtifactVerificationResponse(
                    verified=False,
                    expected_sha256=record.artifact_sha256,
                    actual_sha256=None,
                    size_bytes=None,
                    artifact_exists=False,
                    message=f"Model artifact file '{record.artifact_filename}' is missing from registry disk storage.",
                )

            hasher = hashlib.sha256()
            with open(artifact_file, "rb") as mf:
                for chunk in iter(lambda: mf.read(65536), b""):
                    hasher.update(chunk)
            actual_sha256 = hasher.hexdigest()
            size_bytes = artifact_file.stat().st_size

            if actual_sha256 == record.artifact_sha256:
                return ArtifactVerificationResponse(
                    verified=True,
                    expected_sha256=record.artifact_sha256,
                    actual_sha256=actual_sha256,
                    size_bytes=size_bytes,
                    artifact_exists=True,
                    message="Model registry artifact integrity verified: Real-time SHA-256 matches registered checksum.",
                )

            return ArtifactVerificationResponse(
                verified=False,
                expected_sha256=record.artifact_sha256,
                actual_sha256=actual_sha256,
                size_bytes=size_bytes,
                artifact_exists=True,
                message="CRITICAL INTEGRITY FAILURE: Real-time artifact SHA-256 does NOT match registered checksum.",
            )

    def get_artifact_file_path(self, model_name: str, version: int) -> Path:
        """Safely retrieve validated artifact file path for downloading or inference."""
        verification = self.verify_version_artifact(model_name, version)
        if not verification.verified or not verification.artifact_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot retrieve artifact: {verification.message}",
            )

        v_dir = self._safe_resolve_version_dir(model_name, version)
        record = self._load_version_record(model_name, version)
        return v_dir / record.artifact_filename

    def compare_versions(self, model_name: str, versions: Optional[List[int]] = None) -> Dict[str, Any]:
        """Compare metrics, dataset identity, and configurations across versions of a model family."""
        with _REGISTRY_LOCK:
            all_versions = self._get_version_numbers(model_name)
            if not all_versions:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Model '{model_name}' has no registered versions.",
                )

            target_versions = versions if versions else all_versions
            records = [self._load_version_record(model_name, v) for v in target_versions if v in all_versions]

            if len(records) < 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="At least 2 valid versions are required for comparison.",
                )

            metric_names = set()
            for r in records:
                metric_names.add(r.primary_metric)
                if r.test_metrics:
                    for k, v in r.test_metrics.items():
                        if isinstance(v, (int, float)):
                            metric_names.add(k)

            matrix: Dict[str, Dict[str, Optional[float]]] = {}
            for m in sorted(metric_names):
                matrix[m] = {}
                for r in records:
                    val = None
                    if m == r.primary_metric and r.score is not None:
                        val = sanitize_scalar(r.score)
                    elif r.test_metrics and m in r.test_metrics:
                        val = sanitize_scalar(r.test_metrics[m])
                    matrix[m][f"v{r.version}"] = val

            return {
                "model_name": model_name,
                "versions_compared": [f"v{r.version}" for r in records],
                "stages": {f"v{r.version}": r.stage.value for r in records},
                "algorithms": {f"v{r.version}": r.model_family for r in records},
                "dataset_fingerprints": {f"v{r.version}": r.dataset_fingerprint for r in records},
                "metric_comparison": matrix,
            }


def get_model_registry_service() -> ModelRegistryService:
    """FastAPI dependency for ModelRegistryService."""
    return ModelRegistryService()
