"""Automated test suite for AutoNexa Phase 8: Prediction Error Analysis."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.error_analysis import (
    ClassificationErrorAnalysis,
    ErrorAnalysisResponse,
    RegressionErrorAnalysis,
)
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.error_analysis_service import (
    ErrorAnalysisService,
    get_error_analysis_service,
)
from app.services.automl.prediction_service import (
    PredictionService,
    get_prediction_service,
)
from app.services.automl.training_service import (
    TrainingService,
    get_training_service,
)
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def error_env(tmp_path: Path):
    """Fixture providing isolated environment for error analysis tests."""
    upload_dir = tmp_path / "err_uploads"
    experiments_dir = tmp_path / "err_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    error_analysis_service = ErrorAnalysisService(upload_dir=upload_dir, experiments_dir=experiments_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_error_analysis_service] = lambda: error_analysis_service

    client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def train_binary_classification(client: TestClient) -> str:
    """Helper to train a binary classification model with 50 rows."""
    rows = ["age,credit_score,card_type,default"]
    for i in range(50):
        age = 22 + (i % 45)
        credit = 550 + (i * 5)
        card = "Silver" if i % 2 == 0 else "Gold"
        label = "yes" if (credit < 650 or age < 25) else "no"
        rows.append(f"{age},{credit},{card},{label}")
    csv_content = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("credit_data.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert up.status_code == 201
    dataset_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "default",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.2,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert tr.status_code == 201
    return tr.json()["experiment_id"]


def train_multiclass_classification(client: TestClient) -> str:
    """Helper to train a 3-class classification experiment with 60 rows."""
    rows = ["feature1,feature2,category,tier"]
    for i in range(60):
        f1 = float(i * 1.5)
        f2 = float((i % 10) * 2.0)
        cat = "A" if i % 2 == 0 else "B"
        if i < 20:
            tier = "bronze"
        elif i < 40:
            tier = "silver"
        else:
            tier = "gold"
        rows.append(f"{f1},{f2},{cat},{tier}")
    csv_content = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("multi_data.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert up.status_code == 201
    dataset_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "tier",
            "task_type": "classification",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert tr.status_code == 201
    return tr.json()["experiment_id"]


def train_regression_model(client: TestClient) -> str:
    """Helper to train a regression experiment."""
    rows = ["mileage,year,fuel_type,price"]
    for i in range(50):
        mileage = 10000 + (i * 2000)
        year = 2010 + (i % 12)
        fuel = "petrol" if i % 2 == 0 else "diesel"
        price = 15000 - (mileage * 0.05) + (year * 300)
        rows.append(f"{mileage},{year},{fuel},{price}")
    csv_content = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("car_prices.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert up.status_code == 201
    dataset_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "price",
            "task_type": "regression",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.2,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert tr.status_code == 201
    return tr.json()["experiment_id"]


def test_classification_error_analysis_holdout_test(error_env) -> None:
    """Requirement 3: Binary classification error analysis on independent holdout test split."""
    client, _, _ = error_env
    exp_id = train_binary_classification(client)

    res = client.post(f"/api/v1/experiments/{exp_id}/error-analysis", json={"split": "test"})
    assert res.status_code == 200
    data = res.json()

    obj = ErrorAnalysisResponse(**data)
    assert obj.experiment_id == exp_id
    assert obj.is_independent_test_evaluation is True
    assert obj.evaluation_split == "test"
    assert "independent" in obj.evaluation_notice.lower()

    cls_diag = obj.classification_analysis
    assert cls_diag is not None
    assert 0.0 <= cls_diag.accuracy <= 1.0
    assert len(cls_diag.class_labels) == 2
    assert len(cls_diag.confusion_matrix) == 2
    assert len(cls_diag.confusion_matrix[0]) == 2
    assert len(cls_diag.class_metrics) == 2

    # Check each class has precision, recall, false positives, and false negatives
    for cm in cls_diag.class_metrics:
        assert cm.support >= 0
        assert cm.false_positives >= 0
        assert cm.false_negatives >= 0

    assert cls_diag.class_imbalance_ratio is not None
    assert cls_diag.class_imbalance_ratio >= 1.0


def test_classification_training_leakage_warning(error_env) -> None:
    """Requirement 3 & 5: Clear flagging when evaluating on training data to prevent leakage misunderstanding."""
    client, _, _ = error_env
    exp_id = train_binary_classification(client)

    res = client.post(f"/api/v1/experiments/{exp_id}/error-analysis", json={"split": "train"})
    assert res.status_code == 200
    data = res.json()

    assert data["is_independent_test_evaluation"] is False
    assert data["evaluation_split"] == "train"
    assert "caution" in data["evaluation_notice"].lower()
    assert "optimistic" in data["evaluation_notice"].lower()


def test_multiclass_error_analysis(error_env) -> None:
    """Requirement 3: Multiclass classification error analysis with confusion matrix and per-class metrics."""
    client, _, _ = error_env
    exp_id = train_multiclass_classification(client)

    res = client.post(f"/api/v1/experiments/{exp_id}/error-analysis", json={"split": "test"})
    assert res.status_code == 200
    data = res.json()

    cls_diag = data["classification_analysis"]
    assert cls_diag is not None
    assert len(cls_diag["class_labels"]) == 3
    assert len(cls_diag["confusion_matrix"]) == 3
    assert len(cls_diag["class_metrics"]) == 3


def test_regression_error_analysis(error_env) -> None:
    """Requirement 3: Regression error analysis (residuals, MAE, RMSE, feature correlations, slices)."""
    client, _, _ = error_env
    exp_id = train_regression_model(client)

    res = client.post(f"/api/v1/experiments/{exp_id}/error-analysis", json={"split": "test", "max_error_examples": 5})
    assert res.status_code == 200
    data = res.json()

    obj = ErrorAnalysisResponse(**data)
    assert obj.task_type == "regression"
    assert obj.classification_analysis is None

    reg_diag = obj.regression_analysis
    assert reg_diag is not None
    assert reg_diag.residual_summary.mae >= 0.0
    assert reg_diag.residual_summary.rmse >= 0.0
    assert reg_diag.residual_summary.min_residual <= reg_diag.residual_summary.max_residual

    # Feature-error correlations
    assert len(reg_diag.feature_error_correlations) >= 1
    for corr in reg_diag.feature_error_correlations:
        assert -1.0 <= corr.correlation_with_absolute_error <= 1.0
        assert corr.interpretation != ""

    # Categorical slices
    if reg_diag.categorical_slices:
        for cat_slice in reg_diag.categorical_slices:
            assert cat_slice.sample_count >= 1
            assert cat_slice.mae >= 0.0

    # Top outlier examples
    assert len(reg_diag.top_error_examples) <= 5
    for out in reg_diag.top_error_examples:
        assert out.absolute_error >= 0.0


def test_custom_records_error_analysis(error_env) -> None:
    """Requirement 3: Error analysis on user-supplied batch of instances."""
    client, _, _ = error_env
    exp_id = train_binary_classification(client)

    custom_batch = [
        {"age": 28, "credit_score": 620, "card_type": "Silver", "default": "yes"},
        {"age": 45, "credit_score": 750, "card_type": "Gold", "default": "no"},
    ]

    res = client.post(
        f"/api/v1/experiments/{exp_id}/error-analysis",
        json={"custom_records": custom_batch},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["evaluation_split"] == "custom"
    assert data["sample_size"] == 2


def test_error_analysis_validation_errors(error_env) -> None:
    """Requirement 3: Proper error responses on invalid inputs and unknown experiment."""
    client, _, _ = error_env
    exp_id = train_binary_classification(client)

    # 1. Non-existent experiment
    res_404 = client.post("/api/v1/experiments/unknown-exp-id/error-analysis", json={})
    assert res_404.status_code == 404

    # 2. Invalid split option
    res_split = client.post(f"/api/v1/experiments/{exp_id}/error-analysis", json={"split": "invalid_split"})
    assert res_split.status_code == 422

    # 3. Custom record missing target column
    bad_custom = client.post(
        f"/api/v1/experiments/{exp_id}/error-analysis",
        json={"custom_records": [{"age": 30, "credit_score": 600, "card_type": "Silver"}]},
    )
    assert bad_custom.status_code == 400
    assert "missing required target column" in bad_custom.json()["detail"].lower()
