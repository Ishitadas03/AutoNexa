"""AutoNexa Phase 16C: Application Lifecycle & Concurrency Reliability Tests.

Validates FastAPI lifespan management, deterministic startup orphan reconciliation,
bounded graceful shutdown, duplicate job suppression, cooperative cancellation,
and lock decoupling during long-running retraining.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import time
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
import pytest

from app.core.config import Settings
from app.main import app
from app.schemas.monitoring import (
    AlertSeverity,
    RetrainingJobStatus,
    RetrainingJobTriggerRequest,
    RetrainingTriggerPolicy,
)
from app.schemas.pipeline import (
    PipelineCreateRequest,
    PipelineResponse,
    PipelineStage,
    PipelineStatus,
    StageRecord,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.model_monitoring_service import (
    ModelMonitoringService,
    get_model_monitoring_service,
)
from app.services.automl.model_registry_service import (
    ModelRegistryService,
    get_model_registry_service,
)
from app.services.automl.pipeline_service import (
    PipelineService,
    get_pipeline_service,
    reset_pipeline_service,
)
from app.services.automl.training_service import TrainingService


@pytest.fixture
def lifecycle_env(tmp_path: Path):
    """Provide isolated paths, mock settings, and services for lifecycle & concurrency testing."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    monitoring_dir = experiments_dir / "monitoring"
    pipelines_dir = experiments_dir / "pipelines"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    monitoring_dir.mkdir(parents=True, exist_ok=True)
    pipelines_dir.mkdir(parents=True, exist_ok=True)

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        SERVING_AUTH_ENABLED=True,
        SERVING_API_KEY_READ="test-read-key",
        SERVING_API_KEY_ADMIN="test-admin-key",
        PIPELINE_MAX_CONCURRENCY=2,
        PIPELINE_TIMEOUT_SECONDS=60,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.automl.pipeline_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_monitoring_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=test_settings), \
         patch("app.services.analysis_service.get_settings", return_value=test_settings):

        analysis_svc = AnalysisService(upload_dir=upload_dir)
        registry_svc = ModelRegistryService(experiments_dir=experiments_dir)
        tracker_svc = registry_svc.tracker
        training_svc = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
        monitoring_svc = ModelMonitoringService(
            monitoring_dir=monitoring_dir,
            registry_service=registry_svc,
            training_service=training_svc,
            analysis_service=analysis_svc,
        )
        pipeline_svc = PipelineService(
            pipelines_dir=pipelines_dir,
            analysis_service=analysis_svc,
            training_service=training_svc,
            tracker_service=tracker_svc,
            registry_service=registry_svc,
            monitoring_service=monitoring_svc,
        )

        app.dependency_overrides[get_pipeline_service] = lambda: pipeline_svc
        app.dependency_overrides[get_model_monitoring_service] = lambda: monitoring_svc
        app.dependency_overrides[get_model_registry_service] = lambda: registry_svc

        yield {
            "upload_dir": upload_dir,
            "experiments_dir": experiments_dir,
            "monitoring_dir": monitoring_dir,
            "pipelines_dir": pipelines_dir,
            "pipeline_svc": pipeline_svc,
            "monitoring_svc": monitoring_svc,
            "registry_svc": registry_svc,
            "training_svc": training_svc,
            "analysis_svc": analysis_svc,
            "admin_headers": {"X-API-Key": "test-admin-key"},
        }

        app.dependency_overrides.clear()
        reset_pipeline_service()


def test_fastapi_lifespan_startup_and_shutdown(lifecycle_env):
    """Test that TestClient enters and exits the FastAPI lifespan cleanly."""
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "healthy"

    # After exit from TestClient context, reset_pipeline_service was invoked
    # and clean shutdown occurred without hanging.


