"""Model registry endpoints for registering, versioning, promoting, verifying, and downloading machine learning models."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.schemas.tracking import (
    ArtifactVerificationResponse,
    ModelRegistrationRequest,
    ModelRegistryListResponse,
    ModelVersionRecord,
    StageTransitionRequest,
)
from app.services.automl.model_registry_service import (
    ModelRegistryService,
    get_model_registry_service,
)

router = APIRouter(prefix="/models", tags=["Model Registry"])


@router.post(
    "/register",
    response_model=ModelVersionRecord,
    status_code=status.HTTP_201_CREATED,
    summary="Register a Model from a Completed Experiment",
    description=(
        "Registers the winning model pipeline from a successfully completed AutoML experiment. "
        "Verifies physical artifact presence, computes and records SHA-256 integrity checksums, "
        "assigns the next monotonic version number, initializes the audit history, and manages stage lifecycle."
    ),
)
def register_model(
    request: ModelRegistrationRequest,
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> ModelVersionRecord:
    """Register a new model version from a completed experiment."""
    return service.register_model(request)


@router.get(
    "",
    response_model=ModelRegistryListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Registered Model Families",
    description="Retrieves the catalog of registered model families with version counts, stages, and latest scores.",
)
def list_registered_models(
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> ModelRegistryListResponse:
    """List all registered model families."""
    return service.list_models()


@router.get(
    "/{model_name}",
    response_model=List[ModelVersionRecord],
    status_code=status.HTTP_200_OK,
    summary="List All Versions of a Model Family",
    description="Retrieves all version records, stages, metrics, and audit logs for the specified model family.",
)
def get_model_versions(
    model_name: str,
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> List[ModelVersionRecord]:
    """List all versions of a model family."""
    return service.get_model_versions(model_name=model_name)


@router.get(
    "/{model_name}/versions/{version}",
    response_model=ModelVersionRecord,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Model Version Details",
    description="Retrieves detailed specification, metrics, and audit trail for a specific model version.",
)
def get_version_details(
    model_name: str,
    version: int,
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> ModelVersionRecord:
    """Retrieve details for a specific model version."""
    return service.get_version_details(model_name=model_name, version=version)


@router.post(
    "/{model_name}/versions/{version}/stage",
    response_model=ModelVersionRecord,
    status_code=status.HTTP_200_OK,
    summary="Transition Lifecycle Stage",
    description=(
        "Promotes or changes the lifecycle stage (Development, Staging, Production, Archived) of a model version. "
        "Enforces single-production version exclusivity per model family and appends an auditable transition log entry."
    ),
)
def transition_stage(
    model_name: str,
    version: int,
    request: StageTransitionRequest,
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> ModelVersionRecord:
    """Transition the lifecycle stage of a model version."""
    return service.transition_stage(model_name=model_name, version=version, request=request)


@router.get(
    "/{model_name}/versions/{version}/verify",
    response_model=ArtifactVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify Model Version Artifact Integrity",
    description="Performs real-time cryptographic verification of the registered model binary against its registered checksum.",
)
def verify_version_artifact(
    model_name: str,
    version: int,
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> ArtifactVerificationResponse:
    """Verify physical artifact presence and cryptographic SHA-256 integrity."""
    return service.verify_version_artifact(model_name=model_name, version=version)


@router.get(
    "/{model_name}/versions/{version}/download",
    status_code=status.HTTP_200_OK,
    summary="Download Model Version Artifact",
    description="Streams the registered serialized .joblib model pipeline after verifying existence and integrity.",
    responses={
        200: {
            "content": {"application/octet-stream": {}},
            "description": "Serialized scikit-learn model pipeline binary (.joblib).",
        }
    },
)
def download_version_artifact(
    model_name: str,
    version: int,
    service: ModelRegistryService = Depends(get_model_registry_service),
):
    """Download verified model version binary."""
    artifact_path = service.get_artifact_file_path(model_name, version)
    verification = service.verify_version_artifact(model_name, version)
    return FileResponse(
        path=str(artifact_path),
        filename=f"{model_name}_v{version}.joblib",
        media_type="application/octet-stream",
        headers={"X-Artifact-SHA256": verification.actual_sha256 or ""},
    )


@router.post(
    "/{model_name}/compare-versions",
    status_code=status.HTTP_200_OK,
    summary="Compare Versions of a Model Family",
    description="Compares metrics, hyperparameter configurations, and lifecycle stages across versions of the same model.",
)
def compare_model_versions(
    model_name: str,
    versions: Optional[List[int]] = Query(default=None, description="Optional list of version numbers to compare"),
    service: ModelRegistryService = Depends(get_model_registry_service),
) -> Dict[str, Any]:
    """Compare multiple versions of a model family side-by-side."""
    return service.compare_versions(model_name=model_name, versions=versions)
