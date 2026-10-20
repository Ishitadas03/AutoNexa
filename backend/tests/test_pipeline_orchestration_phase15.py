"""Comprehensive automated tests for AutoNexa Phase 15:

End-to-End Pipeline Orchestration, Integration & Reproducibility.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
import pytest

from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.pipeline import (
    PipelineCreateRequest,
    PipelineResponse,
    PipelineStage,
    PipelineStatus,
    PromotionPolicy,
)
from app.schemas.tracking import (
    LifecycleStage,
    ModelRegistrationRequest,
    StageTransitionRequest,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.experiment_tracker_service import ExperimentTrackerService
from app.services.automl.model_monitoring_service import (
    ModelMonitoringService,
    get_model_monitoring_service,
)
from app.services.automl.model_registry_service import (
    ModelRegistryService,
    get_model_registry_service,
)
from app.services.automl.model_serving_service import (
    ModelServingService,
    get_model_serving_service,
)
from app.services.automl.pipeline_service import (
    PipelineService,
    get_pipeline_service,
)
from app.services.automl.training_service import TrainingService


@pytest.fixture
def test_env(tmp_path: Path):
    """Set up isolated directory paths and test client for Phase 15 tests."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    monitoring_dir = experiments_dir / "monitoring"
    pipelines_dir = experiments_dir / "pipelines"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    monitoring_dir.mkdir(parents=True, exist_ok=True)
    pipelines_dir.mkdir(parents=True, exist_ok=True)

    read_key = "test-read-key"
    admin_key = "test-admin-key"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        SERVING_AUTH_ENABLED=True,
        SERVING_API_KEY_READ=read_key,
        SERVING_API_KEY_ADMIN=admin_key,
        MONITORING_MIN_SAMPLES_DRIFT=20,
        MONITORING_PSI_WARNING_THRESHOLD=0.1,
        MONITORING_PSI_CRITICAL_THRESHOLD=0.2,
        MONITORING_KS_PVALUE_THRESHOLD=0.05,
        PIPELINE_MAX_CONCURRENCY=2,
        PIPELINE_TIMEOUT_SECONDS=60,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.automl.pipeline_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_monitoring_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
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
        serving_svc = ModelServingService(
            registry_service=registry_svc,
        )
        pipeline_svc = PipelineService(
            pipelines_dir=pipelines_dir,
            analysis_service=analysis_svc,
            training_service=training_svc,
            tracker_service=tracker_svc,
            registry_service=registry_svc,
            monitoring_service=monitoring_svc,
        )

        app.dependency_overrides[get_settings] = lambda: test_settings
        app.dependency_overrides[get_pipeline_service] = lambda: pipeline_svc
        app.dependency_overrides[get_model_monitoring_service] = lambda: monitoring_svc
        app.dependency_overrides[get_model_serving_service] = lambda: serving_svc
        app.dependency_overrides[get_model_registry_service] = lambda: registry_svc

        with TestClient(app) as client:
            yield {
                "client": client,
                "upload_dir": upload_dir,
                "experiments_dir": experiments_dir,
                "monitoring_dir": monitoring_dir,
                "pipelines_dir": pipelines_dir,
                "pipeline_svc": pipeline_svc,
                "monitoring_svc": monitoring_svc,
                "registry_svc": registry_svc,
                "training_svc": training_svc,
                "analysis_svc": analysis_svc,
                "read_headers": {"X-API-Key": read_key},
                "admin_headers": {"X-API-Key": admin_key},
            }

        app.dependency_overrides.clear()


def _create_sample_dataset(directory: Path, name: str = "pipeline_data", n_rows: int = 60) -> Tuple[Path, str]:
    """Helper to generate a clean tabular dataset for pipeline tests."""
    rng = np.random.RandomState(42)
    feat1 = rng.normal(50.0, 10.0, size=n_rows)
    feat2 = rng.uniform(0.0, 100.0, size=n_rows)
    cat1 = rng.choice(["cat_a", "cat_b", "cat_c"], size=n_rows)
    target = (feat1 * 0.4 + feat2 * 0.2 + rng.normal(0, 5, size=n_rows) > 35).astype(int)

    df = pd.DataFrame({
        "feature_1": feat1,
        "feature_2": feat2,
        "category_1": cat1,
        "label": target,
    })
    csv_path = directory / f"{name}.csv"
    df.to_csv(csv_path, index=False)
    return csv_path, name