def test_reconcile_orphaned_pipelines_on_startup(lifecycle_env):
    """Simulate prior process death with in-flight pipelines and verify deterministic reconciliation."""
    pipeline_svc = lifecycle_env["pipeline_svc"]
    manifests_dir = lifecycle_env["pipelines_dir"] / "manifests"

    # Create dangling running pipeline
    running_id = "pipe-dangling-running"
    running_manifest = {
        "pipeline_id": running_id,
        "status": "running",
        "current_stage": "training",
        "model_name": "orphan_model",
        "dataset_id": "ds_orphan",
        "target_column": "target",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stages": [
            {"stage": "dataset_validation", "status": "succeeded"},
            {"stage": "training", "status": "running", "started_at": datetime.now(timezone.utc).isoformat()},
            {"stage": "evaluation", "status": "pending"},
        ],
    }
    with open(manifests_dir / f"{running_id}.json", "w", encoding="utf-8") as f:
        json.dump(running_manifest, f)

    # Create dangling pending pipeline
    pending_id = "pipe-dangling-pending"
    pending_manifest = {
        "pipeline_id": pending_id,
        "status": "pending",
        "current_stage": "dataset_validation",
        "model_name": "orphan_pending_model",
        "dataset_id": "ds_orphan",
        "target_column": "target",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "stages": [
            {"stage": "dataset_validation", "status": "pending"},
        ],
    }
    with open(manifests_dir / f"{pending_id}.json", "w", encoding="utf-8") as f:
        json.dump(pending_manifest, f)

    # Execute reconciliation explicitly
    reconciled = pipeline_svc.reconcile_orphaned_pipelines()
    assert running_id in reconciled
    assert pending_id in reconciled
    assert len(reconciled) == 2

    # Verify persisted state is updated to FAILED
    with open(manifests_dir / f"{running_id}.json", "r", encoding="utf-8") as f:
        recovered_running = json.load(f)
    assert recovered_running["status"] == "failed"
    assert "interrupted or restarted" in recovered_running["failure_reason"]
    assert recovered_running["completed_at"] is not None
    # Active stage must also be failed
    assert recovered_running["stages"][1]["status"] == "failed"
    assert "Server process restarted unexpectedly" in recovered_running["stages"][1]["error_details"]

    # Verify idempotency: second reconciliation should find 0 dangling jobs
    second_reconciled = pipeline_svc.reconcile_orphaned_pipelines()
    assert len(second_reconciled) == 0


def test_duplicate_pipeline_job_prevention(lifecycle_env):
    """Verify that launching duplicate pipelines for the same model:dataset returns HTTP 409 Conflict."""
    pipeline_svc = lifecycle_env["pipeline_svc"]
    upload_dir = lifecycle_env["upload_dir"]

    # Create dummy dataset
    dataset_id = "ds_concurrency_test"
    df = pd.DataFrame({
        "feature_a": np.random.randn(50),
        "feature_b": np.random.randn(50),
        "target": np.random.randint(0, 2, 50),
    })
    df.to_csv(upload_dir / f"{dataset_id}.csv", index=False)

    # Simulate an active job in flight
    target_key = "test_classifier:ds_concurrency_test"
    pipeline_svc._active_jobs["pipe-active-001"] = target_key

    req = PipelineCreateRequest(
        model_name="test_classifier",
        dataset_id=dataset_id,
        target_column="target",
        task_type="classification",
    )

    with pytest.raises(HTTPException) as exc_info:
        pipeline_svc.create_pipeline(req)

    assert exc_info.value.status_code == 409
    assert "Concurrent duplicate runs are prohibited" in exc_info.value.detail


def test_cooperative_cancellation_updates_stage_status(lifecycle_env):
    """Verify that cancelling an active pipeline sets stage status to 'cancelled' and persists properly."""
    pipeline_svc = lifecycle_env["pipeline_svc"]
    manifests_dir = lifecycle_env["pipelines_dir"] / "manifests"

    pipeline_id = "pipe-to-cancel"
    now_iso = datetime.now(timezone.utc).isoformat()
    record = PipelineResponse(
        pipeline_id=pipeline_id,
        status=PipelineStatus.PENDING,
        current_stage=PipelineStage.DATASET_VALIDATION,
        model_name="cancel_model",
        dataset_id="ds_test",
        target_column="target",
        stages=[
            StageRecord(stage=PipelineStage.DATASET_VALIDATION, status="pending"),
            StageRecord(stage=PipelineStage.TRAINING, status="pending"),
        ],
        created_at=now_iso,
    )
    pipeline_svc._persist_pipeline(record)
    pipeline_svc._active_jobs[pipeline_id] = "cancel_model:ds_test"

    # Request cancellation
    cancelled = pipeline_svc.cancel_pipeline(pipeline_id)
    assert cancelled.status == PipelineStatus.CANCELLED
    assert pipeline_id not in pipeline_svc._active_jobs

    # Reload from disk to verify persistence
    with open(manifests_dir / f"{pipeline_id}.json", "r", encoding="utf-8") as f:
        reloaded = json.load(f)
    assert reloaded["status"] == "cancelled"
    assert reloaded["completed_at"] is not None


