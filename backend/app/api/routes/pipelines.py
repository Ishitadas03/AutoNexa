"""API routes for AutoNexa Phase 15 End-to-End Pipeline Orchestration."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Path, Query, status

from app.core.security import require_admin_role, require_inference_role
from app.schemas.pipeline import (
    PipelineCreateRequest,
    PipelineEvent,
    PipelineListResponse,
    PipelineResponse,
)
from app.services.automl.pipeline_service import (
    PipelineService,
    get_pipeline_service,
)

router = APIRouter(prefix="/pipelines", tags=["Pipeline Orchestration"])


@router.post(
    "",
    response_model=PipelineResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create & Launch AutoML Pipeline",
    description=(
        "Validates configuration, initializes provenance tracking, and launches an asynchronous "
        "end-to-end AutoML pipeline run. Requires administrator credentials."
    ),
)
def create_pipeline(
    request: PipelineCreateRequest,
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> PipelineResponse:
    """Validate and launch an end-to-end AutoML pipeline execution."""
    return service.create_pipeline(request)


@router.get(
    "",
    response_model=PipelineListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Pipeline Executions",
    description="Returns a paginated list of recorded pipeline executions with optional filtering.",
)
def list_pipelines(
    limit: int = Query(default=50, ge=1, le=100, description="Max number of items to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    status: Optional[str] = Query(default=None, description="Filter by status (pending, running, succeeded, failed, cancelled)"),
    model_name: Optional[str] = Query(default=None, description="Filter by target model name"),
    dataset_id: Optional[str] = Query(default=None, description="Filter by source dataset identifier"),
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> PipelineListResponse:
    """Query and paginate pipeline execution runs."""
    return service.list_pipelines(
        limit=limit,
        offset=offset,
        status=status,
        model_name=model_name,
        dataset_id=dataset_id,
    )


@router.get(
    "/{pipeline_id}",
    response_model=PipelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Pipeline Execution Details",
    description="Retrieve the current status, stage timeline, execution metrics, and provenance for a pipeline run.",
)
def get_pipeline(
    pipeline_id: str = Path(..., description="Unique pipeline execution identifier"),
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> PipelineResponse:
    """Retrieve full details of a specific pipeline execution."""
    return service.get_pipeline(pipeline_id)


@router.get(
    "/{pipeline_id}/events",
    response_model=List[PipelineEvent],
    status_code=status.HTTP_200_OK,
    summary="Get Pipeline Event Log",
    description="Retrieve bounded chronological execution events and stage transitions for diagnostic audit.",
)
def get_pipeline_events(
    pipeline_id: str = Path(..., description="Unique pipeline execution identifier"),
    limit: int = Query(default=100, ge=1, le=500, description="Max number of events to return"),
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[PipelineEvent]:
    """Retrieve execution event log for a pipeline run."""
    return service.get_pipeline_events(pipeline_id, limit=limit)


@router.post(
    "/{pipeline_id}/cancel",
    response_model=PipelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel Pipeline Execution",
    description=(
        "Request cooperative cancellation of an in-flight or queued pipeline execution. "
        "Requires administrator credentials."
    ),
)
def cancel_pipeline(
    pipeline_id: str = Path(..., description="Unique pipeline execution identifier"),
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> PipelineResponse:
    """Cancel an active or queued pipeline execution."""
    return service.cancel_pipeline(pipeline_id)


@router.post(
    "/{pipeline_id}/retry",
    response_model=PipelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Retry Failed Pipeline",
    description=(
        "Safely restart and re-run an eligible failed or cancelled pipeline execution. "
        "Requires administrator credentials."
    ),
)
def retry_pipeline(
    pipeline_id: str = Path(..., description="Unique pipeline execution identifier"),
    service: PipelineService = Depends(get_pipeline_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> PipelineResponse:
    """Retry an eligible failed or cancelled pipeline."""
    return service.retry_pipeline(pipeline_id)