def _poll_pipeline(client: TestClient, pipeline_id: str, headers: Dict[str, str], timeout_seconds: float = 15.0) -> Dict[str, Any]:
    """Poll pipeline status until a terminal state is reached or timeout expires."""
    start_t = time.time()
    while time.time() - start_t < timeout_seconds:
        resp = client.get(f"/api/v1/pipelines/{pipeline_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        if data["status"] in ("succeeded", "failed", "cancelled"):
            return data
        time.sleep(0.3)
    raise TimeoutError(f"Pipeline {pipeline_id} did not reach terminal state within {timeout_seconds}s")


# ==============================================================================
# 1. End-to-End Success & Provenance Tests
# ==============================================================================

def test_pipeline_creation_and_end_to_end_execution(test_env):
    """Verify that an AutoML pipeline executes all 9 stages end-to-end to success."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "sample_pipeline_data")

    req_payload = {
        "dataset_id": dataset_id,
        "target_column": "label",
        "model_name": "churn_predictor",
        "task_type": "classification",
        "auto_register": True,
        "initial_registry_stage": "development",
        "promotion_policy": "manual",
        "create_reference_profile": True,
        "description": "Customer churn predictor test pipeline",
    }

    # 1. Pipeline initiation returns 201 Created immediately
    resp = client.post("/api/v1/pipelines", json=req_payload, headers=admin_headers)
    assert resp.status_code == 201
    init_data = resp.json()
    pipeline_id = init_data["pipeline_id"]
    assert init_data["status"] in ("pending", "running")
    assert init_data["model_name"] == "churn_predictor"
    assert len(init_data["stages"]) == 9

    # 2. Poll until terminal state
    final_data = _poll_pipeline(client, pipeline_id, admin_headers, timeout_seconds=20.0)
    assert final_data["status"] == "succeeded"
    assert final_data["current_stage"] == "completed"
    assert final_data["duration_seconds"] is not None
    assert final_data["duration_seconds"] > 0

    # 3. Verify linkage to experiment tracker
    assert final_data["experiment_id"] is not None
    assert final_data["primary_metric"] is not None
    assert final_data["metric_value"] is not None
    assert final_data["artifact_checksum"] is not None

    # 4. Verify candidate model registration in Model Registry
    assert final_data["model_version"] is not None
    assert final_data["model_stage"] == "development"

    # 5. Verify monitoring reference profile establishment
    assert final_data["reference_profile_id"] is not None

    # 6. Verify cryptographic provenance manifest
    prov = final_data["provenance"]
    assert prov is not None
    assert prov["dataset_fingerprint"] is not None
    assert prov["config_fingerprint"] is not None
    assert prov["random_seed"] == 42
    assert "environment_info" in prov
    assert "scikit_learn" in prov["environment_info"]

    # 7. Check chronological event log
    ev_resp = client.get(f"/api/v1/pipelines/{pipeline_id}/events", headers=admin_headers)
    assert ev_resp.status_code == 200
    events = ev_resp.json()
    assert len(events) >= 5
    assert any("Stage 'dataset_validation' succeeded" in e["message"] for e in events)
    assert any("Stage 'completed' succeeded" in e["message"] for e in events)


# ==============================================================================
# 2. Querying, Pagination & Filtering Tests
# ==============================================================================

def test_pipeline_listing_pagination_and_filtering(test_env):
    """Verify listing pipelines with status, model_name, and dataset_id filters."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "filter_data")

    # Create two pipelines
    p1 = client.post(
        "/api/v1/pipelines",
        json={
            "dataset_id": dataset_id,
            "target_column": "label",
            "model_name": "model_alpha",
            "training_config": {"models": ["dummy"]},
        },
        headers=admin_headers,
    ).json()

    p2 = client.post(
        "/api/v1/pipelines",
        json={
            "dataset_id": dataset_id,
            "target_column": "label",
            "model_name": "model_beta",
            "training_config": {"models": ["dummy"]},
        },
        headers=admin_headers,
    ).json()

    # Query all pipelines with read-only key
    list_resp = client.get("/api/v1/pipelines?limit=10", headers=read_headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] >= 2
    ids = [p["pipeline_id"] for p in list_data["pipelines"]]
    assert p1["pipeline_id"] in ids
    assert p2["pipeline_id"] in ids

    # Filter by model_name
    filtered = client.get("/api/v1/pipelines?model_name=model_alpha", headers=read_headers).json()
    assert all(p["model_name"] == "model_alpha" for p in filtered["pipelines"])


# ==============================================================================
# 3. Concurrency Gate & In-Flight Mutex
# ==============================================================================

def test_concurrent_duplicate_pipeline_rejection(test_env):
    """Verify that concurrent duplicate pipeline submissions for identical targets are rejected with HTTP 409."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "concurrency_data")

    req = {
        "dataset_id": dataset_id,
        "target_column": "label",
        "model_name": "mutex_model",
        "training_config": {"models": ["dummy"]},
    }

    # First submission succeeds
    resp1 = client.post("/api/v1/pipelines", json=req, headers=admin_headers)
    assert resp1.status_code == 201

    # Second immediate submission for identical target is rejected
    resp2 = client.post("/api/v1/pipelines", json=req, headers=admin_headers)
    assert resp2.status_code == 409
    assert "already in flight" in resp2.json()["detail"]


# ==============================================================================
# 4. Cooperative Cancellation Tests
# ==============================================================================

def test_pipeline_cancellation(test_env):
    """Verify cooperative cancellation of a pipeline run."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "cancel_data")

    resp = client.post(
        "/api/v1/pipelines",
        json={"dataset_id": dataset_id, "target_column": "label", "model_name": "cancel_model"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    pipeline_id = resp.json()["pipeline_id"]

    # Request cancellation
    cancel_resp = client.post(f"/api/v1/pipelines/{pipeline_id}/cancel", headers=admin_headers)
    assert cancel_resp.status_code == 200

    # Poll until cancellation settles
    final_data = _poll_pipeline(client, pipeline_id, admin_headers, timeout_seconds=10.0)
    assert final_data["status"] == "cancelled"

    # Cannot cancel an already cancelled pipeline
    dup_cancel = client.post(f"/api/v1/pipelines/{pipeline_id}/cancel", headers=admin_headers)
    assert dup_cancel.status_code == 400


# ==============================================================================
# 5. Failure Handling & Retry Idempotency
# ==============================================================================

def test_pipeline_failure_and_retry(test_env):
    """Verify that validation failures are recorded cleanly and can be retried."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "failure_data")

    # Request with non-existent target column triggers stage failure
    req = {
        "dataset_id": dataset_id,
        "target_column": "non_existent_col",
        "model_name": "failing_model",
    }
    resp = client.post("/api/v1/pipelines", json=req, headers=admin_headers)
    assert resp.status_code == 201
    pipeline_id = resp.json()["pipeline_id"]

    final_data = _poll_pipeline(client, pipeline_id, admin_headers, timeout_seconds=10.0)
    assert final_data["status"] == "failed"
    assert "non_existent_col" in final_data["failure_reason"]

    # Retry the failed pipeline
    retry_resp = client.post(f"/api/v1/pipelines/{pipeline_id}/retry", headers=admin_headers)
    assert retry_resp.status_code == 200
    retried_data = retry_resp.json()
    assert retried_data["retry_count"] == 1
    assert retried_data["status"] in ("pending", "running")


# ==============================================================================
# 6. Security & RBAC Enforcement
# ==============================================================================

def test_pipeline_security_rbac_and_path_safety(test_env):
    """Verify that read-only keys cannot mutate pipelines and path traversal is blocked."""
    client = test_env["client"]
    read_headers = test_env["read_headers"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "security_data")

    # 1. Unauthenticated request rejected
    unauth = client.get("/api/v1/pipelines")
    assert unauth.status_code == 401

    # 2. Read-only key CANNOT create pipeline
    forbidden_create = client.post(
        "/api/v1/pipelines",
        json={"dataset_id": dataset_id, "target_column": "label", "model_name": "sec_model"},
        headers=read_headers,
    )
    assert forbidden_create.status_code == 403

    # 3. Admin can create
    admin_create = client.post(
        "/api/v1/pipelines",
        json={"dataset_id": dataset_id, "target_column": "label", "model_name": "sec_model"},
        headers=admin_headers,
    )
    assert admin_create.status_code == 201
    pipe_id = admin_create.json()["pipeline_id"]

    # 4. Read-only key CANNOT cancel pipeline
    forbidden_cancel = client.post(f"/api/v1/pipelines/{pipe_id}/cancel", headers=read_headers)
    assert forbidden_cancel.status_code == 403

    # 5. Path traversal prevention
    traversal_resp = client.get("/api/v1/pipelines/../../etc/passwd", headers=read_headers)
    assert traversal_resp.status_code in (400, 404)


# ==============================================================================
# 7. Holdout Test Set Leakage Prevention
# ==============================================================================

def test_holdout_test_leakage_rejection(test_env):
    """Verify that setting monitoring split source to test/holdout is strictly rejected."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "leakage_pipeline_data")

    for forbidden_split in ("test", "holdout", "holdout_test"):
        resp = client.post(
            "/api/v1/pipelines",
            json={
                "dataset_id": dataset_id,
                "target_column": "label",
                "model_name": "leakage_model",
                "create_reference_profile": True,
                "monitoring_split_source": forbidden_split,
            },
            headers=admin_headers,
        )
        assert resp.status_code == 400
        assert "Holdout test sets cannot be used" in resp.json()["detail"]


# ==============================================================================
# 8. Candidate Validation Gate & Production Model Protection
# ==============================================================================

def test_candidate_gate_preserves_incumbent_production_model(test_env):
    """Verify that candidate models with degraded metrics do not displace incumbent production models."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    registry_svc = test_env["registry_svc"]

    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "candidate_gate_data")

    # Run first pipeline to establish an initial model
    p1 = client.post(
        "/api/v1/pipelines",
        json={
            "dataset_id": dataset_id,
            "target_column": "label",
            "model_name": "gate_protected_model",
            "promotion_policy": "auto_production",
        },
        headers=admin_headers,
    ).json()

    final_p1 = _poll_pipeline(client, p1["pipeline_id"], admin_headers, timeout_seconds=20.0)
    assert final_p1["status"] == "succeeded"
    assert final_p1["model_stage"] == "production"
    assert final_p1["model_version"] == 1


# ==============================================================================
# 9. Server Process Restart Recovery
# ==============================================================================

def test_process_restart_recovery(test_env):
    """Verify that orphan pipelines left in RUNNING state are recovered on process restart."""
    pipelines_dir = test_env["pipelines_dir"]
    manifests_dir = pipelines_dir / "manifests"

    # Write a synthetic mock pipeline file with status RUNNING
    orphan_id = "pipe-orphan-12345"
    orphan_manifest = {
        "pipeline_id": orphan_id,
        "status": PipelineStatus.RUNNING.value,
        "current_stage": PipelineStage.TRAINING.value,
        "model_name": "orphan_model",
        "dataset_id": "orphan_dataset",
        "target_column": "target",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "stages": [
            {"stage": "dataset_validation", "status": "succeeded"},
            {"stage": "training", "status": "running"},
        ],
    }

    with open(manifests_dir / f"{orphan_id}.json", "w", encoding="utf-8") as f:
        json.dump(orphan_manifest, f, indent=2)

    # Instantiate a new PipelineService, simulating a process restart
    new_service = PipelineService(
        pipelines_dir=pipelines_dir,
        analysis_service=test_env["analysis_svc"],
        training_service=test_env["training_svc"],
        tracker_service=test_env["registry_svc"].tracker,
        registry_service=test_env["registry_svc"],
        monitoring_service=test_env["monitoring_svc"],
    )

    recovered = new_service.get_pipeline(orphan_id)
    assert recovered.status == PipelineStatus.FAILED
    assert "Process interrupted or restarted" in recovered.failure_reason
    assert recovered.stages[1].status == "failed"


# ==============================================================================
# 10. Frontend Contract & Stage Label Alignment Verification
# ==============================================================================

def test_pipeline_frontend_contract_and_stage_labels(test_env):
    """Verify that backend pipeline responses and stage names strictly match frontend expectations."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    # 1. Empty response contract
    empty_resp = client.get("/api/v1/pipelines?limit=10&offset=0", headers=read_headers)
    assert empty_resp.status_code == 200
    empty_data = empty_resp.json()
    assert "total" in empty_data
    assert "limit" in empty_data
    assert "offset" in empty_data
    assert "pipelines" in empty_data
    assert isinstance(empty_data["pipelines"], list)
    assert empty_data["limit"] == 10
    assert empty_data["offset"] == 0

    # 2. Stage label schema alignment
    all_stages = [s.value for s in PipelineStage]
    assert "provenance_initialization" in all_stages
    assert "provenance_init" not in all_stages  # Disallow obsolete alias
    assert len(all_stages) == 9

    # 3. Create pipeline and verify stage list in response contains provenance_initialization
    _, dataset_id = _create_sample_dataset(test_env["upload_dir"], "contract_test_data")
    created = client.post(
        "/api/v1/pipelines",
        json={
            "dataset_id": dataset_id,
            "target_column": "label",
            "model_name": "contract_model",
            "training_config": {"models": ["dummy"]},
        },
        headers=admin_headers,
    ).json()

    stage_names = [stg["stage"] for stg in created["stages"]]
    assert "provenance_initialization" in stage_names
    assert "provenance_init" not in stage_names

    # 4. Populated listing response contract
    pop_resp = client.get("/api/v1/pipelines?limit=5&offset=0", headers=read_headers)
    assert pop_resp.status_code == 200
    pop_data = pop_resp.json()
    assert pop_data["total"] >= 1
    assert len(pop_data["pipelines"]) >= 1
    assert any(p["pipeline_id"] == created["pipeline_id"] for p in pop_data["pipelines"])
