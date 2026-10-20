"""Secure model serving service: artifact verification, cached model management, strict schema validation, and low-latency inference."""

from collections import deque
from datetime import datetime, timezone
import logging
from pathlib import Path
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline

from app.core.config import Settings, get_settings
from app.schemas.serving import (
    CacheInvalidationResponse,
    ServingHealthResponse,
    ServingMetricsResponse,
    ServingModelDetailResponse,
    ServingModelSummary,
    ServingPredictionRequest,
    ServingPredictionResponse,
)
from app.schemas.tracking import LifecycleStage, ModelVersionRecord
from app.services.automl.experiment_tracker_service import ExperimentTrackerService
from app.services.automl.model_registry_service import (
    MODEL_NAME_PATTERN,
    ModelRegistryService,
    get_model_registry_service,
)
from app.services.automl.prediction_service import sanitize_scalar

logger = logging.getLogger(__name__)

# Global thread lock for cache modifications and metric increments
_CACHE_LOCK = threading.Lock()
_METRICS_LOCK = threading.Lock()


def sanitize_error_detail(exc: Exception) -> str:
    """Strip local filesystem paths and truncate error messages to prevent leakage."""
    msg = str(exc)
    msg = re.sub(r"[A-Za-z]:\\[\w\\\.-]+", "[PATH_REDACTED]", msg)
    msg = re.sub(r"/(?:[\w\.-]+/)+[\w\.-]+", "[PATH_REDACTED]", msg)
    if len(msg) > 250:
        msg = msg[:250] + "..."
    return msg


class LoadedServingModel:
    """Internal container for a deserialized, verified model pipeline in memory."""

    def __init__(
        self,
        model_name: str,
        version: int,
        record: ModelVersionRecord,
        pipeline: Any,
        feature_names: List[str],
        numeric_features: Optional[List[str]],
        categorical_features: Optional[List[str]],
        supports_probabilities: bool,
        classes: Optional[List[Any]],
        artifact_sha256: str,
    ) -> None:
        self.model_name = model_name
        self.version = version
        self.record = record
        self.pipeline = pipeline
        self.feature_names = feature_names
        self.numeric_features = numeric_features or []
        self.categorical_features = categorical_features or []
        self.supports_probabilities = supports_probabilities
        self.classes = classes
        self.artifact_sha256 = artifact_sha256
        self.loaded_at = time.time()
        self.last_accessed_at = time.time()


class ServingMonitoringService:
    """In-memory, bounded operational metrics tracker for model serving latency and request volume."""

    def __init__(self, max_history: int = 1000) -> None:
        self.max_history = max_history
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.validation_errors = 0
        self.integrity_errors = 0
        self._latencies: deque = deque(maxlen=max_history)
        self._model_stats: Dict[str, Dict[str, Any]] = {}

    def record_request(
        self,
        model_name: str,
        version: int,
        latency_ms: float,
        is_success: bool = True,
        is_validation_error: bool = False,
        is_integrity_error: bool = False,
    ) -> None:
        """Record an operational request event without storing customer feature payloads."""
        with _METRICS_LOCK:
            self.total_requests += 1
            if is_success:
                self.successful_requests += 1
                self._latencies.append(latency_ms)
            else:
                self.failed_requests += 1
                if is_validation_error:
                    self.validation_errors += 1
                if is_integrity_error:
                    self.integrity_errors += 1

            model_key = f"{model_name}:v{version}"
            if model_key not in self._model_stats:
                # Bounded memory: cap per-model tracking dictionary to 100 entries to prevent memory exhaustion
                if len(self._model_stats) >= 100:
                    oldest_k = next(iter(self._model_stats))
                    del self._model_stats[oldest_k]

                self._model_stats[model_key] = {
                    "model_name": model_name,
                    "version": version,
                    "total_requests": 0,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "total_latency_ms": 0.0,
                    "min_latency_ms": float("inf"),
                    "max_latency_ms": 0.0,
                    "last_request_at": None,
                }

            stats = self._model_stats[model_key]
            stats["total_requests"] += 1
            stats["last_request_at"] = datetime.now(timezone.utc).isoformat()
            if is_success:
                stats["successful_requests"] += 1
                stats["total_latency_ms"] += latency_ms
                stats["min_latency_ms"] = min(stats["min_latency_ms"], latency_ms)
                stats["max_latency_ms"] = max(stats["max_latency_ms"], latency_ms)
            else:
                stats["failed_requests"] += 1

    def get_metrics(self) -> ServingMetricsResponse:
        """Compute summary statistics over the rolling window."""
        with _METRICS_LOCK:
            latencies = list(self._latencies)
            count = len(latencies)
            if count > 0:
                avg_lat = round(float(np.mean(latencies)), 2)
                p50_lat = round(float(np.percentile(latencies, 50)), 2)
                p95_lat = round(float(np.percentile(latencies, 95)), 2)
                min_lat = round(float(np.min(latencies)), 2)
                max_lat = round(float(np.max(latencies)), 2)
            else:
                avg_lat = p50_lat = p95_lat = min_lat = max_lat = 0.0

            # Clean infinite values in per-model stats
            models_dict = {}
            for k, v in self._model_stats.items():
                v_copy = dict(v)
                if v_copy["min_latency_ms"] == float("inf"):
                    v_copy["min_latency_ms"] = 0.0
                succ = v_copy["successful_requests"]
                v_copy["avg_latency_ms"] = round(v_copy["total_latency_ms"] / succ, 2) if succ > 0 else 0.0
                models_dict[k] = v_copy

            return ServingMetricsResponse(
                total_requests=self.total_requests,
                successful_requests=self.successful_requests,
                failed_requests=self.failed_requests,
                validation_errors=self.validation_errors,
                integrity_errors=self.integrity_errors,
                average_latency_ms=avg_lat,
                p50_latency_ms=p50_lat,
                p95_latency_ms=p95_lat,
                min_latency_ms=min_lat,
                max_latency_ms=max_lat,
                models_served=models_dict,
            )


