"""Targeted security, correctness, and reliability audit tests for AutoNexa Phase 13."""

import hashlib
import json
from pathlib import Path
import re
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib
import hashlib

from app.core.config import Settings
from app.main import app
from app.schemas.tracking import LifecycleStage, StageTransitionRequest
from app.services.automl.model_serving_service import (
    _GLOBAL_MODEL_CACHE,
    ServingMonitoringService,
    get_model_serving_service,
    sanitize_error_detail,
)


@pytest.fixture
def audit_env(tmp_path: Path):
    """Isolated test environment with temporary directory and strict API keys."""
    experiments_dir = tmp_path / "experiments"
    upload_dir = tmp_path / "uploads"
    experiments_dir.mkdir(parents=True, exist_ok=True)
    upload_dir.mkdir(parents=True, exist_ok=True)

    read_key = "audit-read-key-xyz"
    admin_key = "audit-admin-key-abc"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
        SERVING_AUTH_ENABLED=True,
        SERVING_API_KEY_READ=read_key,
        SERVING_API_KEY_ADMIN=admin_key,
        SERVING_ELIGIBLE_STAGES=["production", "staging"],
        SERVING_CACHE_MAX_MODELS=5,
        MAX_PREDICTION_RECORDS=1000,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.prediction_service.get_settings", return_value=test_settings):
        # Clear global model cache before each test
        _GLOBAL_MODEL_CACHE.clear()
        with TestClient(app) as client:
            yield client, experiments_dir, read_key, admin_key


def _create_trained_registered_model(client, experiments_dir: Path, admin_key: str, model_name: str, stage: str = "production"):
    """Helper to register a real Scikit-Learn model pipeline."""
    exp_id = "exp-audit-001"
    exp_dir = experiments_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)

    feature_names = ["feat1", "feat2", "feat3"]
    np.random.seed(42)
    X = np.random.randn(40, 3)
    y = (X[:, 0] > 0).astype(int)

    X_df = pd.DataFrame(X, columns=feature_names)
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(random_state=42)),
    ])
    pipeline.fit(X_df, y)

    model_file = exp_dir / "best_model.joblib"
    joblib.dump(pipeline, model_file)
    model_bytes = model_file.read_bytes()
    model_sha = hashlib.sha256(model_bytes).hexdigest()

    meta = {
        "experiment_id": exp_id,
        "name": "Audit Experiment",
        "status": "completed",
        "created_at": "2026-10-20T12:00:00Z",
        "dataset_id": "audit.csv",
        "dataset_fingerprint": "abc123sha",
        "target_column": "target",
        "task_type": "binary_classification",
        "evaluation_strategy": "holdout",
        "primary_metric": "accuracy",
        "primary_metric_greater_is_better": True,
        "random_state": 42,
        "train_rows": 40,
        "test_rows": 10,
        "features_count": 3,
        "feature_names": feature_names,
        "numeric_features": feature_names,
        "categorical_features": [],
        "best_model": "logistic_regression",
        "best_score": 0.95,
        "artifacts": {
            "model_filename": "best_model.joblib",
            "model_format": "joblib",
            "model_size_bytes": len(model_bytes),
            "model_sha256": model_sha,
        },
    }
    (exp_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")

    # Register model in registry
    reg_res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": exp_id, "model_name": model_name, "initial_stage": stage},
    )
    assert reg_res.status_code in (200, 201), f"Registration failed: {reg_res.text}"
    return reg_res.json()


def test_audit_rbac_privilege_boundary(audit_env):
    """Verify that read key is forbidden from executing administrative operations."""
    client, experiments_dir, read_key, admin_key = audit_env
    _create_trained_registered_model(client, experiments_dir, admin_key, "audit_rbac_model")

    # 1. Read key can query models and predictions
    res = client.get("/api/v1/serving/models", headers={"X-API-Key": read_key})
    assert res.status_code == 200

    # 2. Read key cannot invalidate cache (HTTP 403 Forbidden)
    res_inv = client.post("/api/v1/serving/cache/invalidate", headers={"X-API-Key": read_key})
    assert res_inv.status_code == 403
    assert "Forbidden" in res_inv.json()["detail"]

    # 3. Read key cannot invalidate specific version cache
    res_inv_v = client.post("/api/v1/serving/models/audit_rbac_model/versions/1/cache/invalidate", headers={"X-API-Key": read_key})
    assert res_inv_v.status_code == 403

    # 4. Admin key CAN invalidate cache
    # First warm cache
    client.post(
        "/api/v1/serving/models/audit_rbac_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": [{"feat1": 0.5, "feat2": 1.0, "feat3": -0.5}]},
    )
    res_admin = client.post("/api/v1/serving/cache/invalidate", headers={"X-API-Key": admin_key})
    assert res_admin.status_code == 200
    assert res_admin.json()["evicted"] is True


def test_audit_unauthenticated_requests_denied(audit_env):
    """Verify that protected endpoints reject missing or blank credentials with 401."""
    client, experiments_dir, read_key, admin_key = audit_env

    # Missing header
    res1 = client.get("/api/v1/serving/models")
    assert res1.status_code == 401
    assert "WWW-Authenticate" in res1.headers

    # Blank header
    res2 = client.get("/api/v1/serving/models", headers={"X-API-Key": "   "})
    assert res2.status_code == 401

    # Invalid credential
    res3 = client.get("/api/v1/serving/models", headers={"X-API-Key": "completely-wrong-token"})
    assert res3.status_code == 401


