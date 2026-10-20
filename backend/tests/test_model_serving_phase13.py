"""Comprehensive automated tests for AutoNexa Phase 13: Secure Model Serving & Deployment."""

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
import joblib

from app.core.config import Settings
from app.main import app
from app.schemas.tracking import LifecycleStage


@pytest.fixture
def serving_env(tmp_path: Path):
    """Isolated test environment with temporary directories and configured API keys."""
    experiments_dir = tmp_path / "experiments"
    upload_dir = tmp_path / "uploads"
    experiments_dir.mkdir(parents=True, exist_ok=True)
    upload_dir.mkdir(parents=True, exist_ok=True)

    read_key = "test-read-key-12345"
    admin_key = "test-admin-key-67890"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
        SERVING_AUTH_ENABLED=True,
        SERVING_API_KEY_READ=read_key,
        SERVING_API_KEY_ADMIN=admin_key,
        SERVING_ELIGIBLE_STAGES=["production", "staging"],
        SERVING_CACHE_MAX_MODELS=5,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.prediction_service.get_settings", return_value=test_settings):
        with TestClient(app) as client:
            yield client, experiments_dir, read_key, admin_key


def create_real_trained_experiment(
    experiments_dir: Path,
    exp_id: str,
    task_type: str = "classification",
    best_model: str = "logistic_regression",
) -> Path:
    """Helper to train a genuine scikit-learn pipeline and persist valid experiment artifacts."""
    exp_dir = experiments_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)

    feature_names = ["feature_a", "feature_b", "feature_c"]

    # Generate synthetic training data
    np.random.seed(42)
    X = np.random.randn(50, 3)
    X_df = pd.DataFrame(X, columns=feature_names)

    if task_type == "classification":
        y = (X[:, 0] + X[:, 1] > 0).astype(int)
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(random_state=42)),
        ])
        pipeline.fit(X_df, y)
        primary_metric = "accuracy"
        best_score = 0.92
    else:
        y = X[:, 0] * 2.5 + X[:, 1] - X[:, 2] * 0.5
        pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("reg", Ridge(random_state=42)),
        ])
        pipeline.fit(X_df, y)
        primary_metric = "rmse"
        best_score = 0.15

    # Serialize genuine model pipeline
    model_file = exp_dir / "best_model.joblib"
    joblib.dump(pipeline, model_file)
    model_bytes = model_file.read_bytes()
    model_sha256 = hashlib.sha256(model_bytes).hexdigest()
    model_size = len(model_bytes)

    meta = {
        "experiment_id": exp_id,
        "name": f"Trained Run {exp_id}",
        "status": "completed",
        "created_at": "2026-10-20T12:00:00Z",
        "dataset_id": "dataset-synthetic",
        "dataset_fingerprint": "abc12345" * 8,
        "target_column": "target",
        "task_type": "binary_classification" if task_type == "classification" else "regression",
        "evaluation_strategy": "holdout",
        "primary_metric": primary_metric,
        "primary_metric_greater_is_better": task_type == "classification",
        "best_model": best_model,
        "best_score": best_score,
        "feature_names": feature_names,
        "numeric_features": feature_names,
        "categorical_features": [],
        "artifacts": {
            "model_filename": "best_model.joblib",
            "model_format": "joblib",
            "model_sha256": model_sha256,
            "model_size_bytes": model_size,
        },
    }

    meta_file = exp_dir / "metadata.json"
    meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return exp_dir


