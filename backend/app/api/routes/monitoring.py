"""API routes for Model Monitoring, Drift Detection, Ground-Truth Performance Evaluation, and Automated Retraining."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Path, Query, status

from app.core.security import require_admin_role, require_inference_role
from app.schemas.monitoring import (
    AlertAcknowledgeRequest,
    AlertStatus,
    DriftAnalysisRequest,
    DriftAnalysisResponse,
    GroundTruthIngestRequest,
    GroundTruthIngestResponse,
    MonitoringAlertRecord,
    MonitoringOverviewResponse,
    MonitoringWindowCreate,
    MonitoringWindowResponse,
    PerformanceMetricReport,
    ReferenceProfileCreate,
    ReferenceProfileResponse,
    RetrainingJobRecord,
    RetrainingJobTriggerRequest,
    RetrainingPromotionRequest,
    ServingTelemetryEvent,
)
from app.services.automl.model_monitoring_service import (
    ModelMonitoringService,
    get_model_monitoring_service,
)

router = APIRouter(prefix="/monitoring", tags=["Model Monitoring & Retraining"])


@router.get(
    "/overview",
    response_model=MonitoringOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Model Monitoring Operational Overview",
    description="Returns aggregate counts of telemetry events, active alerts, models monitored, and recent activity.",
)
def get_monitoring_overview(
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> MonitoringOverviewResponse:
    """Consolidated operational overview for model monitoring."""
    return service.get_overview()


@router.get(
    "/telemetry",
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
    summary="Recent Inference Telemetry Events",
    description="Returns privacy-conscious runtime inference telemetry logs.",
)
def get_telemetry_events(
    limit: int = Query(default=50, ge=1, le=500, description="Max events to retrieve"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[Dict[str, Any]]:
    """Retrieve recent inference telemetry events."""
    return service.get_telemetry_events(limit=limit)


# ==============================================================================
# Reference Profiling Endpoints
# ==============================================================================

@router.post(
    "/reference-profiles",
    response_model=ReferenceProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Model Reference Profile",
    description="Extracts statistical distributions from a training or validation dataset to establish a reference baseline.",
)
def create_reference_profile(
    request: ReferenceProfileCreate,
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> ReferenceProfileResponse:
    """Create reference profile from dataset (Admin role required)."""
    return service.create_reference_profile(request)


@router.get(
    "/reference-profiles",
    response_model=List[ReferenceProfileResponse],
    status_code=status.HTTP_200_OK,
    summary="List Reference Baseline Profiles",
    description="Returns all registered baseline distribution profiles, optionally filtered by model family.",
)
def list_reference_profiles(
    model_name: Optional[str] = Query(default=None, description="Filter by model family identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[ReferenceProfileResponse]:
    """List baseline reference profiles."""
    return service.list_reference_profiles(model_name=model_name)


@router.get(
    "/reference-profiles/{profile_id}",
    response_model=ReferenceProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Reference Profile Detail",
    description="Inspect detailed per-feature distribution statistics for a specific reference profile.",
)
def get_reference_profile(
    profile_id: str = Path(..., description="Unique profile identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> ReferenceProfileResponse:
    """Retrieve reference profile details."""
    return service.get_reference_profile(profile_id=profile_id)


# ==============================================================================
# Monitoring Windows Endpoints
# ==============================================================================

@router.post(
    "/windows",
    response_model=MonitoringWindowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Monitoring Batch Window",
    description="Submits a bounded batch of inference feature records for ongoing statistical drift tracking.",
)
def record_monitoring_window(
    request: MonitoringWindowCreate,
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> MonitoringWindowResponse:
    """Submit a batch window of prediction records."""
    return service.record_monitoring_window(request)


@router.get(
    "/windows",
    response_model=List[MonitoringWindowResponse],
    status_code=status.HTTP_200_OK,
    summary="List Recorded Monitoring Windows",
    description="Returns all recorded monitoring windows, optionally filtered by model name.",
)
def list_monitoring_windows(
    model_name: Optional[str] = Query(default=None, description="Filter by model identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[MonitoringWindowResponse]:
    """List recorded monitoring windows."""
    return service.list_monitoring_windows(model_name=model_name)


@router.get(
    "/windows/{window_id}",
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
    summary="Get Monitoring Window Records",
    description="Retrieves metadata and records of a stored monitoring window.",
)
def get_monitoring_window(
    window_id: str = Path(..., description="Unique window identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> Dict[str, Any]:
    """Retrieve monitoring window contents."""
    return service.get_monitoring_window(window_id=window_id)


# ==============================================================================
# Drift Detection Endpoints
# ==============================================================================

@router.post(
    "/drift-analysis",
    response_model=DriftAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Run Tabular Drift Analysis",
    description="Performs Population Stability Index (PSI), Kolmogorov-Smirnov, unseen-category, and missing-rate testing against reference baseline.",
)
def run_drift_analysis(
    request: DriftAnalysisRequest,
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> DriftAnalysisResponse:
    """Execute statistical distribution drift test on window or records."""
    return service.run_drift_analysis(request)


@router.get(
    "/drift-reports",
    response_model=List[DriftAnalysisResponse],
    status_code=status.HTTP_200_OK,
    summary="List Historical Drift Reports",
    description="Retrieves past statistical drift reports, optionally filtered by model name.",
)
def list_drift_reports(
    model_name: Optional[str] = Query(default=None, description="Filter by model identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[DriftAnalysisResponse]:
    """List historical drift reports."""
    return service.list_drift_reports(model_name=model_name)


# ==============================================================================
# Ground-Truth Performance Evaluation Endpoints
# ==============================================================================

@router.post(
    "/ground-truth",
    response_model=GroundTruthIngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Ingest Ground-Truth Labels",
    description="Submits delayed actual labels matching inference records, deduplicating to prevent evaluation inflation.",
)
def ingest_ground_truth(
    request: GroundTruthIngestRequest,
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> GroundTruthIngestResponse:
    """Ingest ground-truth target labels."""
    return service.ingest_ground_truth(request)


@router.post(
    "/ground-truth/evaluate",
    response_model=PerformanceMetricReport,
    status_code=status.HTTP_200_OK,
    summary="Evaluate Ground-Truth Performance",
    description="Calculates classification or regression metrics on ground truth and tests for confirmed degradation against training baseline.",
)
def evaluate_ground_truth_performance(
    model_name: str = Query(..., description="Target model family identifier"),
    version: Optional[int] = Query(default=None, ge=1, description="Model version number"),
    window_id: Optional[str] = Query(default=None, description="Target window identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> PerformanceMetricReport:
    """Evaluate performance against ground-truth labels."""
    return service.evaluate_ground_truth_performance(
        model_name=model_name,
        version=version,
        window_id=window_id,
    )


@router.get(
    "/performance-reports",
    response_model=List[PerformanceMetricReport],
    status_code=status.HTTP_200_OK,
    summary="List Ground-Truth Performance Reports",
    description="Retrieves historical ground-truth performance evaluation reports.",
)
def list_performance_reports(
    model_name: Optional[str] = Query(default=None, description="Filter by model identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[PerformanceMetricReport]:
    """List ground-truth performance evaluation reports."""
    return service.list_performance_reports(model_name=model_name)


# ==============================================================================
# Operational Alerts Endpoints
# ==============================================================================

@router.get(
    "/alerts",
    response_model=List[MonitoringAlertRecord],
    status_code=status.HTTP_200_OK,
    summary="List Monitoring Alerts",
    description="Retrieves active and historical alerts for drift, performance degradation, and data quality issues.",
)
def list_monitoring_alerts(
    model_name: Optional[str] = Query(default=None, description="Filter by model identifier"),
    alert_status: Optional[AlertStatus] = Query(default=None, alias="status", description="Filter by status ('active', 'acknowledged')"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[MonitoringAlertRecord]:
    """List operational alerts."""
    return service.list_alerts(model_name=model_name, status=alert_status)


@router.post(
    "/alerts/{alert_id}/acknowledge",
    response_model=MonitoringAlertRecord,
    status_code=status.HTTP_200_OK,
    summary="Acknowledge Monitoring Alert",
    description="Marks an active alert as acknowledged with operator identity and audit note (Admin role required).",
)
def acknowledge_alert(
    alert_id: str = Path(..., description="Unique alert identifier"),
    request: AlertAcknowledgeRequest = AlertAcknowledgeRequest(),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> MonitoringAlertRecord:
    """Acknowledge an operational alert (Admin role required)."""
    return service.acknowledge_alert(alert_id=alert_id, request=request)


# ==============================================================================
# Automated Retraining Endpoints
# ==============================================================================

@router.post(
    "/retraining/trigger",
    response_model=RetrainingJobRecord,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger Controlled Automated Retraining",
    description="Initiates an auditable retraining run under configured policy ('performance_degradation', 'sustained_drift', 'manual') with candidate validation gate (Admin role required).",
)
def trigger_retraining(
    request: RetrainingJobTriggerRequest,
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> RetrainingJobRecord:
    """Trigger automated retraining job (Admin role required)."""
    return service.trigger_retraining(request)


@router.get(
    "/retraining/jobs",
    response_model=List[RetrainingJobRecord],
    status_code=status.HTTP_200_OK,
    summary="List Automated Retraining Jobs",
    description="Retrieves historical automated retraining jobs, candidate validation results, and promotion status.",
)
def list_retraining_jobs(
    model_name: Optional[str] = Query(default=None, description="Filter by model identifier"),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_inference_role),
) -> List[RetrainingJobRecord]:
    """List automated retraining jobs."""
    return service.list_retraining_jobs(model_name=model_name)


@router.post(
    "/retraining/jobs/{job_id}/promote",
    response_model=RetrainingJobRecord,
    status_code=status.HTTP_200_OK,
    summary="Promote Validated Retrained Candidate",
    description="Promotes a candidate model that passed the validation gate to production or staging with auditable reason (Admin role required).",
)
def promote_retrained_candidate(
    job_id: str = Path(..., description="Unique retraining job identifier"),
    request: RetrainingPromotionRequest = RetrainingPromotionRequest(),
    service: ModelMonitoringService = Depends(get_model_monitoring_service),
    _auth: Dict[str, Any] = Depends(require_admin_role),
) -> RetrainingJobRecord:
    """Promote retrained candidate model (Admin role required)."""
    return service.promote_candidate_model(job_id=job_id, request=request)