def test_audit_batch_size_limits_and_empty_payload(audit_env):
    """Verify enforcement of 1 <= batch_size <= 1000."""
    client, experiments_dir, read_key, admin_key = audit_env
    _create_trained_registered_model(client, experiments_dir, admin_key, "audit_batch_model")

    # Empty records: rejected by Pydantic min_length=1 with HTTP 422
    res_empty = client.post(
        "/api/v1/serving/models/audit_batch_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": []},
    )
    assert res_empty.status_code == 422

    # Excess records (>1000): rejected with HTTP 422
    huge_records = [{"feat1": 0.5, "feat2": 1.2, "feat3": -0.4}] * 1001
    res_huge = client.post(
        "/api/v1/serving/models/audit_batch_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": huge_records},
    )
    assert res_huge.status_code == 422


def test_audit_strict_schema_rejection(audit_env):
    """Verify rejection of missing columns, rogue columns, and nested JSON."""
    client, experiments_dir, read_key, admin_key = audit_env
    _create_trained_registered_model(client, experiments_dir, admin_key, "audit_schema_model")

    # Missing required column 'feat3'
    res_miss = client.post(
        "/api/v1/serving/models/audit_schema_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": [{"feat1": 1.0, "feat2": 2.0}]},
    )
    assert res_miss.status_code == 400
    assert "missing required feature" in res_miss.json()["detail"].lower()

    # Unexpected rogue column
    res_rogue = client.post(
        "/api/v1/serving/models/audit_schema_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": [{"feat1": 1.0, "feat2": 2.0, "feat3": 3.0, "malicious_injected": "exploit"}]},
    )
    assert res_rogue.status_code == 400
    assert "unexpected feature" in res_rogue.json()["detail"].lower()

    # Nested non-scalar dictionary
    res_nested = client.post(
        "/api/v1/serving/models/audit_schema_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json={"records": [{"feat1": 1.0, "feat2": 2.0, "feat3": {"nested": "dict"}}]},
    )
    assert res_nested.status_code == 400
    assert "nested structure" in res_nested.json()["detail"].lower()


def test_audit_tampered_artifact_cache_eviction(audit_env):
    """Verify that tampering with an artifact binary evicts in-memory cache and returns HTTP 400."""
    client, experiments_dir, read_key, admin_key = audit_env
    _create_trained_registered_model(client, experiments_dir, admin_key, "audit_tamper_model")

    valid_payload = {"records": [{"feat1": 0.5, "feat2": 1.0, "feat3": -0.5}]}

    # 1. Warm cache with valid prediction
    res1 = client.post(
        "/api/v1/serving/models/audit_tamper_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json=valid_payload,
    )
    assert res1.status_code == 200

    # Verify model is in cache
    health1 = client.get(
        "/api/v1/serving/models/audit_tamper_model/versions/1/health",
        headers={"X-API-Key": read_key},
    )
    assert health1.json()["loaded_in_cache"] is True
    assert health1.json()["status"] == "healthy"

    # 2. Adversary tampers with the binary on disk
    artifact_path = experiments_dir / "model_registry" / "audit_tamper_model" / "v1" / "best_model.joblib"
    with open(artifact_path, "ab") as f:
        f.write(b"CORRUPTED_INJECTED_BYTES")

    # 3. Subsequent prediction MUST catch the checksum mismatch and evict cache
    res2 = client.post(
        "/api/v1/serving/models/audit_tamper_model/versions/1/predict",
        headers={"X-API-Key": read_key},
        json=valid_payload,
    )
    assert res2.status_code == 400
    assert "integrity" in res2.json()["detail"].lower()

    # 4. Check that cache was evicted
    health2 = client.get(
        "/api/v1/serving/models/audit_tamper_model/versions/1/health",
        headers={"X-API-Key": read_key},
    )
    assert health2.json()["loaded_in_cache"] is False
    assert health2.json()["status"] == "degraded"


def test_audit_error_sanitization_no_path_leakage():
    """Verify that error sanitization redacts drive paths and directories."""
    win_exc = ValueError(r"Error in C:\Users\Administrator\secrets\model.py line 42: invalid shape")
    cleaned_win = sanitize_error_detail(win_exc)
    assert r"C:\Users" not in cleaned_win
    assert "[PATH_REDACTED]" in cleaned_win

    unix_exc = RuntimeError("File /var/secrets/app/config.json not found")
    cleaned_unix = sanitize_error_detail(unix_exc)
    assert "/var/secrets" not in cleaned_unix
    assert "[PATH_REDACTED]" in cleaned_unix


def test_audit_telemetry_bounded_memory():
    """Verify that telemetry per-model tracking dictionary is bounded to 100 entries."""
    monitor = ServingMonitoringService(max_history=50)

    # Record 150 unique model names
    for i in range(150):
        monitor.record_request(f"dynamic_model_{i}", version=1, latency_ms=1.5, is_success=True)

    # Verify _model_stats does not exceed 100 entries
    assert len(monitor._model_stats) == 100
    # Verify latencies does not exceed max_history=50
    assert len(monitor._latencies) == 50