def test_graceful_bounded_shutdown(lifecycle_env):
    """Test that shutdown cancels active and pending jobs and rejects new requests with 503."""
    pipeline_svc = lifecycle_env["pipeline_svc"]

    # Register mock pending and running jobs
    p1 = "pipe-shutdown-pending"
    p2 = "pipe-shutdown-running"
    now_iso = datetime.now(timezone.utc).isoformat()

    rec1 = PipelineResponse(
        pipeline_id=p1,
        status=PipelineStatus.PENDING,
        current_stage=PipelineStage.DATASET_VALIDATION,
        model_name="m1",
        dataset_id="ds1",
        target_column="t",
        stages=[StageRecord(stage=PipelineStage.DATASET_VALIDATION, status="pending")],
        created_at=now_iso,
    )
    rec2 = PipelineResponse(
        pipeline_id=p2,
        status=PipelineStatus.RUNNING,
        current_stage=PipelineStage.TRAINING,
        model_name="m2",
        dataset_id="ds2",
        target_column="t",
        stages=[
            StageRecord(stage=PipelineStage.DATASET_VALIDATION, status="succeeded"),
            StageRecord(stage=PipelineStage.TRAINING, status="running"),
        ],
        created_at=now_iso,
        started_at=now_iso,
    )

    pipeline_svc._persist_pipeline(rec1)
    pipeline_svc._persist_pipeline(rec2)
    pipeline_svc._active_jobs[p1] = "m1:ds1"
    pipeline_svc._active_jobs[p2] = "m2:ds2"

    # Invoke shutdown
    pipeline_svc.shutdown(wait=True, timeout=2.0)

    assert pipeline_svc.is_shutting_down is True
    assert len(pipeline_svc._active_jobs) == 0

    # Verify records on disk are CANCELLED
    r1 = pipeline_svc._load_pipeline_record(p1)
    r2 = pipeline_svc._load_pipeline_record(p2)
    assert r1.status == PipelineStatus.CANCELLED
    assert r2.status == PipelineStatus.CANCELLED

    # Verify new submissions are rejected with 503
    req = PipelineCreateRequest(
        model_name="new_model",
        dataset_id="ds1",
        target_column="t",
    )
    with pytest.raises(HTTPException) as exc_info:
        pipeline_svc.create_pipeline(req)
    assert exc_info.value.status_code == 503
    assert "Server is shutting down" in exc_info.value.detail


