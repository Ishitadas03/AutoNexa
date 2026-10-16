"""Automated test suite for dataset intelligence, data quality auditing, and ML task detection."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.analysis import AnalysisResponse, TaskType
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def isolated_env(tmp_path: Path):
    """Fixture providing isolated temporary storage for dataset uploads and analysis."""
    temp_upload_dir = tmp_path / "test_analysis_uploads"
    temp_upload_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=temp_upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=temp_upload_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service

    test_client = TestClient(app)
    yield test_client, temp_upload_dir

    app.dependency_overrides.clear()


def upload_sample_csv(client: TestClient, csv_content: str, filename: str = "sample.csv") -> str:
    """Helper to upload a sample CSV and return the assigned dataset_id."""
    files = {"file": (filename, io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201
    return response.json()["dataset_id"]


def test_analysis_of_valid_uploaded_dataset(isolated_env) -> None:
    """Requirement 1: Complete intelligence analysis on a valid uploaded dataset."""
    client, _ = isolated_env
    csv_data = (
        "user_id,age,income,department,churn\n"
        "101,25,50000.0,sales,0\n"
        "102,30,62000.0,engineering,1\n"
        "103,45,95000.0,sales,0\n"
        "104,38,71000.0,marketing,0\n"
    )
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200

    data = response.json()
    validated = AnalysisResponse.model_validate(data)

    assert validated.dataset_id == dataset_id
    assert validated.rows == 4
    assert validated.columns == 5
    assert len(validated.column_summaries) == 5
    assert "income" in validated.numeric_columns
    assert "department" in validated.categorical_columns
    assert validated.duplicate_rows_count == 0

    # User_id should be inferred as an identifier
    user_id_summary = next(s for s in validated.column_summaries if s.name == "user_id")
    assert user_id_summary.role.value == "identifier"

    # Churn should be a candidate target
    assert any(c.column_name == "churn" for c in validated.candidate_targets)


def test_unknown_dataset_id_returns_404(isolated_env) -> None:
    """Requirement 2: Return HTTP 404 for non-existent dataset identifiers."""
    client, _ = isolated_env
    fake_id = "00000000-0000-0000-0000-000000000000"
    response = client.post(f"/api/v1/datasets/{fake_id}/analyze")
    assert response.status_code == 404
    assert f"'{fake_id}' not found" in response.json()["detail"].lower()


def test_missing_target_selection_diagnostics_only(isolated_env) -> None:
    """Requirement 3: When no target is selected, return diagnostics without a task recommendation."""
    client, _ = isolated_env
    csv_data = (
        "col1,col2,price\n"
        "10,A,100.0\n"
        "20,B,200.0\n"
        "30,C,300.0\n"
    )
    dataset_id = upload_sample_csv(client, csv_data)

    # Empty payload
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze", json={})
    assert response.status_code == 200
    data = response.json()

    assert data["task_recommendation"] is None
    assert len(data["candidate_targets"]) >= 1
    assert data["candidate_targets"][0]["column_name"] == "price"


def test_valid_classification_target(isolated_env) -> None:
    """Requirement 4: Inferred binary and multiclass classification targets."""
    client, _ = isolated_env
    # Binary classification target
    binary_csv = (
        "feature_1,feature_2,label\n"
        "1.1,foo,yes\n"
        "2.2,bar,no\n"
        "3.3,foo,yes\n"
        "4.4,bar,no\n"
    )
    dataset_id = upload_sample_csv(client, binary_csv)
    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "label"},
    )
    assert response.status_code == 200
    rec = response.json()["task_recommendation"]
    assert rec["task_type"] == TaskType.BINARY_CLASSIFICATION.value
    assert rec["confidence"] == "high"

    # Multiclass classification target
    multiclass_csv = (
        "feature_1,category\n"
        "1.0,cat\n"
        "2.0,dog\n"
        "3.0,bird\n"
        "4.0,dog\n"
    )
    multi_id = upload_sample_csv(client, multiclass_csv)
    response_multi = client.post(
        f"/api/v1/datasets/{multi_id}/analyze",
        json={"target_column": "category"},
    )
    assert response_multi.status_code == 200
    rec_multi = response_multi.json()["task_recommendation"]
    assert rec_multi["task_type"] == TaskType.MULTICLASS_CLASSIFICATION.value


def test_valid_regression_target(isolated_env) -> None:
    """Requirement 5: Continuous numeric target inferred as regression."""
    client, _ = isolated_env
    regression_csv = "sqft,bedrooms,price\n" + "\n".join(
        f"{1000 + i * 50},{2 + i % 3},{200000.0 + i * 15320.5}" for i in range(25)
    )
    dataset_id = upload_sample_csv(client, regression_csv)
    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "price"},
    )
    assert response.status_code == 200
    rec = response.json()["task_recommendation"]
    assert rec["task_type"] == TaskType.REGRESSION.value
    assert rec["confidence"] == "high"


def test_explicit_task_override(isolated_env) -> None:
    """Requirement 6: User explicit task override between classification and regression."""
    client, _ = isolated_env
    # Binary numeric target (normally inferred as binary classification)
    csv_data = (
        "x1,x2,binary_num\n"
        "1.0,2.0,0\n"
        "3.0,4.0,1\n"
        "5.0,6.0,0\n"
        "7.0,8.0,1\n"
    )
    dataset_id = upload_sample_csv(client, csv_data)

    # Override to regression
    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "binary_num", "task_override": "regression"},
    )
    assert response.status_code == 200
    rec = response.json()["task_recommendation"]
    assert rec["task_type"] == TaskType.REGRESSION.value
    assert rec["confidence"] == "overridden"

    # Incompatible override (regression on string labels)
    string_csv = "feat,label\n1.0,cat\n2.0,dog\n3.0,cat\n"
    str_id = upload_sample_csv(client, string_csv)
    bad_override = client.post(
        f"/api/v1/datasets/{str_id}/analyze",
        json={"target_column": "label", "task_override": "regression"},
    )
    assert bad_override.status_code == 400
    assert "incompatible" in bad_override.json()["detail"].lower()


def test_invalid_target_column_rejected(isolated_env) -> None:
    """Requirement 7: Specifying a target column that does not exist returns HTTP 400."""
    client, _ = isolated_env
    csv_data = "col1,col2\n1,2\n3,4\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "non_existent_column"},
    )
    assert response.status_code == 400
    assert "not exist" in response.json()["detail"].lower()


def test_constant_target_rejected(isolated_env) -> None:
    """Requirement 8: Targets with only 1 unique value are rejected as non-modelable."""
    client, _ = isolated_env
    csv_data = "feat,target\n10,1\n20,1\n30,1\n40,1\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "target"},
    )
    assert response.status_code == 400
    assert "constant" in response.json()["detail"].lower()


def test_all_null_target_rejected(isolated_env) -> None:
    """Requirement 9: Targets with 100% missing values are rejected as non-modelable."""
    client, _ = isolated_env
    csv_data = "feat,empty_target\n10,\n20,\n30,\n40,\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "empty_target"},
    )
    assert response.status_code == 400
    assert "missing" in response.json()["detail"].lower() or "null" in response.json()["detail"].lower()


def test_missing_value_statistics(isolated_env) -> None:
    """Requirement 10: Accurate column-level missing value counts and percentages."""
    client, _ = isolated_env
    csv_data = (
        "a,b,c\n"
        "1,,10\n"
        "2,,20\n"
        ",,30\n"
        "4,foo,\n"
    )
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200
    summaries = {s["name"]: s for s in response.json()["column_summaries"]}

    assert summaries["a"]["missing_count"] == 1
    assert summaries["a"]["missing_percentage"] == 25.0
    assert summaries["b"]["missing_count"] == 3
    assert summaries["b"]["missing_percentage"] == 75.0
    assert summaries["c"]["missing_count"] == 1
    assert summaries["c"]["missing_percentage"] == 25.0

    # Verify critical missingness warning generated for column b (> 50%)
    warnings = response.json()["quality_warnings"]
    assert any(w["code"] == "CRITICAL_MISSINGNESS" and w["column"] == "b" for w in warnings)


def test_constant_and_near_constant_detection(isolated_env) -> None:
    """Requirement 11: Flagging constant and near-constant columns."""
    client, _ = isolated_env
    # 20 rows: const_col is 100% 'X', near_const is 95% 'A' (19/20) and 5% 'B'
    rows = ["val,const_col,near_const"]
    for i in range(20):
        nc = "B" if i == 0 else "A"
        rows.append(f"{i},X,{nc}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200
    data = response.json()
    summaries = {s["name"]: s for s in data["column_summaries"]}

    assert summaries["const_col"]["is_constant"] is True
    assert summaries["near_const"]["is_near_constant"] is True

    warnings = data["quality_warnings"]
    assert any(w["code"] == "CONSTANT_COLUMN" and w["column"] == "const_col" for w in warnings)
    assert any(w["code"] == "NEAR_CONSTANT_COLUMN" and w["column"] == "near_const" for w in warnings)


def test_high_cardinality_detection(isolated_env) -> None:
    """Requirement 12: High-cardinality categorical columns generate diagnostic warnings."""
    client, _ = isolated_env
    # Generate categorical column with 60 distinct categories
    rows = ["num,category_col"]
    for i in range(60):
        rows.append(f"{i},cat_value_{i}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200
    data = response.json()
    cat_summary = next(s for s in data["column_summaries"] if s["name"] == "category_col")

    assert cat_summary["is_high_cardinality"] is True
    warnings = data["quality_warnings"]
    assert any(w["code"] == "HIGH_CARDINALITY" and w["column"] == "category_col" for w in warnings)


def test_class_imbalance_warning(isolated_env) -> None:
    """Requirement 13: Detect severe class imbalance in classification targets."""
    client, _ = isolated_env
    # 100 rows: 96 'benign' (96%) and 4 'malignant' (4% < 10%)
    rows = ["feat,diagnosis"]
    for i in range(100):
        diag = "malignant" if i < 4 else "benign"
        rows.append(f"{i * 1.5},{diag}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "diagnosis"},
    )
    assert response.status_code == 200
    data = response.json()
    rec = data["task_recommendation"]

    assert rec["is_class_imbalanced"] is True
    assert rec["minority_class_percentage"] == 4.0

    warnings = data["quality_warnings"]
    assert any(w["code"] == "CLASS_IMBALANCE" and w["column"] == "diagnosis" for w in warnings)


def test_small_dataset_handling(isolated_env) -> None:
    """Requirement 14: Handles minimal small datasets safely without division by zero."""
    client, _ = isolated_env
    csv_data = "a,b\n1,2\n3,4\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "b"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rows"] == 2
    assert data["columns"] == 2


def test_no_raw_rows_or_absolute_paths_in_response(isolated_env) -> None:
    """Requirement 15: Verification that response payload never exposes raw rows or server paths."""
    client, upload_dir = isolated_env
    secret_value = "CONFIDENTIAL_DIAGNOSIS_9999"
    csv_data = f"id,feature,secret\n1,10.0,{secret_value}\n2,20.0,PUBLIC_VALUE\n"
    dataset_id = upload_sample_csv(client, csv_data)

    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200
    text_content = response.text

    # Verify secret string never appears in response
    assert secret_value not in text_content
    # Verify server filesystem path never appears in response
    assert str(upload_dir) not in text_content
    assert str(upload_dir.resolve()) not in text_content
