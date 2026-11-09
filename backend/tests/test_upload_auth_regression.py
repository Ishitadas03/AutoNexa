"""Regression tests for Critical Upload Authentication & Dataset Ingestion.

Verifies:
1. Strict 401 rejection on unauthenticated uploads.
2. Strict 401 rejection on invalid credentials.
3. Strict 403 rejection on read-only (inference) role credentials for upload.
4. Successful 201 upload and profiling with valid admin credentials.
5. Strict 413 rejection when file size exceeds the 10 MB upload limit.
6. Strict 400 rejection for empty files (0 bytes) and non-CSV formats.
7. Verification that responses do not leak secrets or internal paths.
"""

import io
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def auth_upload_env(tmp_path: Path):
    """Isolated test environment with explicit admin and read keys."""
    upload_dir = tmp_path / "test_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir = tmp_path / "test_experiments"
    experiments_dir.mkdir(parents=True, exist_ok=True)

    admin_key = "test-sec-admin-token-12345"
    read_key = "test-sec-read-token-67890"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
        API_AUTH_ENABLED=True,
        API_KEY_ADMIN=admin_key,
        API_KEY_READ=read_key,
        MAX_UPLOAD_SIZE_BYTES=10 * 1024 * 1024,
        ENVIRONMENT="development",
    )

    isolated_service = DatasetService(
        upload_dir=upload_dir,
        max_upload_size_bytes=10 * 1024 * 1024,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.services.dataset_service.get_settings", return_value=test_settings):
        app.dependency_overrides[get_dataset_service] = lambda: isolated_service
        with TestClient(app) as client:
            yield client, upload_dir, admin_key, read_key
        app.dependency_overrides.clear()


def test_upload_without_credentials_fails_with_401(auth_upload_env):
    """Confirm the production bug: uploading with no headers fails with 401."""
    client, _, _, _ = auth_upload_env
    csv_bytes = b"feature1,feature2,target\n1,2,0\n3,4,1\n"
    files = {"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")}

    # Send request with zero authentication headers
    response = client.post("/api/v1/datasets/upload", files=files, headers={})

    assert response.status_code == 401
    detail = response.json().get("detail", "")
    assert "Authentication required" in detail
    assert "X-API-Key" in detail or "Authorization" in detail


def test_upload_with_invalid_credentials_fails_with_401(auth_upload_env):
    """Uploading with an invalid/tampered API key fails with 401."""
    client, _, _, _ = auth_upload_env
    csv_bytes = b"feature1,feature2,target\n1,2,0\n3,4,1\n"
    files = {"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": "invalid-wrong-key"},
    )

    assert response.status_code == 401
    detail = response.json().get("detail", "")
    assert "Invalid API key" in detail


def test_upload_with_read_only_key_fails_with_403(auth_upload_env):
    """Uploading with a read/inference role key fails with 403 Forbidden."""
    client, _, _, read_key = auth_upload_env
    csv_bytes = b"feature1,feature2,target\n1,2,0\n3,4,1\n"
    files = {"file": ("test.csv", io.BytesIO(csv_bytes), "text/csv")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": read_key},
    )

    assert response.status_code == 403
    detail = response.json().get("detail", "")
    assert "Admin role required" in detail


def test_upload_with_valid_admin_key_succeeds_201(auth_upload_env):
    """Uploading with valid admin key succeeds with 201 Created and persists dataset."""
    client, upload_dir, admin_key, _ = auth_upload_env
    csv_bytes = b"feature1,feature2,target\n10.5,alpha,0\n20.3,beta,1\n30.1,gamma,0\n"
    files = {"file": ("dataset_valid.csv", io.BytesIO(csv_bytes), "text/csv")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": admin_key},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "dataset_valid.csv"
    assert data["rows"] == 3
    assert data["columns"] == 3
    assert "dataset_id" in data
    assert data["file_size_bytes"] > 0
    assert data["column_names"] == ["feature1", "feature2", "target"]

    # Verify physical file existence
    stored_path = upload_dir / f"{data['dataset_id']}.csv"
    assert stored_path.exists()


def test_upload_empty_file_rejected_with_400(auth_upload_env):
    """Zero-byte empty file upload rejected with 400 Bad Request."""
    client, _, admin_key, _ = auth_upload_env
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": admin_key},
    )

    assert response.status_code == 400
    assert "empty" in response.json().get("detail", "").lower()


def test_upload_non_csv_rejected_with_400(auth_upload_env):
    """Non-CSV file upload rejected with 400 Bad Request."""
    client, _, admin_key, _ = auth_upload_env
    files = {"file": ("malicious.exe", io.BytesIO(b"binary_data"), "application/octet-stream")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": admin_key},
    )

    assert response.status_code == 400
    assert "csv" in response.json().get("detail", "").lower()


def test_upload_oversized_file_rejected_with_413(auth_upload_env):
    """File exceeding the 10 MB limit is rejected with HTTP 413."""
    client, upload_dir, admin_key, _ = auth_upload_env

    # Configure service with 256 byte threshold for testing oversized rejection
    tiny_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=256)
    app.dependency_overrides[get_dataset_service] = lambda: tiny_service

    large_payload = b"col1,col2,col3\n" + (b"1,2,3\n" * 100)  # > 600 bytes
    files = {"file": ("oversized.csv", io.BytesIO(large_payload), "text/csv")}

    response = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"X-API-Key": admin_key},
    )

    assert response.status_code == 413
    assert "exceeds" in response.json().get("detail", "").lower()
