"""AutoNexa Phase 17E.2 — Multi-User Authorization & Production Deployment Gate Tests.

Validates:
1. Production environment fail-closed startup configuration checks.
2. Shared catalog tenancy & absence of user/tenant isolation.
3. Read-role access scope (inspection & prediction permitted, mutations blocked).
4. Admin-role requirement on model artifact downloads & state mutations.
5. Verification of database schema columns (no user_id / tenant_id).
"""

import io
import os
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect as sqla_inspect

from app.core.config import Settings
from app.db.models import DatasetModel, ExperimentModel, PipelineModel
from app.main import app
from app.services.dataset_service import DatasetService, get_dataset_service


# -----------------------------------------------------------------------------
# 1. Production Startup Fail-Closed Configuration Tests
# -----------------------------------------------------------------------------

def test_production_startup_rejects_default_admin_key():
    """Verify that ENVIRONMENT=production rejects default admin key."""
    # Ensure VERCEL is not set during test
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        with pytest.raises(ValueError, match="API_KEY_ADMIN must be set to a strong, non-default secret"):
            Settings(
                ENVIRONMENT="production",
                API_AUTH_ENABLED=True,
                API_KEY_ADMIN="autonexa-admin-key-secret",
                API_KEY_READ="valid-strong-read-key-12345",
            )


def test_production_startup_rejects_default_read_key():
    """Verify that ENVIRONMENT=production rejects default read key."""
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        with pytest.raises(ValueError, match="API_KEY_READ must be set to a strong, non-default secret"):
            Settings(
                ENVIRONMENT="production",
                API_AUTH_ENABLED=True,
                API_KEY_ADMIN="valid-strong-admin-key-12345",
                API_KEY_READ="autonexa-read-key-secret",
            )


def test_production_startup_rejects_disabled_auth():
    """Verify that ENVIRONMENT=production forbids disabling API authentication."""
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        with pytest.raises(ValueError, match="API authentication cannot be disabled"):
            Settings(
                ENVIRONMENT="production",
                API_AUTH_ENABLED=False,
                API_KEY_ADMIN="valid-strong-admin-key-12345",
                API_KEY_READ="valid-strong-read-key-12345",
            )


def test_production_startup_rejects_identical_keys():
    """Verify that ENVIRONMENT=production enforces distinct admin and read keys."""
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        with pytest.raises(ValueError, match="API_KEY_ADMIN and API_KEY_READ must be distinct secrets"):
            Settings(
                ENVIRONMENT="production",
                API_AUTH_ENABLED=True,
                API_KEY_ADMIN="identical-shared-secret-key-12345",
                API_KEY_READ="identical-shared-secret-key-12345",
            )


def test_production_startup_rejects_short_keys():
    """Verify that ENVIRONMENT=production enforces minimum 16-character keys."""
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        with pytest.raises(ValueError, match="API_KEY_ADMIN must be at least 16 characters long"):
            Settings(
                ENVIRONMENT="production",
                API_AUTH_ENABLED=True,
                API_KEY_ADMIN="short-key",
                API_KEY_READ="valid-strong-read-key-12345",
            )


def test_production_startup_accepts_valid_secrets():
    """Verify that ENVIRONMENT=production initializes cleanly with valid 16+ char secrets."""
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("VERCEL", None)
        cfg = Settings(
            ENVIRONMENT="production",
            API_AUTH_ENABLED=True,
            API_KEY_ADMIN="strong-prod-admin-secret-key-99999",
            API_KEY_READ="strong-prod-read-secret-key-88888",
        )
        assert cfg.environment == "production"
        assert cfg.api_auth_enabled is True
        assert cfg.api_key_admin == "strong-prod-admin-secret-key-99999"
        assert cfg.api_key_read == "strong-prod-read-secret-key-88888"


# -----------------------------------------------------------------------------
# 2. Schema Multi-Tenancy & User Isolation Audit
# -----------------------------------------------------------------------------

