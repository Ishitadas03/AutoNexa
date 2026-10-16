"""Automated tests for AutoNexa Step 7: Model Export, Safe Loading & Prediction API."""

import io
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np

from app.main import app
from app.schemas.prediction import ExperimentInspectionResponse, PredictionResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.prediction_service import (
    PredictionService,
    get_prediction_service,
    sanitize_scalar,
)
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def isolated_prediction_env(tmp_path: Path):
    """Fixture providing isolated temporary directories for dataset uploads and experiment artifacts."""
    upload_dir = tmp_path / "pred_uploads"
    experiments_dir = tmp_path / "pred_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service

    client = TestClient(app)
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def train_toy_classifier(client: TestClient) -> str:
    """Helper to train a toy classification experiment and return experiment_id."""
    # 40 rows with 2 features: age (numeric), city (categorical), and target
    rows = ["age,city,target"]
    for i in range(40):
        age = 20 + i
        city = "CityA" if i % 2 == 0 else "CityB"
        label = "yes" if i >= 20 else "no"
        rows.append(f"{age},{city},{label}")
    csv_data = "\n".join(rows) + "\n"

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_class.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    train_res = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "task_type": "classification", "models": ["logistic_regression", "dummy"]},
    )
    assert train_res.status_code == 201
    return train_res.json()["experiment_id"]


def train_toy_regressor(client: TestClient) -> str:
    """Helper to train a toy regression experiment and return experiment_id."""
    rows = ["sqft,rooms,price"]
    for i in range(40):
        sqft = 500 + i * 50
        rooms = 1 + (i % 3)
        price = 100000.0 + (sqft * 150.0) + (rooms * 20000.0)
        rows.append(f"{sqft},{rooms},{price}")
    csv_data = "\n".join(rows) + "\n"

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_reg.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    train_res = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "price", "task_type": "regression", "models": ["linear_regression", "dummy"]},
    )
    assert train_res.status_code == 201
    return train_res.json()["experiment_id"]


def test_experiment_inspection_success(isolated_prediction_env):
    """Phase 2: Inspect a successfully trained experiment and its artifact metadata."""
    client, _, exp_dir = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    res = client.get(f"/api/v1/experiments/{exp_id}")
    assert res.status_code == 200
    data = res.json()

    inspection = ExperimentInspectionResponse(**data)
    assert inspection.experiment_id == exp_id
    assert inspection.status == "completed"
    assert inspection.target_column == "target"
    assert inspection.task_type in ("binary_classification", "classification")
    assert inspection.best_model is not None
    assert inspection.features_count == 2
    assert sorted(inspection.feature_names) == ["age", "city"]
    assert inspection.artifact_availability.model_file_exists is True
    assert inspection.artifact_availability.model_size_bytes > 0
    assert inspection.artifact_availability.model_sha256 is not None
    assert len(inspection.artifact_availability.model_sha256) == 64

    # Security check: No absolute server filesystem paths in response
    resp_text = res.text
    assert str(exp_dir) not in resp_text
    assert "C:\\" not in resp_text


def test_unknown_and_invalid_experiment_inspection(isolated_prediction_env):
    """Phase 2: Proper HTTP error handling for unknown, missing, and invalid experiments."""
    client, _, exp_dir = isolated_prediction_env

    # 1. Unknown experiment ID
    res = client.get("/api/v1/experiments/nonexistent-uuid-12345")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()

    # 2. Path traversal attempts
    res_trav = client.get("/api/v1/experiments/..%2F..%2Fsecret")
    assert res_trav.status_code in (400, 404)

    # 3. Incomplete experiment (directory with no metadata.json)
    dummy_dir = exp_dir / "incomplete-exp-dir"
    dummy_dir.mkdir(parents=True, exist_ok=True)
    res_incomplete = client.get("/api/v1/experiments/incomplete-exp-dir")
    assert res_incomplete.status_code == 404
    assert "metadata" in res_incomplete.json()["detail"].lower()

    # 4. Corrupted metadata file
    corrupt_dir = exp_dir / "corrupt-exp-dir"
    corrupt_dir.mkdir(parents=True, exist_ok=True)
    (corrupt_dir / "metadata.json").write_text("{bad json...", encoding="utf-8")
    res_corrupt = client.get("/api/v1/experiments/corrupt-exp-dir")
    assert res_corrupt.status_code == 500
    assert "corrupted" in res_corrupt.json()["detail"].lower()


