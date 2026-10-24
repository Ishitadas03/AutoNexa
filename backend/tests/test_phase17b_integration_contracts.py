"""Phase 17B Integration Contract and Regression Tests.

Validates the full frontend-to-backend integration contracts:
1. TrainingResponse best_score propagation and matching winning model score.
2. Regression metrics contract (rmse, mae, r2) without unsupported metrics.
3. Prediction error handling and message sanitization (no internal path disclosure).
4. Batch prediction error responses with clear detail payloads.
5. Health response payload contract matching frontend TypeScript interfaces.
"""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.health import HealthResponse
from app.schemas.training import TrainingResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.prediction_service import PredictionService, get_prediction_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def isolated_contracts_env(tmp_path: Path):
    """Fixture providing isolated temporary directories for contract verification."""
    upload_dir = tmp_path / "contracts_uploads"
    experiments_dir = tmp_path / "contracts_experiments"
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

    client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def test_health_response_schema_contract(isolated_contracts_env):
    """Verify health endpoint returns status, app_name, and version for frontend consumption."""
    client, _, _ = isolated_contracts_env
    res = client.get("/api/v1/health")
    assert res.status_code == 200

    data = res.json()
    assert "status" in data
    assert "app_name" in data
    assert "version" in data

    validated = HealthResponse.model_validate(data)
    assert validated.status == "healthy"
    assert validated.app_name == "AutoNexa"
    assert validated.version == "0.1.0"


def test_training_response_best_score_contract(isolated_contracts_env):
    """Verify TrainingResponse includes best_score matching the winning model's metric."""
    client, _, _ = isolated_contracts_env

    # 1. Upload synthetic classification dataset
    csv_lines = ["age,income,churn"]
    for i in range(50):
        age = 20 + i
        income = 30000 + (i * 1000)
        churn = "yes" if i % 2 == 0 else "no"
        csv_lines.append(f"{age},{income},{churn}")
    csv_bytes = "\n".join(csv_lines).encode("utf-8")

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_churn.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # 2. Train AutoML classification models
    train_payload = {
        "target_column": "churn",
        "task_type": "classification",
        "evaluation_strategy": "holdout",
        "primary_metric": "f1_weighted",
        "test_size": 0.2,
        "models": ["dummy", "logistic_regression"],
    }
    train_res = client.post(f"/api/v1/datasets/{dataset_id}/train", json=train_payload)
    assert train_res.status_code == 201
    data = train_res.json()

    # Validate against Pydantic schema
    validated = TrainingResponse.model_validate(data)
    assert validated.best_model is not None
    assert validated.best_score is not None
    assert isinstance(validated.best_score, float)

    # Cross-reference with the winning model's primary metric
    best_eval = next(m for m in validated.models_evaluated if m.model_id == validated.best_model)
    expected_score = best_eval.metrics.get(validated.primary_metric)
    assert validated.best_score == pytest.approx(expected_score, rel=1e-5)


def test_regression_metrics_contract(isolated_contracts_env):
    """Verify regression training contract supports rmse, mae, r2 without unsupported metrics."""
    client, _, _ = isolated_contracts_env

    # 1. Upload synthetic regression dataset
    csv_lines = ["feature_x,feature_y,target_price"]
    for i in range(50):
        fx = float(i)
        fy = float(i * 2.5)
        price = 100.0 + (fx * 10.0) + (fy * 5.0)
        csv_lines.append(f"{fx},{fy},{price}")
    csv_bytes = "\n".join(csv_lines).encode("utf-8")

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_price.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    # 2. Train AutoML regression with rmse as primary metric
    train_payload = {
        "target_column": "target_price",
        "task_type": "regression",
        "evaluation_strategy": "holdout",
        "primary_metric": "rmse",
        "test_size": 0.2,
        "models": ["dummy", "linear_regression", "ridge"],
    }
    train_res = client.post(f"/api/v1/datasets/{dataset_id}/train", json=train_payload)
    assert train_res.status_code == 201
    data = train_res.json()

    validated = TrainingResponse.model_validate(data)
    assert validated.best_score is not None
    assert validated.primary_metric == "rmse"
    assert validated.primary_metric_greater_is_better is False

    for model_res in validated.models_evaluated:
        if model_res.status == "successful":
            assert "rmse" in model_res.metrics
            assert "mae" in model_res.metrics
            assert "r2" in model_res.metrics


def test_prediction_error_handling_and_sanitization(isolated_contracts_env):
    """Verify prediction error responses return clear detail without revealing filesystem paths."""
    client, _, _ = isolated_contracts_env

    # 1. Nonexistent experiment returns 404 with clean detail
    res_404 = client.post(
        "/api/v1/experiments/exp_nonexistent/predict",
        json={"records": [{"age": 30, "income": 50000}]},
    )
    assert res_404.status_code == 404
    detail = res_404.json().get("detail", "")
    assert "not found" in detail.lower() or "experiment" in detail.lower()
    # Ensure no local directory path is leaked
    assert "C:" not in detail
    assert "contracts_experiments" not in detail

    # 2. Invalid prediction payload format returns 422
    res_422 = client.post(
        "/api/v1/experiments/exp_nonexistent/predict",
        json={"invalid_key": []},
    )
    assert res_422.status_code == 422


def test_batch_prediction_csv_error_contract(isolated_contracts_env):
    """Verify batch CSV prediction validates input and returns structured 400 on bad data."""
    client, _, _ = isolated_contracts_env

    # 1. Upload and train
    csv_lines = ["x1,x2,label"]
    for i in range(40):
        csv_lines.append(f"{i},{i*2},{'A' if i % 2 == 0 else 'B'}")
    csv_bytes = "\n".join(csv_lines).encode("utf-8")

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_cls.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    train_res = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "label",
            "task_type": "classification",
            "models": ["dummy", "logistic_regression"],
        },
    )
    assert train_res.status_code == 201
    exp_id = train_res.json()["experiment_id"]

    # 2. Batch score with an empty CSV file
    empty_res = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )
    assert empty_res.status_code == 400
    assert "detail" in empty_res.json()
    assert "empty" in empty_res.json()["detail"].lower()

    # 3. Batch score with a CSV missing required feature columns
    bad_cols_csv = b"wrong_col_a,wrong_col_b\n1,2\n3,4\n"
    bad_res = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("missing_cols.csv", io.BytesIO(bad_cols_csv), "text/csv")},
    )
    assert bad_res.status_code == 400
    assert "detail" in bad_res.json()
    assert "missing" in bad_res.json()["detail"].lower() or "feature" in bad_res.json()["detail"].lower()
