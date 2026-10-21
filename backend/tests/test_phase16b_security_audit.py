"""Comprehensive security audit and regression tests for AutoNexa Phase 16B:

Uniform API Security & Role-Based Access Control (RBAC).
"""

import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import AppRole
from app.main import app
from app.schemas.tracking import LifecycleStage


@pytest.fixture
def security_test_env(tmp_path: Path):
    """Isolated test environment with separate read and admin keys."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    monitoring_dir = experiments_dir / "monitoring"
    pipelines_dir = experiments_dir / "pipelines"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    monitoring_dir.mkdir(parents=True, exist_ok=True)
    pipelines_dir.mkdir(parents=True, exist_ok=True)

    read_key = "test-sec-read-key-12345"
    admin_key = "test-sec-admin-key-67890"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
        API_AUTH_ENABLED=True,
        API_KEY_READ=read_key,
        API_KEY_ADMIN=admin_key,
        ENVIRONMENT="development",
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.dataset_service.get_settings", return_value=test_settings), \
         patch("app.services.analysis_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_monitoring_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.pipeline_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.prediction_service.get_settings", return_value=test_settings):
        with TestClient(app) as client:
            yield client, upload_dir, experiments_dir, read_key, admin_key


# ==============================================================================
# 1. Public Health Check Remains Accessible
# ==============================================================================

def test_health_endpoint_public_without_auth(security_test_env):
    """Verify GET /api/v1/health is public and accessible without credentials."""
    client, _, _, _, _ = security_test_env
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "version" in data


# ==============================================================================
# 2. Unauthenticated Requests Denied (HTTP 401)
# ==============================================================================

def test_unauthenticated_requests_denied_across_all_modules(security_test_env):
    """Verify all protected endpoints reject unauthenticated requests with HTTP 401."""
    client, _, _, _, _ = security_test_env

    protected_endpoints = [
        # Datasets
        ("POST", "/api/v1/datasets/upload"),
        ("POST", "/api/v1/datasets/fake_id/analyze"),
        ("POST", "/api/v1/datasets/fake_id/train"),
        # Experiments
        ("GET", "/api/v1/experiments"),
        ("POST", "/api/v1/experiments/compare"),
        ("GET", "/api/v1/experiments/fake_id"),
        ("GET", "/api/v1/experiments/fake_id/details"),
        ("GET", "/api/v1/experiments/fake_id/metrics"),
        ("GET", "/api/v1/experiments/fake_id/reproducibility-manifest"),
        ("GET", "/api/v1/experiments/fake_id/reproducibility-manifest/verify"),
        ("GET", "/api/v1/experiments/fake_id/artifact"),
        ("DELETE", "/api/v1/experiments/fake_id"),
        ("POST", "/api/v1/experiments/fake_id/predict"),
        ("POST", "/api/v1/experiments/fake_id/predict-csv"),
        ("GET", "/api/v1/experiments/fake_id/explainability/importance"),
        ("POST", "/api/v1/experiments/fake_id/explainability/prediction"),
        ("POST", "/api/v1/experiments/fake_id/error-analysis"),
        # Model Registry
        ("POST", "/api/v1/models/register"),
        ("GET", "/api/v1/models"),
        ("GET", "/api/v1/models/fake_model"),
        ("GET", "/api/v1/models/fake_model/versions/1"),
        ("POST", "/api/v1/models/fake_model/versions/1/stage"),
        ("GET", "/api/v1/models/fake_model/versions/1/verify"),
        ("GET", "/api/v1/models/fake_model/versions/1/download"),
        ("POST", "/api/v1/models/fake_model/compare-versions"),
        # Benchmarks
        ("POST", "/api/v1/benchmarks/compare"),
        ("POST", "/api/v1/benchmarks/repeated-runs"),
        ("GET", "/api/v1/benchmarks/repeated-runs/fake_group"),
        ("POST", "/api/v1/benchmarks/baseline-comparison"),
        ("GET", "/api/v1/benchmarks/hpo-spaces"),
        ("POST", "/api/v1/benchmarks/hpo-experiment"),
        ("GET", "/api/v1/benchmarks/hpo-experiment/fake_id"),
        ("POST", "/api/v1/benchmarks/multi-objective"),
        ("GET", "/api/v1/benchmarks/multi-objective/fake_id"),
        ("GET", "/api/v1/benchmarks/multi-objective/fake_id/pareto"),
        ("POST", "/api/v1/benchmarks/multi-objective/fake_id/select"),
        ("GET", "/api/v1/benchmarks/dataset-catalog"),
        ("POST", "/api/v1/benchmarks/robust"),
        ("GET", "/api/v1/benchmarks/robust/fake_id"),
        # Serving
        ("GET", "/api/v1/serving/models"),
        ("POST", "/api/v1/serving/cache/invalidate"),
        # Monitoring
        ("GET", "/api/v1/monitoring/overview"),
        ("POST", "/api/v1/monitoring/reference-profiles"),
        # Pipelines
        ("GET", "/api/v1/pipelines"),
        ("POST", "/api/v1/pipelines"),
    ]

    for method, path in protected_endpoints:
        if method == "GET":
            res = client.get(path)
        elif method == "POST":
            res = client.post(path, json={})
        elif method == "DELETE":
            res = client.delete(path)
        else:
            continue

        assert res.status_code == 401, f"Expected 401 for unauthenticated {method} {path}, got {res.status_code}: {res.text}"
        detail = res.json().get("detail", "")
        assert "Authentication required" in detail, f"Expected sanitized auth error for {path}, got {detail}"


# ==============================================================================
# 3. Invalid Credentials Denied (HTTP 401)
# ==============================================================================

def test_invalid_api_keys_denied(security_test_env):
    """Verify invalid credentials in X-API-Key or Bearer header return HTTP 401."""
    client, _, _, _, _ = security_test_env

    # Invalid X-API-Key
    res = client.get("/api/v1/experiments", headers={"X-API-Key": "completely-invalid-key"})
    assert res.status_code == 401
    assert "Invalid API key" in res.json()["detail"]

    # Invalid Bearer token
    res2 = client.get("/api/v1/models", headers={"Authorization": "Bearer bad-bearer-token"})
    assert res2.status_code == 401
    assert "Invalid API key" in res2.json()["detail"]

    # Malformed Authorization header
    res3 = client.get("/api/v1/benchmarks/hpo-spaces", headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert res3.status_code == 401
    assert "Authentication required" in res3.json()["detail"]


# ==============================================================================
# 4. Role-Based Access Control: Read/Inference Role Forbidden on Admin Mutations (HTTP 403)
# ==============================================================================

def test_read_role_forbidden_on_admin_endpoints(security_test_env):
    """Verify callers with only read/inference role cannot execute administrative mutations."""
    client, _, _, read_key, _ = security_test_env
    headers = {"X-API-Key": read_key}

    admin_endpoints = [
        ("POST", "/api/v1/datasets/upload", {"data": {}}),
        ("POST", "/api/v1/datasets/fake_ds/train", {"json": {"target_column": "y"}}),
        ("GET", "/api/v1/experiments/fake_exp/artifact", {}),
        ("DELETE", "/api/v1/experiments/fake_exp", {}),
        ("POST", "/api/v1/models/register", {"json": {"experiment_id": "e", "model_name": "m"}}),
        ("POST", "/api/v1/models/fake_m/versions/1/stage", {"json": {"new_stage": "production"}}),
        ("GET", "/api/v1/models/fake_m/versions/1/download", {}),
        ("POST", "/api/v1/benchmarks/repeated-runs", {"json": {"dataset_id": "d", "target_column": "y"}}),
        ("POST", "/api/v1/benchmarks/hpo-experiment", {"json": {"dataset_id": "d", "target_column": "y"}}),
        ("POST", "/api/v1/benchmarks/multi-objective", {"json": {"dataset_id": "d", "target_column": "y"}}),
        ("POST", "/api/v1/benchmarks/multi-objective/fake_id/select", {"json": {"policy": "balanced"}}),
        ("POST", "/api/v1/benchmarks/robust", {"json": {"dataset_id": "d", "target_column": "y"}}),
        ("POST", "/api/v1/serving/cache/invalidate", {}),
        ("POST", "/api/v1/monitoring/reference-profiles", {"json": {"model_name": "m", "dataset_id": "d"}}),
        ("POST", "/api/v1/pipelines", {"json": {"model_name": "m", "dataset_id": "d", "target_column": "y"}}),
    ]

    for method, path, kwargs in admin_endpoints:
        if method == "GET":
            res = client.get(path, headers=headers, **kwargs)
        elif method == "POST":
            res = client.post(path, headers=headers, **kwargs)
        elif method == "DELETE":
            res = client.delete(path, headers=headers, **kwargs)
        else:
            continue

        assert res.status_code == 403, f"Expected 403 Forbidden for read key on {method} {path}, got {res.status_code}: {res.text}"
        detail = res.json().get("detail", "")
        assert "Admin role required" in detail or "Forbidden" in detail


# ==============================================================================
# 5. Read Role Permitted on Read & Inference Endpoints (HTTP 200)
# ==============================================================================

def test_read_role_permitted_on_read_endpoints(security_test_env):
    """Verify callers with read/inference role can query metadata and list endpoints."""
    client, _, _, read_key, _ = security_test_env
    headers = {"X-API-Key": read_key}

    # Experiments list
    res = client.get("/api/v1/experiments", headers=headers)
    assert res.status_code == 200

    # Models list
    res = client.get("/api/v1/models", headers=headers)
    assert res.status_code == 200

    # Benchmark spaces & catalog
    res = client.get("/api/v1/benchmarks/hpo-spaces", headers=headers)
    assert res.status_code == 200

    res = client.get("/api/v1/benchmarks/dataset-catalog", headers=headers)
    assert res.status_code == 200

    # Serving models
    res = client.get("/api/v1/serving/models", headers=headers)
    assert res.status_code == 200

    # Monitoring overview
    res = client.get("/api/v1/monitoring/overview", headers=headers)
    assert res.status_code == 200

    # Pipelines listing
    res = client.get("/api/v1/pipelines", headers=headers)
    assert res.status_code == 200


# ==============================================================================
# 6. Admin Role Permitted on Both Admin & Read Endpoints
# ==============================================================================

def test_admin_role_permitted_everywhere(security_test_env):
    """Verify administrator key satisfies both require_admin_role and require_inference_role."""
    client, _, _, _, admin_key = security_test_env
    headers = {"X-API-Key": admin_key}

    # Read endpoint
    res_read = client.get("/api/v1/experiments", headers=headers)
    assert res_read.status_code == 200

    # Admin mutation (cache invalidation)
    res_admin = client.post("/api/v1/serving/cache/invalidate", headers=headers)
    assert res_admin.status_code == 200

    # Pipelines listing
    res_pipe = client.get("/api/v1/pipelines", headers=headers)
    assert res_pipe.status_code == 200


# ==============================================================================
# 7. Fail-Closed Production Configuration Safety
# ==============================================================================

def test_production_fails_closed_when_auth_disabled():
    """Verify that ENVIRONMENT=production strictly prohibits API_AUTH_ENABLED=False."""
    with pytest.raises(ValueError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=False,
            API_KEY_ADMIN="a" * 32,
            API_KEY_READ="r" * 32,
        )
    assert "Insecure production configuration" in str(excinfo.value)
    assert "API authentication cannot be disabled" in str(excinfo.value)


def test_production_fails_closed_with_default_keys():
    """Verify that ENVIRONMENT=production strictly prohibits default or placeholder keys."""
    # Default admin key
    with pytest.raises(ValueError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=True,
            API_KEY_ADMIN="autonexa-admin-key-secret",
            API_KEY_READ="a-valid-production-read-key-12345",
        )
    assert "API_KEY_ADMIN must be set to a strong, non-default secret" in str(excinfo.value)

    # Default read key
    with pytest.raises(ValueError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=True,
            API_KEY_ADMIN="a-valid-production-admin-key-12345",
            API_KEY_READ="autonexa-read-key-secret",
        )
    assert "API_KEY_READ must be set to a strong, non-default secret" in str(excinfo.value)


def test_production_fails_closed_with_identical_keys():
    """Verify that ENVIRONMENT=production rejects identical admin and read keys."""
    common_key = "shared-secret-that-is-at-least-16-chars"
    with pytest.raises(ValueError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=True,
            API_KEY_ADMIN=common_key,
            API_KEY_READ=common_key,
        )
    assert "must be distinct secrets with proper role separation" in str(excinfo.value)


def test_production_fails_closed_with_short_keys():
    """Verify that ENVIRONMENT=production rejects keys shorter than 16 characters."""
    with pytest.raises(ValueError) as excinfo:
        Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=True,
            API_KEY_ADMIN="short-admin",
            API_KEY_READ="a-sufficiently-long-read-key-12345",
        )
    assert "must be at least 16 characters long" in str(excinfo.value)


def test_production_succeeds_with_valid_secure_keys():
    """Verify that ENVIRONMENT=production initializes successfully with strong, distinct keys."""
    s = Settings(
        ENVIRONMENT="production",
        API_AUTH_ENABLED=True,
        API_KEY_ADMIN="strong-production-admin-key-9876543210",
        API_KEY_READ="strong-production-read-key-0123456789",
    )
    assert s.api_auth_enabled is True
    assert s.api_key_admin == "strong-production-admin-key-9876543210"
    assert s.api_key_read == "strong-production-read-key-0123456789"


def test_error_responses_do_not_leak_keys_or_paths(security_test_env):
    """Verify error responses never contain the secret API keys or internal directory roots."""
    client, upload_dir, experiments_dir, read_key, admin_key = security_test_env

    # Test with invalid auth
    res = client.get("/api/v1/experiments", headers={"X-API-Key": "attempted-secret-key"})
    text = res.text
    assert read_key not in text
    assert admin_key not in text
    assert "attempted-secret-key" not in text
    assert str(upload_dir) not in text
    assert str(experiments_dir) not in text
