"""Automated test suite for CSV dataset upload, validation, and profiling."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.dataset import DatasetProfileResponse
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def isolated_service(tmp_path: Path):
    """Fixture providing a DatasetService operating on an isolated temporary directory."""
    temp_upload_dir = tmp_path / "test_uploads"
    temp_upload_dir.mkdir(parents=True, exist_ok=True)
    service = DatasetService(upload_dir=temp_upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    return service, temp_upload_dir


@pytest.fixture
def client(isolated_service):
    """FastAPI TestClient with overridden dataset service pointing to temporary storage."""
    service, _ = isolated_service
    app.dependency_overrides[get_dataset_service] = lambda: service
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


def test_health_endpoint_still_operational(client: TestClient) -> None:
    """Requirement 2: Ensure the existing health endpoint remains fully functional."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["app_name"] == "AutoNexa"


def test_valid_csv_upload_returns_201_and_profile(client: TestClient, isolated_service) -> None:
    """Requirement 1: Valid CSV upload returns HTTP 201 and an accurate profile."""
    _, upload_dir = isolated_service
    csv_content = (
        "feature_1,feature_2,target\n"
        "10.5,alpha,1\n"
        "20.3,beta,0\n"
        "30.1,gamma,1\n"
        "40.9,alpha,0\n"
    )
    files = {"file": ("test_dataset.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 201
    data = response.json()

    # Validate against Pydantic schema
    profile = DatasetProfileResponse.model_validate(data)
    assert profile.filename == "test_dataset.csv"
    assert profile.rows == 4
    assert profile.columns == 3
    assert profile.column_names == ["feature_1", "feature_2", "target"]
    assert profile.duplicate_rows == 0
    assert profile.missing_values == {"feature_1": 0, "feature_2": 0, "target": 0}
    assert "feature_1" in profile.data_types
    assert profile.file_size_bytes > 0
    assert profile.memory_usage_bytes > 0

    # Ensure file was safely saved on disk under server-generated dataset_id
    stored_file = upload_dir / f"{profile.dataset_id}.csv"
    assert stored_file.exists()


def test_non_csv_filename_rejected(client: TestClient) -> None:
    """Requirement 3: Reject files without a valid .csv extension."""
    invalid_files = [
        ("payload.txt", b"col1,col2\n1,2\n", "text/plain"),
        ("malicious.exe", b"binary content", "application/octet-stream"),
        ("data.json", b'{"key": "value"}', "application/json"),
        (".csv", b"col1,col2\n1,2\n", "text/csv"),
    ]
    for filename, content, mime in invalid_files:
        files = {"file": (filename, io.BytesIO(content), mime)}
        response = client.post("/api/v1/datasets/upload", files=files)
        assert response.status_code == 400
        assert "csv" in response.json()["detail"].lower()


def test_empty_file_rejected(client: TestClient, isolated_service) -> None:
    """Requirement 4: Reject zero-byte empty files."""
    _, upload_dir = isolated_service
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()
    # Ensure no partial or orphan files are left on disk
    assert len(list(upload_dir.glob("*.csv"))) == 0


def test_whitespace_only_file_rejected(client: TestClient, isolated_service) -> None:
    """Requirement 5: Reject files containing only whitespace and newlines."""
    _, upload_dir = isolated_service
    whitespace_content = b"   \r\n\t   \n   \r\n"
    files = {"file": ("whitespace.csv", io.BytesIO(whitespace_content), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 400
    assert "whitespace" in response.json()["detail"].lower() or "no" in response.json()["detail"].lower()
    assert len(list(upload_dir.glob("*.csv"))) == 0


def test_malformed_csv_rejected(client: TestClient, isolated_service) -> None:
    """Requirement 6: Reject malformed CSVs with inconsistent delimiters or broken columns."""
    _, upload_dir = isolated_service
    # Inconsistent number of columns across rows
    malformed_content = (
        "col_a,col_b\n"
        "1,2,extra_column_value,another_unexpected\n"
        "3,4\n"
    )
    files = {"file": ("malformed.csv", io.BytesIO(malformed_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 400
    assert "malformed" in response.json()["detail"].lower() or "parse" in response.json()["detail"].lower()
    assert len(list(upload_dir.glob("*.csv"))) == 0


def test_csv_with_headers_but_no_data_rows_rejected(client: TestClient, isolated_service) -> None:
    """Requirement 7: Reject CSVs containing headers but zero data rows."""
    _, upload_dir = isolated_service
    header_only = "col1,col2,col3\n"
    files = {"file": ("headers_only.csv", io.BytesIO(header_only.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 400
    assert "no data rows" in response.json()["detail"].lower()
    assert len(list(upload_dir.glob("*.csv"))) == 0


def test_oversized_upload_rejected(client: TestClient, isolated_service) -> None:
    """Requirement 8: Enforce maximum upload size limit during streaming."""
    _, upload_dir = isolated_service
    # Configure custom service with a tiny 128-byte limit
    tiny_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=128)
    app.dependency_overrides[get_dataset_service] = lambda: tiny_service

    large_content = "col_a,col_b,col_c\n" + ("100,200,300\n" * 50)  # > 500 bytes
    files = {"file": ("large.csv", io.BytesIO(large_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 413
    assert "exceeds" in response.json()["detail"].lower()
    assert len(list(upload_dir.glob("*.csv"))) == 0


def test_missing_values_counted_correctly(client: TestClient) -> None:
    """Requirement 9: Accurately count missing (NaN/null/empty) values per column."""
    csv_content = (
        "id,age,score,category\n"
        "1,,95.5,A\n"
        "2,25,,B\n"
        "3,,,C\n"
        "4,40,88.0,\n"
    )
    files = {"file": ("missing_vals.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 201
    data = response.json()
    assert data["rows"] == 4
    assert data["columns"] == 4
    assert data["missing_values"] == {
        "id": 0,
        "age": 2,
        "score": 2,
        "category": 1,
    }


def test_duplicate_rows_counted_correctly(client: TestClient) -> None:
    """Requirement 10: Accurately identify and count identical duplicate data rows."""
    csv_content = (
        "feat_a,feat_b\n"
        "1,100\n"
        "1,100\n"  # Duplicate 1
        "2,200\n"
        "1,100\n"  # Duplicate 2
        "3,300\n"
    )
    files = {"file": ("duplicates.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 201
    data = response.json()
    assert data["rows"] == 5
    assert data["duplicate_rows"] == 2


def test_path_traversal_filename_prevented(client: TestClient, isolated_service) -> None:
    """Requirement 11: Traversal strings in filenames are sanitized and stored inside upload directory."""
    _, upload_dir = isolated_service
    csv_content = "id,val\n1,10\n2,20\n"
    traversal_filename = "../../../../etc/passwd.csv"
    files = {"file": (traversal_filename, io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 201
    data = response.json()
    # Display name must be sanitized without path traversal sequences
    assert data["filename"] == "passwd.csv"
    # Saved file must be inside upload_dir under its UUID
    assert (upload_dir / f"{data['dataset_id']}.csv").exists()


def test_failed_uploads_leave_no_partial_files(client: TestClient, isolated_service) -> None:
    """Requirement 12: Verify cleanup ensures zero partial or orphan files after failures."""
    _, upload_dir = isolated_service
    bad_payloads = [
        ("bad_ext.exe", b"hello world"),
        ("empty.csv", b""),
        ("whitespace.csv", b"   \n  \t  "),
        ("broken.csv", b"a,b\n1,2,3,4,5\n6\n"),
        ("no_rows.csv", b"col1,col2\n"),
    ]
    for filename, content in bad_payloads:
        files = {"file": (filename, io.BytesIO(content), "text/csv")}
        client.post("/api/v1/datasets/upload", files=files)

    # Absolutely no leftover files should remain in the upload directory
    remaining_files = list(upload_dir.iterdir())
    assert len(remaining_files) == 0


def test_response_schema_does_not_expose_raw_rows_or_server_paths(client: TestClient, isolated_service) -> None:
    """Requirement 13: Response profile must not leak raw dataset rows or server filesystem paths."""
    _, upload_dir = isolated_service
    secret_value = "SUPER_SECRET_PATIENT_RECORD_XYZ"
    csv_content = f"id,medical_record\n1,{secret_value}\n2,NORMAL_RECORD\n"
    files = {"file": ("sensitive.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)

    assert response.status_code == 201
    response_text = response.text

    # Verify no raw row content leaks into response
    assert secret_value not in response_text
    assert "NORMAL_RECORD" not in response_text

    # Verify no absolute server paths leak into response
    assert str(upload_dir) not in response_text
    assert str(upload_dir.resolve()) not in response_text

    # Verify keys strictly conform to public schema
    data = response.json()
    forbidden_keys = {"data", "rows_data", "raw", "path", "file_path", "absolute_path", "storage_path"}
    assert forbidden_keys.isdisjoint(data.keys())