def test_monitoring_lock_released_during_training(lifecycle_env):
    """Verify that during long-running retraining, monitoring telemetry and read queries are NOT blocked."""
    monitoring_svc = lifecycle_env["monitoring_svc"]
    registry_svc = lifecycle_env["registry_svc"]
    upload_dir = lifecycle_env["upload_dir"]

    model_name = "test_retrain_model"
    dataset_id = "ds_retrain_test"

    # 1. Prepare dummy dataset
    df = pd.DataFrame({
        "x1": np.random.randn(60),
        "x2": np.random.randn(60),
        "target": np.random.randint(0, 2, 60),
    })
    df.to_csv(upload_dir / f"{dataset_id}.csv", index=False)

    # 2. Register mock production version
    v_dir = registry_svc._safe_resolve_version_dir(model_name, 1)
    v_dir.mkdir(parents=True, exist_ok=True)
    with open(v_dir / "best_model.joblib", "wb") as f:
        f.write(b"mock_joblib_artifact")
    import hashlib
    joblib_sha256 = hashlib.sha256(b"mock_joblib_artifact").hexdigest()

    from app.schemas.tracking import ModelVersionRecord, LifecycleStage
    v_rec = ModelVersionRecord(
        model_name=model_name,
        version=1,
        version_tag="v1",
        model_family="mock_model",
        experiment_id="exp-mock-source",
        model_id="mock_model",
        task_type="classification",
        primary_metric="accuracy",
        score=0.88,
        stage=LifecycleStage.PRODUCTION,
        dataset_id=dataset_id,
        dataset_fingerprint="mock_dataset_fingerprint",
        artifact_filename="best_model.joblib",
        artifact_path=str(v_dir / "best_model.joblib"),
        artifact_sha256=joblib_sha256,
        artifact_size_bytes=len(b"mock_joblib_artifact"),
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    registry_svc._save_version_record(v_rec)

    # Mock source experiment detail
    mock_exp_detail = MagicMock()
    mock_exp_detail.target_column = "target"
    registry_svc.tracker.get_experiment_detail = MagicMock(return_value=mock_exp_detail)

    # 3. Simulate training service that takes 0.5s to execute
    started_training = threading.Event()
    continue_training = threading.Event()

    def slow_train(*args, **kwargs):
        started_training.set()
        continue_training.wait(timeout=2.0)
        # Return mock training response
        mock_eval = MagicMock()
        mock_eval.model_id = "candidate_best"
        mock_eval.metrics = {"accuracy": 0.92}
        resp = MagicMock()
        resp.experiment_id = "exp-retrained-001"
        resp.best_model = "candidate_best"
        resp.primary_metric = "accuracy"
        resp.primary_metric_greater_is_better = True
        resp.models_evaluated = [mock_eval]
        return resp

    monitoring_svc.training_service.train_experiment = slow_train
    monitoring_svc.registry.register_model = MagicMock(return_value=MagicMock(version=2))

    # Trigger retraining in a background thread
    retrain_req = RetrainingJobTriggerRequest(
        model_name=model_name,
        dataset_id=dataset_id,
        trigger_policy=RetrainingTriggerPolicy.MANUAL,
        time_budget_seconds=5,
    )

    thread = threading.Thread(
        target=monitoring_svc.trigger_retraining,
        args=(retrain_req,),
        daemon=True,
    )
    thread.start()

    # Wait until train_experiment is actively running
    assert started_training.wait(timeout=2.0) is True

    # 4. While retraining is executing, verify that monitoring queries do NOT block
    # Record telemetry / create alert
    t0 = time.perf_counter()
    alert = monitoring_svc.create_alert(
        model_name=model_name,
        version=1,
        alert_type="latency_spike",
        severity=AlertSeverity.INFO,
        message="Concurrency test alert",
    )
    t_alert = time.perf_counter() - t0
    assert alert.alert_id is not None
    assert t_alert < 0.2  # Must return immediately, proving lock is NOT held

    # Query alerts
    t0 = time.perf_counter()
    alerts = monitoring_svc.list_alerts(model_name=model_name)
    t_list = time.perf_counter() - t0
    assert len(alerts) >= 1
    assert t_list < 0.2

    # Query retraining jobs: must see the active job in RUNNING state
    jobs = monitoring_svc.list_retraining_jobs(model_name=model_name)
    assert len(jobs) >= 1
    assert jobs[0].status == RetrainingJobStatus.RUNNING

    # Attempt duplicate retraining: MUST be rejected with 409
    with pytest.raises(HTTPException) as exc_info:
        monitoring_svc.trigger_retraining(retrain_req)
    assert exc_info.value.status_code == 409
    assert "already currently" in exc_info.value.detail or "already currently running" in exc_info.value.detail

    # Resume and finish retraining
    continue_training.set()
    thread.join(timeout=3.0)
    assert not thread.is_alive()

    # Verify final retraining job state
    final_jobs = monitoring_svc.list_retraining_jobs(model_name=model_name)
    assert final_jobs[0].status == RetrainingJobStatus.COMPLETED