def test_classification_prediction_with_probabilities(isolated_prediction_env):
    """Phase 4: Generate predictions and class probabilities for classification records."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    payload = {
        "records": [
            {"age": 22, "city": "CityA"},
            {"age": 55, "city": "CityB"},
        ]
    }
    res = client.post(f"/api/v1/experiments/{exp_id}/predict", json=payload)
    assert res.status_code == 200

    data = res.json()
    pred_resp = PredictionResponse(**data)
    assert pred_resp.experiment_id == exp_id
    assert pred_resp.prediction_count == 2
    assert len(pred_resp.predictions) == 2
    assert set(pred_resp.predictions).issubset({"yes", "no"})

    # Check probabilities
    assert pred_resp.probabilities is not None
    assert len(pred_resp.probabilities) == 2
    for p_dist in pred_resp.probabilities:
        assert "yes" in p_dist and "no" in p_dist
        assert sum(p_dist.values()) == pytest.approx(1.0, rel=1e-2)


def test_regression_prediction(isolated_prediction_env):
    """Phase 4: Generate numeric predictions for regression records."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_regressor(client)

    payload = {
        "records": [
            {"sqft": 750, "rooms": 2},
            {"sqft": 1200, "rooms": 3},
        ]
    }
    res = client.post(f"/api/v1/experiments/{exp_id}/predict", json=payload)
    assert res.status_code == 200

    data = res.json()
    pred_resp = PredictionResponse(**data)
    assert pred_resp.task_type == "regression"
    assert pred_resp.prediction_count == 2
    assert len(pred_resp.predictions) == 2
    assert all(isinstance(p, (float, int)) for p in pred_resp.predictions)
    # Price should increase with sqft
    assert pred_resp.predictions[1] > pred_resp.predictions[0]
    # Regression does not return probabilities
    assert pred_resp.probabilities is None


def test_missing_feature_column_rejected(isolated_prediction_env):
    """Phase 4: Reject request if any required feature column is omitted."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # Missing "city" column
    payload = {
        "records": [
            {"age": 30},
        ]
    }
    res = client.post(f"/api/v1/experiments/{exp_id}/predict", json=payload)
    assert res.status_code == 400
    assert "missing required feature column" in res.json()["detail"].lower()
    assert "city" in res.json()["detail"]


def test_unexpected_feature_column_rejected(isolated_prediction_env):
    """Phase 4: Reject request if unexpected/unregistered columns are passed."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    payload = {
        "records": [
            {"age": 30, "city": "CityA", "unexpected_extra": 123},
        ]
    }
    res = client.post(f"/api/v1/experiments/{exp_id}/predict", json=payload)
    assert res.status_code == 400
    assert "unexpected feature column" in res.json()["detail"].lower()
    assert "unexpected_extra" in res.json()["detail"]


def test_feature_ordering_resilience(isolated_prediction_env):
    """Phase 4: Verify arbitrary key order in input records is sorted into training order."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # Input 1: age first, city second
    res1 = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"age": 28, "city": "CityA"}]},
    )
    # Input 2: city first, age second
    res2 = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"city": "CityA", "age": 28}]},
    )

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["predictions"] == res2.json()["predictions"]
    assert res1.json()["probabilities"] == res2.json()["probabilities"]


def test_missing_values_and_unseen_categories(isolated_prediction_env):
    """Phase 4: Preprocessing pipeline handles None/missing values and unseen categories."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # age is None (tested by imputer), city is "Paris" (unseen category during training)
    payload = {
        "records": [
            {"age": None, "city": "Paris"},
            {"age": 35, "city": "Berlin"},
        ]
    }
    res = client.post(f"/api/v1/experiments/{exp_id}/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["predictions"]) == 2
    assert data["probabilities"] is not None


def test_corrupt_and_missing_artifact_handling(isolated_prediction_env):
    """Phase 3: Gracefully handle missing or corrupted best_model.joblib."""
    client, _, exp_dir = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    model_file = exp_dir / exp_id / "best_model.joblib"
    assert model_file.is_file()

    # 1. Corrupt model file
    model_file.write_bytes(b"garbage binary data not a pickle")
    res_corrupt = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"age": 30, "city": "CityA"}]},
    )
    assert res_corrupt.status_code == 500
    assert "corrupted or incompatible" in res_corrupt.json()["detail"].lower()

    # 2. Missing model file
    model_file.unlink()
    res_missing = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"age": 30, "city": "CityA"}]},
    )
    assert res_missing.status_code == 404
    assert "not found" in res_missing.json()["detail"].lower()