def test_authentication_and_role_authorization_boundaries(serving_env):
    """Verify missing keys, invalid keys, read-only inference, and admin-only cache invalidation."""
    client, exp_dir, read_key, admin_key = serving_env
    create_real_trained_experiment(exp_dir, "exp-auth-test")

    # Register and promote to staging
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-auth-test", "model_name": "auth_guarded_model", "initial_stage": "staging"},
    )

    # 1. Unauthenticated request (no X-API-Key or Authorization header) -> 401
    res = client.get("/api/v1/serving/models")
    assert res.status_code == 401
    assert "Authentication required" in res.json()["detail"]

    # 2. Invalid API Key -> 401
    res = client.get("/api/v1/serving/models", headers={"X-API-Key": "wrong-key"})
    assert res.status_code == 401
    assert "Invalid API key" in res.json()["detail"]

    # 3. Read Key on Inference Route -> 200 OK
    res = client.get("/api/v1/serving/models", headers={"X-API-Key": read_key})
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 4. Bearer Token format also accepted -> 200 OK
    res = client.get("/api/v1/serving/models", headers={"Authorization": f"Bearer {read_key}"})
    assert res.status_code == 200

    # 5. Read Key attempting Admin Cache Invalidation -> 403 Forbidden!
    res = client.post("/api/v1/serving/cache/invalidate", headers={"X-API-Key": read_key})
    assert res.status_code == 403
    assert "Admin role required" in res.json()["detail"]

    # 6. Admin Key on Admin Cache Invalidation -> 200 OK
    res = client.post("/api/v1/serving/cache/invalidate", headers={"X-API-Key": admin_key})
    assert res.status_code == 200
    assert res.json()["evicted"] is False or res.json()["evicted"] is True


def test_classification_serving_with_probabilities_and_auto_resolution(serving_env):
    """Verify classification inference, probability generation, and automatic active version resolution."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-cls-prod")

    # Register and promote to Production
    reg_res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-cls-prod", "model_name": "credit_risk", "initial_stage": "production"},
    )
    assert reg_res.status_code == 201

    # Inspect capabilities
    detail_res = client.get("/api/v1/serving/models/credit_risk/versions/1", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["model_name"] == "credit_risk"
    assert detail["version"] == 1
    assert detail["stage"] == "production"
    assert detail["supports_probabilities"] is True
    assert "feature_a" in detail["feature_names"]

    # Check health endpoint
    health_res = client.get("/api/v1/serving/models/credit_risk/versions/1/health", headers=headers)
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"
    assert health_res.json()["artifact_verified"] is True

    # 1. Execute prediction with specific version
    payload = {
        "records": [
            {"feature_a": 1.2, "feature_b": 0.5, "feature_c": -0.8},
            {"feature_a": -1.5, "feature_b": -2.0, "feature_c": 0.1},
        ]
    }
    pred_res = client.post("/api/v1/serving/models/credit_risk/versions/1/predict", json=payload, headers=headers)
    assert pred_res.status_code == 200
    data = pred_res.json()
    assert data["model_name"] == "credit_risk"
    assert data["version"] == 1
    assert data["stage"] == "production"
    assert data["records_count"] == 2
    assert len(data["predictions"]) == 2
    assert data["probabilities"] is not None
    assert len(data["probabilities"]) == 2
    assert "0" in data["probabilities"][0]
    assert "1" in data["probabilities"][0]
    assert data["latency_ms"] >= 0.0

    # 2. Execute prediction with auto-resolved active version (/models/{name}/predict)
    auto_res = client.post("/api/v1/serving/models/credit_risk/predict", json=payload, headers=headers)
    assert auto_res.status_code == 200
    assert auto_res.json()["version"] == 1
    assert auto_res.json()["stage"] == "production"


def test_regression_serving_and_unsupported_probabilities(serving_env):
    """Verify regression inference returns scalar continuous numbers and leaves probabilities as None."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-reg-served", task_type="regression")

    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-reg-served", "model_name": "house_price_model", "initial_stage": "staging"},
    )

    detail = client.get("/api/v1/serving/models/house_price_model/versions/1", headers=headers).json()
    assert detail["task_type"] == "regression"
    assert detail["supports_probabilities"] is False

    payload = {
        "records": [
            {"feature_a": 2.0, "feature_b": 1.0, "feature_c": -1.0},
        ]
    }
    pred_res = client.post("/api/v1/serving/models/house_price_model/versions/1/predict", json=payload, headers=headers)
    assert pred_res.status_code == 200
    res_data = pred_res.json()
    assert res_data["probabilities"] is None
    assert isinstance(res_data["predictions"][0], (int, float))


