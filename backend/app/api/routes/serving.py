"""API routes for secure model serving, low-latency inference, model capabilities inspection, health checks, and metrics."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Path, Query, status

from app.core.security import require_admin_role, require_inference_role
from app.schemas.serving import (
    CacheInvalidationResponse,
    ServingHealthResponse,
    ServingMetricsResponse,
    ServingModelDetailResponse,
    ServingModelSummary,
    ServingPredictionRequest,
    ServingPredictionResponse,
)
from app.services.automl.model_serving_service import (
    ModelServingService,
    get_model_serving_service,
)

router = APIRouter(prefix="/serving", tags=["Model Serving & Deployment"])


@router.get(
    "/models",
    response_model=List[ServingModelSummary],
    status_code=status.HTTP_200_OK,
    summary="List Deployable and Served Models",
    description="Retrieves all registered model families with their active serving version, lifecycle stage, and serving eligibility.",
)
def list_serving_models(
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[ServingModelSummary]:
    """List all registered models eligible or active for serving."""
    return service.list_serving_models()


@router.get(
    "/models/{model_name}/versions/{version}",
    response_model=ServingModelDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspect Served Model Version Capabilities & Schema",
    description="Inspects input feature schema, numeric/categorical split, probability support, and memory cache state.",
)
def get_serving_detail(
    model_name: str = Path(..., description="Model family identifier"),
    version: int = Path(..., ge=1, description="Model version integer"),
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ServingModelDetailResponse:
    """Retrieve serving schema and capabilities for a specific model version."""
    return service.get_serving_detail(model_name=model_name, version=version)


@router.get(
    "/models/{model_name}/versions/{version}/health",
    response_model=ServingHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Model Version Operational Health & Integrity",
    description="Performs real-time cryptographic integrity verification and checks memory cache presence.",
)
def check_model_health(
    model_name: str = Path(..., description="Model family identifier"),
    version: int = Path(..., ge=1, description="Model version integer"),
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ServingHealthResponse:
    """Check health and artifact integrity of a served model version."""
    return service.check_model_health(model_name=model_name, version=version)


@router.post(
    "/models/{model_name}/versions/{version}/predict",
    response_model=ServingPredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute Inference on Specific Model Version",
    description=(
        "Executes validated, low-latency tabular inference on provided input records using a specific model version. "
        "Enforces strict feature schema matching, rejects unexpected features, and computes probabilities if supported."
    ),
)
def predict_version(
    request: ServingPredictionRequest,
    model_name: str = Path(..., description="Model family identifier"),
    version: int = Path(..., ge=1, description="Model version integer"),
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ServingPredictionResponse:
    """Run model predictions on an explicit model version."""
    return service.predict(model_name=model_name, version=version, request=request)


@router.post(
    "/models/{model_name}/predict",
    response_model=ServingPredictionResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute Inference on Active Model Version",
    description="Executes inference on the active Production (or Staging) version of the specified model family.",
)
def predict_active(
    request: ServingPredictionRequest,
    model_name: str = Path(..., description="Model family identifier"),
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ServingPredictionResponse:
    """Run model predictions resolving the active production or staging version automatically."""
    return service.predict(model_name=model_name, version=None, request=request)


@router.get(
    "/metrics",
    response_model=ServingMetricsResponse,
    status_code=status.HTTP_200_OK,
    summary="Operational Serving Metrics & Latencies",
    description="Returns aggregate request counts, latency percentiles (avg, p50, p95), and per-model performance.",
)
def get_serving_metrics(
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ServingMetricsResponse:
    """Retrieve aggregated serving operational monitoring metrics."""
    return service.monitor.get_metrics()


@router.post(
    "/models/{model_name}/versions/{version}/cache/invalidate",
    response_model=CacheInvalidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evict Model Version from Memory Cache (Admin Only)",
    description="Forces cache eviction for a specific model version. Requires privileged admin credentials.",
)
def invalidate_model_version_cache(
    model_name: str = Path(..., description="Model family identifier"),
    version: int = Path(..., ge=1, description="Model version integer"),
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> CacheInvalidationResponse:
    """Evict a specific model version from memory cache."""
    return service.invalidate_cache(model_name=model_name, version=version)


@router.post(
    "/cache/invalidate",
    response_model=CacheInvalidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evict Entire Serving Memory Cache (Admin Only)",
    description="Purges all cached model pipelines from serving memory. Requires privileged admin credentials.",
)
def invalidate_all_cache(
    service: ModelServingService = Depends(get_model_serving_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> CacheInvalidationResponse:
    """Purge entire serving memory cache."""
    return service.invalidate_cache(model_name=None, version=None)
