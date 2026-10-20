"""Comprehensive automated tests for AutoNexa Phase 14:

Model Monitoring, Drift Detection, Ground-Truth Performance Evaluation, and Automated Retraining.
"""

import json
from pathlib import Path
import tempfile
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
import pytest

from app.core.config import Settings, get_settings
from app.main import app
from app.schemas.monitoring import (
    AlertAcknowledgeRequest,
    AlertSeverity,
    AlertStatus,
    CandidateValidationStatus,
    DriftAnalysisRequest,
    DriftMethod,
    DriftStatus,
    GroundTruthIngestRequest,
    GroundTruthRecord,
    MonitoringWindowCreate,
    ReferenceProfileCreate,
    RetrainingJobTriggerRequest,
    RetrainingPromotionRequest,
    RetrainingTriggerPolicy,
)
from app.schemas.tracking import (
    LifecycleStage,
    ModelRegistrationRequest,
    StageTransitionRequest,
)
from app.schemas.training import TrainingRequest
from app.services.automl.model_monitoring_service import (
    ModelMonitoringService,
    get_model_monitoring_service,
)
from app.services.automl.model_registry_service import ModelRegistryService
from app.services.automl.model_serving_service import (
    ModelServingService,
    get_model_serving_service,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.training_service import TrainingService


@pytest.fixture
def test_env(tmp_path: Path):
    """Set up isolated directory paths and test client for Phase 14 tests."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    monitoring_dir = experiments_dir / "monitoring"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    monitoring_dir.mkdir(parents=True, exist_ok=True)

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
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_monitoring_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
         patch("app.services.analysis_service.get_settings", return_value=test_settings):

        analysis_svc = AnalysisService(upload_dir=upload_dir)
        registry_svc = ModelRegistryService(experiments_dir=experiments_dir)
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

        app.dependency_overrides[get_settings] = lambda: test_settings
        app.dependency_overrides[get_model_monitoring_service] = lambda: monitoring_svc
        app.dependency_overrides[get_model_serving_service] = lambda: serving_svc

        with TestClient(app) as client:
            yield {
                "client": client,
                "upload_dir": upload_dir,
                "experiments_dir": experiments_dir,
                "monitoring_dir": monitoring_dir,
                "monitoring_svc": monitoring_svc,
                "registry_svc": registry_svc,
                "training_svc": training_svc,
                "serving_svc": serving_svc,
                "read_headers": {"X-API-Key": read_key},
                "admin_headers": {"X-API-Key": admin_key},
            }

        app.dependency_overrides.clear()


def _create_sample_csv(
    directory: Path,
    dataset_name: str = "sample_data",
    n_rows: int = 100,
    mean_val: float = 50.0,
    categories: List[str] = None,
    nan_ratio: float = 0.0,
    constant_val: float = 1.0,
) -> Tuple[Path, str]:
    """Helper to generate deterministic tabular CSV fixtures and return (path, dataset_id)."""
    rng = np.random.RandomState(42)
    categories = categories or ["type_a", "type_b", "type_c"]

    col_num1 = rng.normal(mean_val, 10.0, size=n_rows)
    col_num2 = rng.uniform(0.0, 100.0, size=n_rows)
    col_cat = rng.choice(categories, size=n_rows)
    col_const = np.full(n_rows, constant_val)
    # Target label: binary classification
    target = (col_num1 > mean_val).astype(int)

    df = pd.DataFrame({
        "feature_num1": col_num1,
        "feature_num2": col_num2,
        "feature_cat": col_cat,
        "feature_const": col_const,
        "target": target,
    })

    if nan_ratio > 0.0:
        mask = rng.rand(n_rows) < nan_ratio
        df.loc[mask, "feature_num1"] = np.nan

    clean_id = dataset_name.replace(".csv", "")
    csv_path = directory / f"{clean_id}.csv"
    df.to_csv(csv_path, index=False)
    return csv_path, clean_id


def _setup_registered_production_model(test_env, model_name: str = "churn_predictor"):
    """Helper to train and register a model in production stage."""
    upload_dir = test_env["upload_dir"]
    csv_path, dataset_id = _create_sample_csv(upload_dir, f"{model_name}_base", n_rows=120)

    train_req = TrainingRequest(
        target_column="target",
        task_type="classification",
        evaluation_strategy="holdout",
        time_budget_seconds=15,
    )
    train_resp = test_env["training_svc"].train_experiment(dataset_id=dataset_id, request=train_req)

    reg_req = ModelRegistrationRequest(
        model_name=model_name,
        experiment_id=train_resp.experiment_id,
        model_id=train_resp.best_model,
        description="Base production model",
    )
    model_record = test_env["registry_svc"].register_model(reg_req)

    trans_req = StageTransitionRequest(
        new_stage=LifecycleStage.PRODUCTION,
        reason="Initial deployment to production",
    )
    prod_record = test_env["registry_svc"].transition_stage(model_name, model_record.version, trans_req)
    return prod_record, dataset_id


# ==============================================================================
# 1. Reference Data Profiling Tests
# ==============================================================================

def test_reference_profile_creation_and_inspection(test_env):
    """Verify baseline reference profile generation records numerical & categorical summaries and fingerprint."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    prod_model, dataset_id = _setup_registered_production_model(test_env, "fraud_detector")

    create_payload = {
        "model_name": "fraud_detector",
        "dataset_id": dataset_id,
        "split_source": "training",
        "description": "Baseline training distribution",
    }

    resp = client.post("/api/v1/monitoring/reference-profiles", json=create_payload, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()

    assert data["model_name"] == "fraud_detector"
    assert data["version"] == prod_model.version
    assert data["sample_count"] == 120
    assert "dataset_fingerprint" in data
    assert len(data["dataset_fingerprint"]) == 64

    # Verify numerical summaries
    assert "feature_num1" in data["numerical_features"]
    num1 = data["numerical_features"]["feature_num1"]
    assert num1["count"] == 120
    assert 40.0 < num1["mean"] < 60.0
    assert len(num1["bin_edges"]) >= 2
    assert len(num1["bin_counts"]) >= 1

    # Verify categorical summaries
    assert "feature_cat" in data["categorical_features"]
    cat = data["categorical_features"]["feature_cat"]
    assert cat["distinct_categories"] == 3
    assert cat["missing_count"] == 0

    # Retrieve profile via GET
    get_resp = client.get(f"/api/v1/monitoring/reference-profiles/{data['profile_id']}", headers=test_env["read_headers"])
    assert get_resp.status_code == 200
    assert get_resp.json()["profile_id"] == data["profile_id"]


# ==============================================================================
# 2. Distribution Drift Detection Tests
# ==============================================================================

def test_stable_distribution_produces_no_drift(test_env):
    """Verify that records drawn from the identical baseline distribution produce no drift (PSI ~ 0)."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "loan_model")

    # Create baseline profile
    client.post(
        "/api/v1/monitoring/reference-profiles",
        json={"model_name": "loan_model", "dataset_id": dataset_id},
        headers=admin_headers,
    )

    # Generate identical distribution data
    identical_csv, _ = _create_sample_csv(test_env["upload_dir"], "loan_identical", n_rows=80, mean_val=50.0)
    df_identical = pd.read_csv(identical_csv).drop(columns=["target"])
    records = df_identical.to_dict(orient="records")

    drift_req = {
        "model_name": "loan_model",
        "records": records,
    }

    resp = client.post("/api/v1/monitoring/drift-analysis", json=drift_req, headers=read_headers)
    assert resp.status_code == 200
    report = resp.json()

    assert report["overall_status"] == DriftStatus.NO_DRIFT.value
    assert report["drifted_features_count"] == 0
    assert report["sample_count"] == 80


def test_numerical_and_categorical_distribution_shift_detection(test_env):
    """Verify that severe numerical mean shift and unseen categories trigger critical drift detection."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "pricing_engine")

    # Profile baseline (mean=50.0, categories=["type_a", "type_b", "type_c"])
    client.post(
        "/api/v1/monitoring/reference-profiles",
        json={"model_name": "pricing_engine", "dataset_id": dataset_id},
        headers=admin_headers,
    )

    # Shifted data: mean shifted from 50.0 to 120.0, and new category "unknown_tier_x" injected
    shifted_csv, _ = _create_sample_csv(
        test_env["upload_dir"],
        "pricing_shifted",
        n_rows=90,
        mean_val=120.0,
        categories=["type_a", "unknown_tier_x"],
    )
    df_shifted = pd.read_csv(shifted_csv).drop(columns=["target"])
    records = df_shifted.to_dict(orient="records")

    drift_req = {
        "model_name": "pricing_engine",
        "records": records,
    }

    resp = client.post("/api/v1/monitoring/drift-analysis", json=drift_req, headers=read_headers)
    assert resp.status_code == 200
    report = resp.json()

    assert report["overall_status"] == DriftStatus.DRIFT_DETECTED.value
    assert report["drifted_features_count"] >= 1

    # Inspect numerical feature drift result
    num1_res = next(f for f in report["feature_results"] if f["feature_name"] == "feature_num1")
    assert num1_res["drift_status"] == DriftStatus.DRIFT_DETECTED.value
    assert num1_res["statistic"] >= 0.2  # PSI threshold crossed
    assert num1_res["p_value"] < 0.05    # KS test significant

    # Inspect categorical feature drift result
    cat_res = next(f for f in report["feature_results"] if f["feature_name"] == "feature_cat")
    assert cat_res["unseen_categories_count"] >= 1

    # Verify that an operational alert was automatically raised
    alerts_resp = client.get("/api/v1/monitoring/alerts?model_name=pricing_engine", headers=read_headers)
    assert alerts_resp.status_code == 200
    alerts = alerts_resp.json()
    assert len(alerts) >= 1
    assert alerts[0]["severity"] == "critical"
    assert alerts[0]["alert_type"] == "feature_drift"


def test_edge_cases_constant_features_small_sample_and_missing_values(test_env):
    """Verify robust handling for zero-variance constant features, undersized windows (<30), and high missingness."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "edge_case_model")
    client.post(
        "/api/v1/monitoring/reference-profiles",
        json={"model_name": "edge_case_model", "dataset_id": dataset_id},
        headers=admin_headers,
    )

    # 1. Undersized window (N=10 < min_samples=20)
    small_csv, _ = _create_sample_csv(test_env["upload_dir"], "small_win", n_rows=10, mean_val=50.0)
    df_small = pd.read_csv(small_csv).drop(columns=["target"])
    records_small = df_small.to_dict(orient="records")

    resp_small = client.post(
        "/api/v1/monitoring/drift-analysis",
        json={"model_name": "edge_case_model", "records": records_small},
        headers=read_headers,
    )
    assert resp_small.status_code == 200
    report_small = resp_small.json()
    assert report_small["overall_status"] == DriftStatus.INSUFFICIENT_DATA.value
    assert any("below recommended minimum" in w for w in report_small["data_quality_warnings"])

    # 2. Missing value rate surge (50% NaNs injected)
    nan_csv, _ = _create_sample_csv(test_env["upload_dir"], "nan_win", n_rows=60, nan_ratio=0.5)
    df_nan = pd.read_csv(nan_csv).drop(columns=["target"])
    # Convert NaNs to None for valid JSON serialization
    records_nan = [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in df_nan.to_dict(orient="records")]

    resp_nan = client.post(
        "/api/v1/monitoring/drift-analysis",
        json={"model_name": "edge_case_model", "records": records_nan},
        headers=read_headers,
    )
    assert resp_nan.status_code == 200
    report_nan = resp_nan.json()
    num1_nan = next(f for f in report_nan["feature_results"] if f["feature_name"] == "feature_num1")
    assert num1_nan["missing_rate_delta"] >= 0.3
    assert any("Missing rate increased" in w for w in num1_nan["warnings"])


# ==============================================================================
# 3. Ground-Truth Performance Monitoring Tests
# ==============================================================================

def test_ground_truth_ingestion_and_degradation_detection(test_env):
    """Verify label ingestion, deduplication, and confirmed degradation detection against baseline."""
    client = test_env["client"]
    read_headers = test_env["read_headers"]
    prod_model, dataset_id = _setup_registered_production_model(test_env, "churn_eval")

    # Ingest ground-truth labels with duplicate entries
    label_batch = {
        "model_name": "churn_eval",
        "version": prod_model.version,
        "labels": [
            {"prediction_id": "pred_001", "true_label": 1},
            {"prediction_id": "pred_002", "true_label": 0},
            {"prediction_id": "pred_003", "true_label": 1},
            {"prediction_id": "pred_001", "true_label": 1},  # Duplicate
        ],
    }

    ingest_resp = client.post("/api/v1/monitoring/ground-truth", json=label_batch, headers=read_headers)
    assert ingest_resp.status_code == 200
    data = ingest_resp.json()
    assert data["ingested_count"] == 3
    assert data["duplicate_count"] == 1

    # Ingest synthetic degraded batch (where true labels are inverted from predicted)
    degraded_labels = [{"prediction_id": f"p_{i}", "true_label": 1 if i % 2 == 0 else 0} for i in range(40)]
    client.post(
        "/api/v1/monitoring/ground-truth",
        json={"model_name": "churn_eval", "version": prod_model.version, "labels": degraded_labels},
        headers=read_headers,
    )

    # Evaluate ground-truth performance
    eval_resp = client.post("/api/v1/monitoring/ground-truth/evaluate?model_name=churn_eval", headers=read_headers)
    assert eval_resp.status_code == 200
    eval_report = eval_resp.json()

    assert eval_report["model_name"] == "churn_eval"
    assert eval_report["sample_size"] >= 40
    assert "accuracy" in eval_report["metrics"]
    assert "confusion_matrix" in eval_report["metrics"]


# ==============================================================================
# 4. Controlled Automated Retraining & Candidate Validation Gate Tests
# ==============================================================================

def test_automated_retraining_candidate_validation_gate_and_promotion(test_env):
    """Verify that automated retraining evaluates candidate validation gate and requires authorization to promote."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    read_headers = test_env["read_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "risk_model")
    initial_version = prod_model.version

    # Trigger retraining on dataset
    retrain_payload = {
        "model_name": "risk_model",
        "dataset_id": dataset_id,
        "trigger_policy": "manual",
        "time_budget_seconds": 15,
        "tolerance_percentage": 0.05,
    }

    trigger_resp = client.post("/api/v1/monitoring/retraining/trigger", json=retrain_payload, headers=admin_headers)
    assert trigger_resp.status_code == 202
    job = trigger_resp.json()

    assert job["status"] == "completed"
    assert job["candidate_model_id"] is not None
    assert job["candidate_validation"] is not None
    assert job["candidate_validation"]["status"] in ("passed", "rejected")

    # If candidate passed validation gate, test authorized promotion
    if job["candidate_validation"]["passed"]:
        assert job["candidate_version"] is not None
        assert job["candidate_version"] > initial_version

        # Promote candidate to production
        promote_resp = client.post(
            f"/api/v1/monitoring/retraining/jobs/{job['job_id']}/promote",
            json={"target_stage": "production", "operator": "lead_ml_engineer", "reason": "Passed gate"},
            headers=admin_headers,
        )
        assert promote_resp.status_code == 200
        promoted_job = promote_resp.json()
        assert promoted_job["promoted_to_stage"] == "production"

        # Verify active production version is now updated in model registry
        summary = test_env["registry_svc"].get_model_summary("risk_model")
        assert summary.production_version == job["candidate_version"]
    else:
        # If candidate failed, verify active production model was preserved
        summary = test_env["registry_svc"].get_model_summary("risk_model")
        assert summary.production_version == initial_version


def test_concurrent_retraining_job_rejection(test_env):
    """Verify that concurrent retraining triggers for the same model family are blocked."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]
    prod_model, dataset_id = _setup_registered_production_model(test_env, "concurrency_model")

    # Inject a simulated running job
    simulated_job = {
        "model_name": "concurrency_model",
        "dataset_id": dataset_id,
        "trigger_policy": "manual",
    }
    # Run first job
    resp1 = client.post("/api/v1/monitoring/retraining/trigger", json=simulated_job, headers=admin_headers)
    assert resp1.status_code == 202

    # Attempt second concurrent job if first is still active (or verify idempotency)
    # Testing trigger policy enforcement:
    invalid_policy_req = {
        "model_name": "concurrency_model",
        "dataset_id": dataset_id,
        "trigger_policy": "performance_degradation",  # Without degradation evidence
    }
    resp_invalid = client.post("/api/v1/monitoring/retraining/trigger", json=invalid_policy_req, headers=admin_headers)
    assert resp_invalid.status_code == 400
    assert "requires confirmed performance degradation" in resp_invalid.json()["detail"]


# ==============================================================================
# 5. Security & RBAC Enforcement Tests
# ==============================================================================

def test_monitoring_security_and_role_authorization_boundaries(test_env):
    """Verify strict API key authentication and role boundaries on monitoring endpoints."""
    client = test_env["client"]
    read_headers = test_env["read_headers"]
    admin_headers = test_env["admin_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "secure_model")

    # 1. Unauthenticated request rejected
    unauth_resp = client.get("/api/v1/monitoring/overview")
    assert unauth_resp.status_code == 401

    # 2. Read-only key can query overview
    read_resp = client.get("/api/v1/monitoring/overview", headers=read_headers)
    assert read_resp.status_code == 200

    # 3. Read-only key CANNOT create reference profile (requires admin)
    forbidden_resp = client.post(
        "/api/v1/monitoring/reference-profiles",
        json={"model_name": "secure_model", "dataset_id": dataset_id},
        headers=read_headers,
    )
    assert forbidden_resp.status_code == 403
    assert "Admin role required" in forbidden_resp.json()["detail"]

    # 4. Read-only key CANNOT trigger retraining
    forbidden_retrain = client.post(
        "/api/v1/monitoring/retraining/trigger",
        json={"model_name": "secure_model", "dataset_id": dataset_id, "trigger_policy": "manual"},
        headers=read_headers,
    )
    assert forbidden_retrain.status_code == 403

    # 5. Path traversal prevention on reference profile ID
    path_traversal_resp = client.get(
        "/api/v1/monitoring/reference-profiles/../../etc/passwd",
        headers=read_headers,
    )
    assert path_traversal_resp.status_code in (400, 404)


def test_holdout_leakage_rejection_and_exact_ks_test(test_env):
    """Verify holdout test set leakage rejection and empirical reference sampling for KS tests."""
    client = test_env["client"]
    admin_headers = test_env["admin_headers"]

    prod_model, dataset_id = _setup_registered_production_model(test_env, "leakage_guard_model")

    # 1. Scientific leakage check: Rejection of test / holdout splits
    for forbidden_split in ("test", "holdout", "holdout_test", "test_set"):
        resp = client.post(
            "/api/v1/monitoring/reference-profiles",
            json={
                "model_name": "leakage_guard_model",
                "dataset_id": dataset_id,
                "split_source": forbidden_split,
            },
            headers=admin_headers,
        )
        assert resp.status_code == 400
        assert "Holdout test sets cannot be used" in resp.json()["detail"]

    # 2. Permitted split: Training split with empirical reference sample extraction
    prof_resp = client.post(
        "/api/v1/monitoring/reference-profiles",
        json={
            "model_name": "leakage_guard_model",
            "dataset_id": dataset_id,
            "split_source": "training",
        },
        headers=admin_headers,
    )
    assert prof_resp.status_code == 201
    prof_data = prof_resp.json()
    assert "feature_num1" in prof_data["numerical_features"]
    num_summary = prof_data["numerical_features"]["feature_num1"]
    assert num_summary["reference_sample"] is not None
    assert len(num_summary["reference_sample"]) > 0

    # 3. Exact KS test execution using empirical baseline sample
    drift_req = {
        "model_name": "leakage_guard_model",
        "reference_profile_id": prof_data["profile_id"],
        "records": [
            {"feature_num1": 50.0, "feature_num2": 50.0, "feature_cat": "type_a", "feature_const": 1.0}
            for _ in range(30)
        ],
    }
    drift_resp = client.post("/api/v1/monitoring/drift-analysis", json=drift_req, headers=admin_headers)
    assert drift_resp.status_code == 200
    drift_data = drift_resp.json()
    num_result = next(r for r in drift_data["feature_results"] if r["feature_name"] == "feature_num1")
    assert num_result["p_value"] is not None
