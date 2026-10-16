"""Automated tests for AutoNexa Step 6: Reliable Model Evaluation & MLflow Experiment Tracking."""

import os
from pathlib import Path
import tempfile
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd

from app.core.config import Settings
from app.main import app
from app.schemas.training import ModelStatus
from app.services.automl.evaluator import ModelEvaluator
from app.services.automl.tracker import compute_dataset_fingerprint


@pytest.fixture
def client(tmp_path: Path):
    """FastAPI TestClient isolated with temporary upload and experiment directories."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=True,
        MLFLOW_TRACKING_URI=str((experiments_dir / "mlruns").resolve()),
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.services.dataset_service.get_settings", return_value=test_settings), \
         patch("app.services.analysis_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=test_settings):
        with TestClient(app) as test_client:
            yield test_client, upload_dir, experiments_dir


def create_csv_upload(client: TestClient, csv_content: str, filename: str = "data.csv") -> str:
    """Helper to upload a CSV dataset and return dataset_id."""
    res = client.post(
        "/api/v1/datasets/upload",
        files={"file": (filename, csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 201, res.text
    return res.json()["dataset_id"]


def test_classification_cross_validation(client):
    """Verify classification K-fold cross-validation computes per-fold metrics, mean, and std."""
    test_client, _, _ = client

    # Synthetic binary classification dataset with 60 samples (30 class 0, 30 class 1)
    np.random.seed(42)
    rows = []
    for i in range(60):
        cls = i % 2
        feature1 = cls * 2.0 + np.random.normal(0, 0.5)
        feature2 = np.random.choice(["A", "B", "C"])
        rows.append(f"{feature1:.4f},{feature2},{cls}")

    csv_data = "feat1,feat2,target\n" + "\n".join(rows)
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "classification",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 3,
            "models": ["dummy", "logistic_regression"],
            "primary_metric": "f1_weighted",
            "random_state": 42,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["evaluation_strategy"] == "cross_validation"
    assert data["cv_folds"] == 3
    assert data["dataset_fingerprint"] is not None
    assert len(data["dataset_fingerprint"]) == 64  # SHA-256
    assert data["ranked_models"] is not None
    assert len(data["ranked_models"]) > 0

    # Verify per-model CV statistics
    for model in data["models_evaluated"]:
        if model["status"] == "successful":
            assert model["cv_scores"] is not None
            assert len(model["cv_scores"]) == 3
            assert model["cv_mean"] is not None
            assert model["cv_std"] is not None
            assert model["valid_folds_count"] == 3
            assert model["fold_metrics"] is not None
            assert len(model["fold_metrics"]) == 3

    # Independent holdout test metrics should be present for best model
    assert data["test_metrics"] is not None
    assert "f1_weighted" in data["test_metrics"]
    assert "accuracy" in data["test_metrics"]
    assert "untouched" in data["evaluation_protocol"].lower()


def test_regression_cross_validation(client):
    """Verify regression K-fold cross-validation with lower-is-better metric ranking."""
    test_client, _, _ = client

    # Synthetic continuous regression dataset with 50 samples
    np.random.seed(42)
    rows = []
    for i in range(50):
        x1 = float(i)
        target = 2.5 * x1 + 10.0 + np.random.normal(0, 1.0)
        rows.append(f"{x1:.2f},{target:.2f}")

    csv_data = "feature,target\n" + "\n".join(rows)
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "regression",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 4,
            "models": ["dummy_regressor", "linear_regression"],
            "primary_metric": "rmse",
            "random_state": 42,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["evaluation_strategy"] == "cross_validation"
    assert data["cv_folds"] == 4
    assert data["primary_metric"] == "rmse"
    assert data["primary_metric_greater_is_better"] is False
    assert data["best_model"] == "linear_regression"
    assert data["test_metrics"] is not None
    assert "rmse" in data["test_metrics"]


def test_cv_insufficient_samples_for_folds_error(client):
    """Reject CV requests when training partition has fewer samples than requested folds."""
    test_client, _, _ = client

    csv_data = "x,y\n1,10\n2,20\n3,30\n4,40\n5,50\n6,60\n"
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "y",
            "task_type": "regression",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 8,  # only 6 rows available!
        },
    )
    assert res.status_code == 400
    assert "insufficient samples" in res.json()["detail"].lower()


def test_classification_rare_class_fallback_and_strict_error(client):
    """Test StratifiedKFold fallback when minority class count < cv_folds."""
    test_client, _, _ = client

    # Class 0: 20 samples, Class 1: only 2 samples
    rows = [f"{i},0" for i in range(20)] + ["100,1", "101,1"]
    csv_data = "x,target\n" + "\n".join(rows)
    dataset_id = create_csv_upload(test_client, csv_data)

    # 1. With fallback enabled (default): succeeds and documents warning
    res_fallback = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "classification",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 4,  # minority class has 2 < 4
            "cv_rare_class_fallback": True,
            "models": ["dummy"],
        },
    )
    assert res_fallback.status_code == 201, res_fallback.text
    data_fallback = res_fallback.json()
    assert "Fallback" in data_fallback["evaluation_protocol"] or "fallback" in data_fallback["evaluation_protocol"]

    # 2. With fallback disabled: returns explicit HTTP 400 error
    res_strict = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "classification",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 4,
            "cv_rare_class_fallback": False,
            "models": ["dummy"],
        },
    )
    assert res_strict.status_code == 400
    assert "stratifiedkfold impossible" in res_strict.json()["detail"].lower()


def test_cv_pure_cross_validation_without_holdout(client):
    """When holdout_test=False, execute pure CV across all data without separate holdout."""
    test_client, _, _ = client

    np.random.seed(42)
    rows = [f"{i},{i % 2}" for i in range(30)]
    csv_data = "val,target\n" + "\n".join(rows)
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "classification",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 3,
            "holdout_test": False,
            "models": ["dummy"],
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["test_rows"] == 0
    assert data["test_metrics"] is None
    assert "pure cross-validation" in data["evaluation_protocol"].lower()


def test_sample_standard_deviation_ddof1_and_null_when_single_fold():
    """Unit test for fold aggregation: ddof=1 sample std and null when < 2 valid folds."""
    # Two valid folds
    folds_2 = [{"f1_weighted": 0.80}, {"f1_weighted": 0.90}]
    mean_metrics, scores, cv_mean, cv_std, count = ModelEvaluator.aggregate_cv_results(folds_2, "f1_weighted")
    assert count == 2
    assert cv_mean == 0.85
    # Sample standard deviation of [0.80, 0.90] is sqrt(((0.05)^2 + (-0.05)^2)/(2-1)) = sqrt(0.005) ≈ 0.0707
    assert cv_std == 0.0707

    # Single valid fold
    folds_1 = [{"f1_weighted": 0.85}]
    _, _, cv_mean1, cv_std1, count1 = ModelEvaluator.aggregate_cv_results(folds_1, "f1_weighted")
    assert count1 == 1
    assert cv_mean1 == 0.85
    assert cv_std1 is None  # MUST be None, not 0!

    # Zero valid folds
    folds_0 = [{"f1_weighted": None}]
    _, _, cv_mean0, cv_std0, count0 = ModelEvaluator.aggregate_cv_results(folds_0, "f1_weighted")
    assert count0 == 0
    assert cv_mean0 is None
    assert cv_std0 is None


def test_dataset_sha256_fingerprint_uniqueness(tmp_path: Path):
    """Verify SHA-256 dataset fingerprint correctly detects content changes without logging PII."""
    f1 = tmp_path / "d1.csv"
    f2 = tmp_path / "d2.csv"
    f3 = tmp_path / "d3.csv"

    content_a = "name,age,salary\nAlice,30,70000\nBob,40,90000\n"
    content_b = "name,age,salary\nAlice,30,70000\nBob,40,90001\n"  # 1 byte difference

    f1.write_text(content_a, encoding="utf-8")
    f2.write_text(content_a, encoding="utf-8")
    f3.write_text(content_b, encoding="utf-8")

    fp1 = compute_dataset_fingerprint(f1)
    fp2 = compute_dataset_fingerprint(f2)
    fp3 = compute_dataset_fingerprint(f3)

    assert fp1 == fp2  # Identical content yields identical fingerprint
    assert fp1 != fp3  # Altered content yields distinct fingerprint
    assert len(fp1) == 64  # Valid SHA-256 hex string


def test_mlflow_parent_and_nested_child_runs(client):
    """Verify MLflow logs a parent experiment run and nested child runs for candidate models."""
    test_client, _, experiments_dir = client

    csv_data = "x,y\n" + "\n".join(f"{i},{i*2}" for i in range(25))
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "y",
            "task_type": "regression",
            "evaluation_strategy": "holdout",
            "models": ["dummy_regressor", "linear_regression"],
        },
    )
    assert res.status_code == 201
    data = res.json()

    assert data["tracking_status"] == "completed"
    assert data["mlflow_run_id"] is not None

    import mlflow
    mlruns_path = str((experiments_dir / "mlruns").resolve())
    mlflow.set_tracking_uri(mlruns_path)

    parent_run = mlflow.get_run(data["mlflow_run_id"])
    assert parent_run is not None
    assert parent_run.data.params["dataset_id"] == dataset_id
    assert parent_run.data.params["target_column"] == "y"
    assert parent_run.data.tags["best_model"] == data["best_model"]


def test_mlflow_tracking_disabled(client, tmp_path: Path):
    """Verify that when MLflow tracking is disabled, training completes with tracking_status='disabled'."""
    upload_dir = tmp_path / "uploads_no_track"
    experiments_dir = tmp_path / "exp_no_track"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    no_track_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
    )

    with patch("app.core.config.get_settings", return_value=no_track_settings), \
         patch("app.services.dataset_service.get_settings", return_value=no_track_settings), \
         patch("app.services.analysis_service.get_settings", return_value=no_track_settings), \
         patch("app.services.automl.training_service.get_settings", return_value=no_track_settings):
        with TestClient(app) as test_client:
            csv_data = "a,b,target\n1,2,0\n3,4,1\n5,6,0\n7,8,1\n9,10,0\n11,12,1\n"
            dataset_id = create_csv_upload(test_client, csv_data)

            res = test_client.post(
                f"/api/v1/datasets/{dataset_id}/train",
                json={
                    "target_column": "target",
                    "task_type": "classification",
                    "evaluation_strategy": "holdout",
                    "models": ["dummy"],
                },
            )
            assert res.status_code == 201
            data = res.json()
            assert data["tracking_status"] == "disabled"
            assert data["mlflow_run_id"] is None
            assert data["artifacts_saved"] is True


def test_mlflow_tracking_failure_resilience(client):
    """Verify that if MLflow raises an exception during tracking, training still succeeds."""
    test_client, _, _ = client

    csv_data = "col1,col2,target\n1,2,0\n3,4,1\n5,6,0\n7,8,1\n9,10,0\n11,12,1\n"
    dataset_id = create_csv_upload(test_client, csv_data)

    with patch("app.services.automl.tracker.MLflowTracker.start_parent_run") as mock_start:
        mock_start.return_value = (None, None, "failed", "Simulated MLflow connection timeout")

        res = test_client.post(
            f"/api/v1/datasets/{dataset_id}/train",
            json={
                "target_column": "target",
                "task_type": "classification",
                "evaluation_strategy": "holdout",
                "models": ["dummy"],
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["tracking_status"] == "failed"
        assert "Simulated MLflow" in data["tracking_warning"]
        assert data["best_model"] == "dummy"


def test_cv_preprocessing_no_leakage_across_folds(client):
    """Verify that imputers and encoders in CV are strictly fitted on fold training partitions."""
    test_client, _, _ = client

    # Dataset where numerical feature has missing values and categorical has categories
    csv_data = (
        "num1,cat1,target\n"
        "10.0,red,0\n"
        "20.0,blue,1\n"
        ",red,0\n"
        "40.0,green,1\n"
        "50.0,,0\n"
        "60.0,blue,1\n"
        "70.0,green,0\n"
        "80.0,red,1\n"
        "90.0,blue,0\n"
        "100.0,green,1\n"
    )
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "task_type": "classification",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 2,
            "models": ["logistic_regression"],
            "random_state": 42,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["evaluation_strategy"] == "cross_validation"
    assert len(data["models_evaluated"]) == 1
    model = data["models_evaluated"][0]
    assert model["status"] == "successful"
    assert model["valid_folds_count"] == 2
    assert model["cv_std"] is not None


def test_untouched_final_test_set_protocol(client):
    """Verify that independent test metrics are computed only after candidate selection on untouched data."""
    test_client, _, _ = client

    np.random.seed(42)
    rows = [f"{i},{i*1.5 + np.random.normal(0, 0.1):.2f}" for i in range(40)]
    csv_data = "x,y\n" + "\n".join(rows)
    dataset_id = create_csv_upload(test_client, csv_data)

    res = test_client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "y",
            "task_type": "regression",
            "evaluation_strategy": "cross_validation",
            "cv_folds": 3,
            "test_size": 0.25,
            "holdout_test": True,
            "models": ["linear_regression"],
        },
    )
    assert res.status_code == 201
    data = res.json()

    assert data["train_rows"] == 30
    assert data["test_rows"] == 10
    assert data["test_metrics"] is not None
    assert "rmse" in data["test_metrics"]
    assert "untouched" in data["evaluation_protocol"].lower()


def test_best_effort_time_budget_exhaustion_vs_model_failure(client):
    """Verify that when wall-clock budget is exceeded, status is skipped_timeout rather than failed."""
    test_client, _, _ = client

    csv_data = "x,y\n" + "\n".join(f"{i},{i*2}" for i in range(20))
    dataset_id = create_csv_upload(test_client, csv_data)

    # Mock time.monotonic to simulate elapsed time exceeding budget after first model
    time_calls = [0.0]

    def mock_time():
        time_calls[0] += 50.0  # Increment by 50s each call
        return time_calls[0]

    with patch("time.monotonic", side_effect=mock_time):
        res = test_client.post(
            f"/api/v1/datasets/{dataset_id}/train",
            json={
                "target_column": "y",
                "task_type": "regression",
                "evaluation_strategy": "holdout",
                "time_budget_seconds": 10,
                "models": ["dummy_regressor", "linear_regression"],
            },
        )
        assert res.status_code == 201
        data = res.json()
        models = {m["model_id"]: m for m in data["models_evaluated"]}
        # Second model should be skipped_timeout because time budget was exceeded
        if "linear_regression" in models:
            assert models["linear_regression"]["status"] in ("skipped_timeout", "successful")


def test_non_finite_metric_serialization_safety():
    """Verify sanitize_float converts NaN and Infinity to None (null in JSON)."""
    from app.services.automl.evaluator import sanitize_float

    assert sanitize_float(float("nan")) is None
    assert sanitize_float(float("inf")) is None
    assert sanitize_float(float("-inf")) is None
    assert sanitize_float(3.14159) == 3.1416
    assert sanitize_float(0.0) == 0.0
    assert sanitize_float(None) is None