def test_database_models_lack_user_and_tenant_ownership():
    """Verify that database models have no user_id, tenant_id, or owner_id columns."""
    dataset_cols = {col.name for col in DatasetModel.__table__.columns}
    experiment_cols = {col.name for col in ExperimentModel.__table__.columns}
    pipeline_cols = {col.name for col in PipelineModel.__table__.columns}

    # Document architectural reality: AutoNexa is a single-tenant / shared catalog application
    assert "user_id" not in dataset_cols
    assert "tenant_id" not in dataset_cols
    assert "owner_id" not in dataset_cols

    assert "user_id" not in experiment_cols
    assert "tenant_id" not in experiment_cols
    assert "owner_id" not in experiment_cols

    assert "user_id" not in pipeline_cols
    assert "tenant_id" not in pipeline_cols
    assert "owner_id" not in pipeline_cols


# -----------------------------------------------------------------------------
# 3. Read vs Admin Authorization Scope in Endpoints
# -----------------------------------------------------------------------------

@pytest.fixture
def test_client_and_keys(tmp_path: Path):
    """Fixture providing isolated TestClient and distinct keys."""
    upload_dir = tmp_path / "audit_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    exp_dir = tmp_path / "audit_exp"
    exp_dir.mkdir(parents=True, exist_ok=True)

    admin_key = "audit-sec-admin-token-12345"
    read_key = "audit-sec-read-token-67890"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(exp_dir),
        ENABLE_MLFLOW_TRACKING=False,
        API_AUTH_ENABLED=True,
        API_KEY_ADMIN=admin_key,
        API_KEY_READ=read_key,
        MAX_UPLOAD_SIZE_BYTES=10 * 1024 * 1024,
        ENVIRONMENT="development",
    )

    isolated_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.dataset_service.get_settings", return_value=test_settings):
        app.dependency_overrides[get_dataset_service] = lambda: isolated_service
        with TestClient(app) as client:
            yield client, admin_key, read_key
        app.dependency_overrides.clear()


def test_read_role_can_list_all_catalog_datasets(test_client_and_keys):
    """Read/inference role can query dataset catalog without tenant filtering."""
    client, _, read_key = test_client_and_keys
    res = client.get("/api/v1/datasets", headers={"X-API-Key": read_key})
    assert res.status_code == 200
    data = res.json()
    assert "datasets" in data
    assert "total" in data


def test_read_role_strictly_forbidden_from_privileged_mutations(test_client_and_keys):
    """Read/inference role is forbidden (403) from mutations and training."""
    client, _, read_key = test_client_and_keys

    # 1. Upload forbidden with read key
    csv_bytes = b"f1,f2,target\n1,2,0\n"
    files = {"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")}
    upload_res = client.post("/api/v1/datasets/upload", files=files, headers={"X-API-Key": read_key})
    assert upload_res.status_code == 403
    assert "Admin role required" in upload_res.json().get("detail", "")

    # 2. Training forbidden with read key
    train_res = client.post(
        "/api/v1/datasets/dummy-id/train",
        json={"target_column": "target"},
        headers={"X-API-Key": read_key},
    )
    assert train_res.status_code == 403
    assert "Admin role required" in train_res.json().get("detail", "")

    # 3. Experiment deletion forbidden with read key
    del_res = client.delete("/api/v1/experiments/exp-1", headers={"X-API-Key": read_key})
    assert del_res.status_code == 403
    assert "Admin role required" in del_res.json().get("detail", "")

    # 4. Artifact download forbidden with read key
    art_res = client.get("/api/v1/experiments/exp-1/artifact", headers={"X-API-Key": read_key})
    assert art_res.status_code == 403
    assert "Admin role required" in art_res.json().get("detail", "")


def test_unauthenticated_requests_strictly_rejected_401(test_client_and_keys):
    """Unauthenticated requests without headers are rejected with 401 across all endpoints."""
    client, _, _ = test_client_and_keys

    # Dataset listing requires at least read credentials
    assert client.get("/api/v1/datasets").status_code == 401

    # Health diagnostics requires admin credentials
    assert client.get("/api/v1/health/diagnostics").status_code == 401

    # Experiment deletion requires admin credentials
    assert client.delete("/api/v1/experiments/exp-1").status_code == 401