def test_strict_feature_validation_rejections(serving_env):
    """Verify strict rejection of missing features, rogue unexpected columns, and nested JSON values."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-schema-strict")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-schema-strict", "model_name": "schema_guard", "initial_stage": "staging"},
    )

    # 1. Missing feature column
    bad_payload_missing = {
        "records": [
            {"feature_a": 1.0, "feature_b": 2.0}  # missing feature_c
        ]
    }
    res = client.post("/api/v1/serving/models/schema_guard/versions/1/predict", json=bad_payload_missing, headers=headers)
    assert res.status_code == 400
    assert "missing required feature" in res.json()["detail"].lower()

    # 2. Unexpected rogue column
    bad_payload_rogue = {
        "records": [
            {"feature_a": 1.0, "feature_b": 2.0, "feature_c": 3.0, "malicious_injected_column": 999}
        ]
    }
    res = client.post("/api/v1/serving/models/schema_guard/versions/1/predict", json=bad_payload_rogue, headers=headers)
    assert res.status_code == 400
    assert "unexpected feature" in res.json()["detail"].lower()

    # 3. Non-scalar / nested structure
    bad_payload_nested = {
        "records": [
            {"feature_a": 1.0, "feature_b": 2.0, "feature_c": {"nested": "dict"}}
        ]
    }
    res = client.post("/api/v1/serving/models/schema_guard/versions/1/predict", json=bad_payload_nested, headers=headers)
    assert res.status_code == 400
    assert "unsupported nested structure" in res.json()["detail"].lower()


def test_archived_and_ineligible_model_rejection(serving_env):
    """Verify that models in development or archived stages are strictly rejected from serving."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-archived-test")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-archived-test", "model_name": "archived_model", "initial_stage": "development"},
    )

    payload = {"records": [{"feature_a": 1.0, "feature_b": 1.0, "feature_c": 1.0}]}

    # 1. Development stage is not in serving_eligible_stages (by default ["production", "staging"])
    res = client.post("/api/v1/serving/models/archived_model/versions/1/predict", json=payload, headers=headers)
    assert res.status_code == 400
    assert "not eligible for live serving" in res.json()["detail"]

    # 2. Transition to Archived
    client.post(
        "/api/v1/models/archived_model/versions/1/stage",
        json={"new_stage": "archived", "reason": "Deprecated model"},
    )
    res = client.post("/api/v1/serving/models/archived_model/versions/1/predict", json=payload, headers=headers)
    assert res.status_code == 400
    assert "ARCHIVED" in res.json()["detail"]


def test_artifact_tampering_and_cache_invalidation(serving_env):
    """Verify that artifact tampering blocks inference, invalidates cache, and reports degraded health."""
    client, exp_dir, read_key, admin_key = serving_env
    headers = {"X-API-Key": read_key}
    admin_headers = {"X-API-Key": admin_key}

    create_real_trained_experiment(exp_dir, "exp-tamper-serving")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-tamper-serving", "model_name": "tamper_serving", "initial_stage": "staging"},
    )

    payload = {"records": [{"feature_a": 0.5, "feature_b": -0.2, "feature_c": 1.1}]}

    # 1. Initial prediction succeeds and warms cache
    res1 = client.post("/api/v1/serving/models/tamper_serving/versions/1/predict", json=payload, headers=headers)
    assert res1.status_code == 200

    # Verify is_cached is True
    detail = client.get("/api/v1/serving/models/tamper_serving/versions/1", headers=headers).json()
    assert detail["is_cached"] is True

    # 2. Tamper with model artifact binary on disk
    artifact_path = exp_dir / "model_registry" / "tamper_serving" / "v1" / "best_model.joblib"
    artifact_path.write_bytes(b"MALICIOUS_TAMPERED_PAYLOAD")

    # 3. Explicit cache eviction via Admin API
    evict_res = client.post(
        "/api/v1/serving/models/tamper_serving/versions/1/cache/invalidate",
        headers=admin_headers,
    )
    assert evict_res.status_code == 200
    assert evict_res.json()["evicted"] is True

    # 4. Subsequent prediction attempt must detect checksum mismatch and abort!
    res_tampered = client.post("/api/v1/serving/models/tamper_serving/versions/1/predict", json=payload, headers=headers)
    assert res_tampered.status_code == 400
    assert "integrity check failed" in res_tampered.json()["detail"].lower()

    # 5. Health check reflects degraded status
    health = client.get("/api/v1/serving/models/tamper_serving/versions/1/health", headers=headers).json()
    assert health["status"] == "degraded"
    assert health["artifact_verified"] is False