# Global serving monitor and shared memory model cache
_GLOBAL_MONITOR = ServingMonitoringService()
_GLOBAL_MODEL_CACHE: Dict[Tuple[str, int], LoadedServingModel] = {}


class ModelServingService:
    """Core serving engine managing trusted model caching, artifact verification, and live tabular inference."""

    def __init__(
        self,
        registry_service: Optional[ModelRegistryService] = None,
        tracker_service: Optional[ExperimentTrackerService] = None,
        monitor: Optional[ServingMonitoringService] = None,
    ) -> None:
        self.settings: Settings = get_settings()
        self.registry: ModelRegistryService = registry_service or get_model_registry_service()
        self.tracker: ExperimentTrackerService = tracker_service or ExperimentTrackerService()
        self.monitor: ServingMonitoringService = monitor or _GLOBAL_MONITOR
        # Shared in-memory LRU model cache: (model_name, version) -> LoadedServingModel
        self._model_cache: Dict[Tuple[str, int], LoadedServingModel] = _GLOBAL_MODEL_CACHE

    def list_serving_models(self) -> List[ServingModelSummary]:
        """List all model families with their active serving version, stage, and eligibility status."""
        catalog = self.registry.list_models()
        summaries: List[ServingModelSummary] = []

        for m in catalog.models:
            versions = self.registry.get_model_versions(m.model_name)
            if not versions:
                continue

            # Prioritize Production version, fallback to Staging, else latest
            prod_record = next((v for v in versions if v.stage == LifecycleStage.PRODUCTION), None)
            staging_record = next((v for v in versions if v.stage == LifecycleStage.STAGING), None)

            active_record = prod_record or staging_record
            active_version = active_record.version if active_record else None
            active_stage = active_record.stage.value if active_record else None

            is_eligible = active_stage in self.settings.serving_eligible_stages if active_stage else False

            summaries.append(
                ServingModelSummary(
                    model_name=m.model_name,
                    active_version=active_version,
                    active_stage=active_stage,
                    task_type=m.task_type,
                    model_family=versions[0].model_family,
                    primary_metric=m.latest_primary_metric,
                    score=active_record.score if active_record else m.latest_score,
                    serving_status="active" if is_eligible else "ineligible",
                    available_versions=[v.version for v in versions],
                    production_version=m.production_version,
                    staging_version=m.staging_version,
                )
            )

        return summaries

    def resolve_model_version(
        self,
        model_name: str,
        version: Optional[int] = None,
    ) -> ModelVersionRecord:
        """Resolve a model family and version, enforcing lifecycle stage eligibility.

        If version is omitted, automatically resolves the active Production (or Staging) version.
        """
        cleaned_name = model_name.strip()
        if not cleaned_name or not MODEL_NAME_PATTERN.match(cleaned_name):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid model name. Only alphanumeric characters, hyphens, and underscores are allowed.",
            )

        versions = self.registry.get_model_versions(cleaned_name)
        if not versions:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Model family '{cleaned_name}' has no registered versions.",
            )

        if version is not None:
            if version < 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Model version must be a positive integer >= 1.",
                )
            record = next((v for v in versions if v.version == version), None)
            if not record:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Version v{version} for model '{cleaned_name}' not found.",
                )
        else:
            # Auto-resolve active version: Production preferred, then Staging
            prod = next((v for v in versions if v.stage == LifecycleStage.PRODUCTION), None)
            staging = next((v for v in versions if v.stage == LifecycleStage.STAGING), None)
            record = prod or staging
            if not record:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Model '{cleaned_name}' has no active Production or Staging version eligible for serving. "
                        f"Explicitly specify a version or promote a version to 'production' or 'staging'."
                    ),
                )

        # Stage Eligibility Guard
        if record.stage == LifecycleStage.ARCHIVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Model '{cleaned_name}' v{record.version} is ARCHIVED and ineligible for live inference.",
            )

        if record.stage.value not in self.settings.serving_eligible_stages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Model '{cleaned_name}' v{record.version} is in stage '{record.stage.value}', which is not eligible "
                    f"for live serving. Permitted stages: {self.settings.serving_eligible_stages}."
                ),
            )

        return record

    def get_serving_detail(
        self,
        model_name: str,
        version: Optional[int] = None,
    ) -> ServingModelDetailResponse:
        """Inspect schema, feature column names, and inference capabilities for a served model version."""
        record = self.resolve_model_version(model_name, version)
        loaded = self._get_or_load_model(record)

        with _CACHE_LOCK:
            is_cached = (record.model_name, record.version) in self._model_cache

        return ServingModelDetailResponse(
            model_name=record.model_name,
            version=record.version,
            version_tag=record.version_tag,
            stage=record.stage.value,
            task_type=record.task_type,
            model_family=record.model_family,
            score=record.score,
            primary_metric=record.primary_metric,
            feature_names=loaded.feature_names,
            numeric_features=loaded.numeric_features,
            categorical_features=loaded.categorical_features,
            supports_probabilities=loaded.supports_probabilities,
            classes=loaded.classes,
            artifact_sha256=record.artifact_sha256,
            artifact_size_bytes=record.artifact_size_bytes,
            created_at=record.created_at,
            is_cached=is_cached,
        )

    def check_model_health(
        self,
        model_name: str,
        version: Optional[int] = None,
    ) -> ServingHealthResponse:
        """Check operational readiness and verify physical artifact integrity for a served model."""
        record = self.resolve_model_version(model_name, version)
        verification = self.registry.verify_version_artifact(record.model_name, record.version)

        with _CACHE_LOCK:
            is_cached = (record.model_name, record.version) in self._model_cache

        if not verification.artifact_exists:
            return ServingHealthResponse(
                status="degraded",
                model_name=record.model_name,
                version=record.version,
                stage=record.stage.value,
                artifact_verified=False,
                loaded_in_cache=is_cached,
                message=f"Artifact missing: Model file is not present on disk.",
            )

        if not verification.verified:
            # Checksum mismatch! Invalidate cache immediately for safety
            self.invalidate_cache(record.model_name, record.version)
            return ServingHealthResponse(
                status="degraded",
                model_name=record.model_name,
                version=record.version,
                stage=record.stage.value,
                artifact_verified=False,
                loaded_in_cache=False,
                message="Integrity failure: Disk artifact SHA-256 does not match recorded checksum.",
            )

        return ServingHealthResponse(
            status="healthy",
            model_name=record.model_name,
            version=record.version,
            stage=record.stage.value,
            artifact_verified=True,
            loaded_in_cache=is_cached,
            message="Model artifact verified and operational.",
        )

    def _get_or_load_model(self, record: ModelVersionRecord) -> LoadedServingModel:
        """Thread-safe retrieval of loaded model pipeline from cache with pre-flight SHA-256 verification."""
        cache_key = (record.model_name, record.version)

        with _CACHE_LOCK:
            # 1. Verify artifact existence and integrity on disk before serving from cache
            verification = self.registry.verify_version_artifact(record.model_name, record.version)
            if not verification.artifact_exists:
                if cache_key in self._model_cache:
                    del self._model_cache[cache_key]
                self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_integrity_error=True)
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Model artifact for '{record.model_name}' v{record.version} is missing on disk.",
                )

            if not verification.verified:
                if cache_key in self._model_cache:
                    del self._model_cache[cache_key]
                self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_integrity_error=True)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Artifact integrity check failed: Disk binary SHA-256 mismatch. Loading aborted for safety.",
                )

            if cache_key in self._model_cache:
                cached = self._model_cache[cache_key]
                if cached.artifact_sha256 == record.artifact_sha256:
                    cached.last_accessed_at = time.time()
                    return cached
                else:
                    del self._model_cache[cache_key]

            artifact_path = self.registry.get_artifact_file_path(record.model_name, record.version)

            # 2. Safely deserialize scikit-learn pipeline
            try:
                pipeline = joblib.load(artifact_path)
            except Exception as exc:
                logger.error("Failed to deserialize model binary for %s v%d: %s", record.model_name, record.version, exc)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Model artifact deserialization failed. Binary is corrupt or incompatible with the runtime environment.",
                ) from exc

            if not hasattr(pipeline, "predict"):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Deserialized model pipeline does not implement a 'predict' method.",
                )

            # 3. Inspect capabilities and feature schemas from experiment metadata
            exp_detail = self.tracker.get_experiment_detail(record.experiment_id)
            feature_names = exp_detail.feature_names or []
            numeric_features = exp_detail.numeric_features or []
            categorical_features = exp_detail.categorical_features or []

            # If feature names missing from metadata, attempt extraction from pipeline
            if not feature_names:
                if hasattr(pipeline, "feature_names_in_"):
                    feature_names = list(pipeline.feature_names_in_)
                else:
                    preprocessor = getattr(pipeline, "named_steps", {}).get("preprocessor")
                    if preprocessor and hasattr(preprocessor, "feature_names_in_"):
                        feature_names = list(preprocessor.feature_names_in_)

            # Capability: predict_proba and class labels
            supports_proba = False
            classes = None
            if record.task_type in ("binary_classification", "multiclass_classification"):
                if hasattr(pipeline, "predict_proba"):
                    supports_proba = True
                if hasattr(pipeline, "classes_"):
                    classes = [sanitize_scalar(c) for c in pipeline.classes_]
                else:
                    # Check final estimator step
                    final_estimator = getattr(pipeline, "steps", [("", None)])[-1][1]
                    if hasattr(final_estimator, "classes_"):
                        classes = [sanitize_scalar(c) for c in final_estimator.classes_]

            # 4. Cache eviction if exceeding max models limit
            if len(self._model_cache) >= self.settings.serving_cache_max_models:
                oldest_key = min(self._model_cache.keys(), key=lambda k: self._model_cache[k].last_accessed_at)
                del self._model_cache[oldest_key]
                logger.info("Evicted LRU model from cache: %s v%d", oldest_key[0], oldest_key[1])

            loaded_model = LoadedServingModel(
                model_name=record.model_name,
                version=record.version,
                record=record,
                pipeline=pipeline,
                feature_names=feature_names,
                numeric_features=numeric_features,
                categorical_features=categorical_features,
                supports_probabilities=supports_proba,
                classes=classes,
                artifact_sha256=record.artifact_sha256,
            )

            self._model_cache[cache_key] = loaded_model
            logger.info("Successfully loaded and cached model '%s' v%d in serving memory.", record.model_name, record.version)
            return loaded_model

    def predict(
        self,
        model_name: str,
        request: ServingPredictionRequest,
        version: Optional[int] = None,
    ) -> ServingPredictionResponse:
        """Execute validated, low-latency tabular inference on provided input records."""
        start_time = time.perf_counter()

        record = self.resolve_model_version(model_name, version)
        loaded = self._get_or_load_model(record)

        records = request.records
        if not records:
            self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Input records list must contain at least 1 record.",
            )

        if len(records) > self.settings.max_prediction_records:
            self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Batch size exceeds maximum limit of {self.settings.max_prediction_records} records.",
            )

        expected_features = set(loaded.feature_names) if loaded.feature_names else None

        # 1. Strict Schema Validation on input records
        if expected_features:
            for idx, r in enumerate(records):
                if not isinstance(r, dict):
                    self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Record at index {idx} must be a JSON object/dictionary.",
                    )

                provided_keys = set(r.keys())

                # Missing features
                missing = expected_features - provided_keys
                if missing:
                    self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Record {idx} is missing required feature(s): {sorted(list(missing))}.",
                    )

                # Unexpected rogue features
                unexpected = provided_keys - expected_features
                if unexpected:
                    self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Record {idx} contains unexpected feature(s): {sorted(list(unexpected))}. Strict schema validation enforced.",
                    )

                # Check for unsupported nested structures
                for k, v in r.items():
                    if isinstance(v, (dict, list)):
                        self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Record {idx} feature '{k}' contains unsupported nested structure. Values must be scalar numbers or strings.",
                        )

        # 2. Build aligned DataFrame preserving training column order
        try:
            if loaded.feature_names:
                df = pd.DataFrame(records)[loaded.feature_names]
            else:
                df = pd.DataFrame(records)
        except Exception as exc:
            self.monitor.record_request(record.model_name, record.version, 0.0, is_success=False, is_validation_error=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to structure input records into feature matrix: {exc}",
            ) from exc

        # 3. Execute Model Inference
        try:
            raw_predictions = loaded.pipeline.predict(df)
            predictions = [sanitize_scalar(p) for p in raw_predictions]
        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            self.monitor.record_request(record.model_name, record.version, duration_ms, is_success=False)
            logger.error("Inference failure for %s v%d: %s", record.model_name, record.version, exc)
            err_msg = sanitize_error_detail(exc)
            status_code = status.HTTP_400_BAD_REQUEST if isinstance(exc, ValueError) else status.HTTP_500_INTERNAL_SERVER_ERROR
            raise HTTPException(
                status_code=status_code,
                detail=f"Model prediction failed: {err_msg}",
            ) from exc

        # 4. Optional Probability Output
        probabilities = None
        if loaded.supports_probabilities:
            try:
                raw_proba = loaded.pipeline.predict_proba(df)
                class_labels = loaded.classes or [str(i) for i in range(raw_proba.shape[1])]
                probabilities = []
                for row in raw_proba:
                    row_dict = {str(class_labels[i]): round(float(row[i]), 4) for i in range(len(class_labels))}
                    probabilities.append(row_dict)
            except Exception as exc:
                logger.warning("Probabilities computation failed for %s v%d: %s", record.model_name, record.version, exc)

        duration_ms = round((time.perf_counter() - start_time) * 1000.0, 2)
        self.monitor.record_request(record.model_name, record.version, duration_ms, is_success=True)

        return ServingPredictionResponse(
            model_name=record.model_name,
            version=record.version,
            version_tag=record.version_tag,
            stage=record.stage.value,
            task_type=record.task_type,
            records_count=len(records),
            predictions=predictions,
            probabilities=probabilities,
            latency_ms=duration_ms,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )

    def invalidate_cache(
        self,
        model_name: Optional[str] = None,
        version: Optional[int] = None,
    ) -> CacheInvalidationResponse:
        """Evict model pipeline(s) from memory cache."""
        with _CACHE_LOCK:
            if model_name is None:
                count = len(self._model_cache)
                self._model_cache.clear()
                return CacheInvalidationResponse(
                    model_name="all",
                    version=None,
                    evicted=count > 0,
                    message=f"Evicted all {count} models from serving memory cache.",
                )

            cleaned_name = model_name.strip()
            if version is not None:
                key = (cleaned_name, version)
                evicted = key in self._model_cache
                if evicted:
                    del self._model_cache[key]
                return CacheInvalidationResponse(
                    model_name=cleaned_name,
                    version=version,
                    evicted=evicted,
                    message=f"Model '{cleaned_name}' v{version} {'evicted from' if evicted else 'was not in'} serving cache.",
                )
            else:
                # Evict all versions of model_name
                keys_to_del = [k for k in self._model_cache if k[0] == cleaned_name]
                for k in keys_to_del:
                    del self._model_cache[k]
                return CacheInvalidationResponse(
                    model_name=cleaned_name,
                    version=None,
                    evicted=len(keys_to_del) > 0,
                    message=f"Evicted {len(keys_to_del)} versions of '{cleaned_name}' from serving cache.",
                )


def get_model_serving_service() -> ModelServingService:
    """FastAPI dependency for ModelServingService singleton."""
    return ModelServingService()