def test_oversized_prediction_request_rejected(isolated_prediction_env):
    """Phase 4: Reject payloads with 0 records or exceeding max_prediction_records limit."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # Empty records list
    res_empty = client.post(f"/api/v1/experiments/{exp_id}/predict", json={"records": []})
    assert res_empty.status_code == 422 or res_empty.status_code == 400

    # Oversized list > 1000
    huge_records = [{"age": 25, "city": "CityA"} for _ in range(1001)]
    res_huge = client.post(f"/api/v1/experiments/{exp_id}/predict", json={"records": huge_records})
    assert res_huge.status_code == 400
    assert "exceeds maximum" in res_huge.json()["detail"].lower()


def test_no_retraining_during_inference(isolated_prediction_env):
    """Phase 4: Verify model pipeline is never retrained during inference."""
    client, _, exp_dir = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    model_path = exp_dir / exp_id / "best_model.joblib"
    initial_mtime = model_path.stat().st_mtime_ns

    # Execute multiple prediction requests
    for age in [25, 35, 45, 55]:
        res = client.post(
            f"/api/v1/experiments/{exp_id}/predict",
            json={"records": [{"age": age, "city": "CityA"}]},
        )
        assert res.status_code == 200

    # Ensure model file was not modified or rewritten
    final_mtime = model_path.stat().st_mtime_ns
    assert initial_mtime == final_mtime


def test_batch_csv_prediction_success(isolated_prediction_env):
    """Phase 5: Execute batch prediction on uploaded CSV file and download enriched CSV."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # Valid CSV without target column
    csv_input = "age,city\n30,CityA\n45,CityB\n60,CityA\n"
    res = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("batch_in.csv", io.BytesIO(csv_input.encode("utf-8")), "text/csv")},
    )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers["content-disposition"]

    csv_text = res.text
    lines = csv_text.strip().splitlines()
    header = lines[0].split(",")
    assert "predicted_target" in header
    # Data rows preserved
    assert len(lines) == 4


def test_batch_csv_prediction_tolerates_target_column(isolated_prediction_env):
    """Phase 5: Documented policy: target column in CSV input is safely ignored."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # Input CSV that already contains "target" column (e.g. from holdout testing)
    csv_input = "age,city,target\n30,CityA,yes\n45,CityB,no\n"
    res = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("batch_with_target.csv", io.BytesIO(csv_input.encode("utf-8")), "text/csv")},
    )
    assert res.status_code == 200
    assert "predicted_target" in res.text


def test_batch_csv_prediction_validation_errors(isolated_prediction_env):
    """Phase 5: Reject invalid CSV files (empty, malformed, missing columns, unexpected columns)."""
    client, _, _ = isolated_prediction_env
    exp_id = train_toy_classifier(client)

    # 1. Non-CSV filename
    res_non_csv = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("data.txt", io.BytesIO(b"age,city\n30,CityA"), "text/plain")},
    )
    assert res_non_csv.status_code == 400

    # 2. Empty CSV
    res_empty = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )
    assert res_empty.status_code == 400

    # 3. Missing feature column
    res_missing = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("missing.csv", io.BytesIO(b"age\n30\n40\n"), "text/csv")},
    )
    assert res_missing.status_code == 400
    assert "missing required feature column" in res_missing.json()["detail"].lower()

    # 4. Unexpected column
    res_unexpected = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("extra.csv", io.BytesIO(b"age,city,unknown_col\n30,CityA,xyz\n"), "text/csv")},
    )
    assert res_unexpected.status_code == 400
    assert "unexpected column" in res_unexpected.json()["detail"].lower()


def test_non_finite_scalar_sanitization():
    """Unit test for sanitize_scalar handling NaN, Inf, and numpy types."""
    assert sanitize_scalar(float("nan")) is None
    assert sanitize_scalar(float("inf")) is None
    assert sanitize_scalar(float("-inf")) is None
    assert sanitize_scalar(np.int64(42)) == 42
    assert sanitize_scalar(np.float64(3.14)) == 3.14
    assert sanitize_scalar(np.array([1, 2, 3])) == [1, 2, 3]
    assert sanitize_scalar("hello") == "hello"