def test_monitoring_metrics_collection_and_latency_tracking(serving_env):
    """Verify aggregated operational metrics accurately count requests, errors, and latencies."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-metrics-test")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-metrics-test", "model_name": "metrics_model", "initial_stage": "staging"},
    )

    valid_payload = {"records": [{"feature_a": 0.1, "feature_b": 0.2, "feature_c": 0.3}]}
    invalid_payload = {"records": [{"feature_a": 0.1}]}  # missing features

    # Execute 3 successful predictions and 1 validation failure
    for _ in range(3):
        client.post("/api/v1/serving/models/metrics_model/versions/1/predict", json=valid_payload, headers=headers)
    client.post("/api/v1/serving/models/metrics_model/versions/1/predict", json=invalid_payload, headers=headers)

    # Check metrics
    metrics_res = client.get("/api/v1/serving/metrics", headers=headers)
    assert metrics_res.status_code == 200
    m_data = metrics_res.json()

    assert m_data["total_requests"] >= 4
    assert m_data["successful_requests"] >= 3
    assert m_data["validation_errors"] >= 1
    assert m_data["average_latency_ms"] >= 0.0
    assert "metrics_model:v1" in m_data["models_served"]


def test_concurrent_serving_inference_thread_safety(serving_env):
    """Verify high-throughput concurrent inference across multiple threads with model cache."""
    client, exp_dir, read_key, _ = serving_env
    headers = {"X-API-Key": read_key}

    create_real_trained_experiment(exp_dir, "exp-concurrent-infer")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-concurrent-infer", "model_name": "concurrent_infer", "initial_stage": "production"},
    )

    def worker(worker_id: int):
        payload = {
            "records": [
                {"feature_a": float(worker_id), "feature_b": 0.5, "feature_c": -0.5}
            ]
        }
        return client.post("/api/v1/serving/models/concurrent_infer/predict", json=payload, headers=headers)

    with ThreadPoolExecutor(max_workers=5) as executor:
        responses = list(executor.map(worker, range(10)))

    assert all(r.status_code == 200 for r in responses)
    for r in responses:
        data = r.json()
        assert data["model_name"] == "concurrent_infer"
        assert len(data["predictions"]) == 1


def test_unknown_models_versions_and_bounds(serving_env):
    """Verify HTTP 404 for non-existent models/versions and 400 for invalid version numbers."""
    client, exp_dir, read_key, admin_key = serving_env
    headers = {"X-API-Key": read_key}
    admin_headers = {"X-API-Key": admin_key}

    # 1. Unknown model name -> 404
    res = client.get("/api/v1/serving/models/nonexistent_model/versions/1", headers=headers)
    assert res.status_code == 404

    # 2. Existing model, unknown version number -> 404
    create_real_trained_experiment(exp_dir, "exp-unknown-ver")
    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-unknown-ver", "model_name": "known_model", "initial_stage": "production"},
    )
    res = client.get("/api/v1/serving/models/known_model/versions/999", headers=headers)
    assert res.status_code == 404

    # 3. Invalid version number (0 or negative) -> 422 (Path ge=1 validation)
    res = client.get("/api/v1/serving/models/known_model/versions/0", headers=headers)
    assert res.status_code == 422

    # 4. Invalidate all cache with Admin key -> 200 OK
    res = client.post("/api/v1/serving/cache/invalidate", headers=admin_headers)
    assert res.status_code == 200
    assert "Evicted" in res.json()["message"]

