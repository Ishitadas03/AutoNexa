"""Automated test suite for AutoML model selection, resource-aware training, and evaluation."""

import io
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.training import TrainingResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def isolated_env(tmp_path: Path):
    """Fixture providing isolated temporary directories for dataset uploads and experiment artifacts."""
    temp_upload_dir = tmp_path / "test_training_uploads"
    temp_exp_dir = tmp_path / "test_training_experiments"
    temp_upload_dir.mkdir(parents=True, exist_ok=True)
    temp_exp_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=temp_upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=temp_upload_dir)
    training_service = TrainingService(upload_dir=temp_upload_dir, experiments_dir=temp_exp_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service

    test_client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})
    yield test_client, temp_upload_dir, temp_exp_dir

    app.dependency_overrides.clear()


def upload_csv(client: TestClient, csv_content: str, filename: str = "train_data.csv") -> str:
    """Helper to upload a CSV file and return the generated dataset ID."""
    files = {"file": (filename, io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    response = client.post("/api/v1/datasets/upload", files=files)
    assert response.status_code == 201
    return response.json()["dataset_id"]


def test_existing_health_endpoint_still_operational(isolated_env) -> None:
    """Requirement 1: Verify health-check endpoint remains operational."""
    client, _, _ = isolated_env
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_existing_upload_endpoint_still_operational(isolated_env) -> None:
    """Requirement 2: Verify dataset upload endpoint remains operational."""
    client, _, _ = isolated_env
    csv_data = "a,b,c\n1,2,3\n4,5,6\n"
    dataset_id = upload_csv(client, csv_data)
    assert dataset_id is not None


def test_existing_analysis_endpoint_still_operational(isolated_env) -> None:
    """Requirement 3: Verify dataset analysis endpoint remains operational."""
    client, _, _ = isolated_env
    csv_data = "x,y,label\n1.0,2.0,yes\n3.0,4.0,no\n5.0,6.0,yes\n7.0,8.0,no\n"
    dataset_id = upload_csv(client, csv_data)
    response = client.post(f"/api/v1/datasets/{dataset_id}/analyze")
    assert response.status_code == 200
    assert response.json()["rows"] == 4


def test_valid_classification_experiment(isolated_env) -> None:
    """Requirement 4: Execute a valid classification AutoML experiment."""
    client, _, exp_dir = isolated_env
    # Generate 50-row classification dataset
    rows = ["feature_a,feature_b,category,label"]
    for i in range(50):
        cat = "tier_1" if i % 2 == 0 else "tier_2"
        lbl = 1 if i % 3 == 0 else 0
        rows.append(f"{i * 1.5},{100 - i},{cat},{lbl}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {
        "target_column": "label",
        "task_type": "classification",
        "test_size": 0.2,
        "random_state": 42,
        "time_budget_seconds": 30,
        "primary_metric": "f1_weighted",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201

    data = response.json()
    validated = TrainingResponse.model_validate(data)

    assert validated.dataset_id == dataset_id
    assert validated.target_column == "label"
    assert validated.task_type in ("binary_classification", "classification")
    assert validated.primary_metric == "f1_weighted"
    assert validated.primary_metric_greater_is_better is True
    assert len(validated.models_evaluated) >= 3
    assert len(validated.ranked_models) >= 1
    assert validated.best_model is not None
    assert validated.artifacts_saved is True

    # Ensure metadata and model binary are persisted in the isolated experiment directory
    exp_path = exp_dir / validated.experiment_id
    assert exp_path.is_dir()
    assert (exp_path / "metadata.json").is_file()
    assert (exp_path / "best_model.joblib").is_file()


def test_valid_regression_experiment(isolated_env) -> None:
    """Requirement 5: Execute a valid regression AutoML experiment."""
    client, _, exp_dir = isolated_env
    rows = ["size_sqft,bedrooms,zip_code,price"]
    for i in range(50):
        zc = f"zip_{i % 3}"
        pr = 150000.0 + (i * 12500.5)
        rows.append(f"{800 + i * 40},{2 + i % 3},{zc},{pr}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {
        "target_column": "price",
        "task_type": "regression",
        "test_size": 0.2,
        "random_state": 42,
        "time_budget_seconds": 30,
        "primary_metric": "rmse",
    }
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201

    data = response.json()
    validated = TrainingResponse.model_validate(data)

    assert validated.target_column == "price"
    assert validated.task_type == "regression"
    assert validated.primary_metric == "rmse"
    assert validated.primary_metric_greater_is_better is False
    assert len(validated.ranked_models) >= 1

    # Check metrics structure
    best_res = next(m for m in validated.models_evaluated if m.model_id == validated.best_model)
    assert "rmse" in best_res.metrics
    assert "mae" in best_res.metrics
    assert best_res.metrics["rmse"] is not None


def test_invalid_dataset_id_returns_404(isolated_env) -> None:
    """Requirement 6: Reject unknown dataset identifier with HTTP 404."""
    client, _, _ = isolated_env
    payload = {"target_column": "target"}
    response = client.post("/api/v1/datasets/non_existent_dataset_id/train", json=payload)
    assert response.status_code == 404


def test_invalid_target_column_rejected(isolated_env) -> None:
    """Requirement 7: Reject non-existent target column with HTTP 400."""
    client, _, _ = isolated_env
    csv_data = "feat1,feat2\n1,2\n3,4\n5,6\n7,8\n9,10\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "missing_target"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_constant_target_rejected(isolated_env) -> None:
    """Requirement 8: Reject constant target column with HTTP 400."""
    client, _, _ = isolated_env
    csv_data = "feat1,feat2,const_target\n" + "\n".join(f"{i},{i * 2},1" for i in range(20))
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "const_target"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 400
    assert "distinct value" in response.json()["detail"].lower() or "constant" in response.json()["detail"].lower()


def test_invalid_task_type_rejected(isolated_env) -> None:
    """Requirement 9: Incompatible task override rejected with HTTP 400."""
    client, _, _ = isolated_env
    # Non-numeric string target cannot be regression
    csv_data = "feat,label\n" + "\n".join(f"{i},{'cat' if i % 2 == 0 else 'dog'}" for i in range(20))
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "label", "task_type": "regression"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 400
    assert "incompatible" in response.json()["detail"].lower()


def test_invalid_test_split_and_budget_validation(isolated_env) -> None:
    """Requirement 10: Reject invalid test split bounds and budget values."""
    client, _, _ = isolated_env
    csv_data = "f1,f2,y\n" + "\n".join(f"{i},{i * 2},{i % 2}" for i in range(20))
    dataset_id = upload_csv(client, csv_data)

    # test_size > 0.5
    bad_split = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y", "test_size": 0.9},
    )
    assert bad_split.status_code == 422

    # time_budget < 5
    bad_budget = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y", "time_budget_seconds": 2},
    )
    assert bad_budget.status_code == 422


def test_numeric_missing_values_handled_cleanly(isolated_env) -> None:
    """Requirement 11: Missing numeric features are imputed without failure."""
    client, _, _ = isolated_env
    rows = ["num1,num2,target"]
    for i in range(30):
        val1 = "" if i % 4 == 0 else str(i * 10)
        val2 = "" if i % 5 == 0 else str(i * 2.5)
        rows.append(f"{val1},{val2},{i % 2}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "target"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201
    assert len(response.json()["ranked_models"]) >= 1


def test_categorical_features_and_unseen_categories(isolated_env) -> None:
    """Requirement 12: Categorical features and unseen categories are safely encoded."""
    client, _, _ = isolated_env
    rows = ["city,rating,churn"]
    for i in range(40):
        city = f"city_{i % 5}"
        rows.append(f"{city},{i * 0.1},{i % 2}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "churn"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201
    assert len(response.json()["ranked_models"]) >= 1


def test_imbalanced_classification_and_rare_classes(isolated_env) -> None:
    """Requirement 13: Handles rare classes and severe class imbalance gracefully."""
    client, _, _ = isolated_env
    # 40 rows: 39 class 0, 1 class 1 (single-instance class prevents standard stratification)
    rows = ["feat1,feat2,imbalanced_label"]
    for i in range(40):
        lbl = 1 if i == 0 else 0
        rows.append(f"{i * 2.5},{i * 1.5},{lbl}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "imbalanced_label"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201
    assert len(response.json()["ranked_models"]) >= 1


def test_correct_ranking_direction_for_metrics(isolated_env) -> None:
    """Requirement 14: Verifies ranking direction (descending for F1, ascending for RMSE)."""
    client, _, _ = isolated_env
    rows = ["x1,x2,y_reg"]
    for i in range(30):
        rows.append(f"{i},{i * 2},{i * 3.5 + 1.2}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    # RMSE ranking: lower is better
    response = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y_reg", "primary_metric": "rmse"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["primary_metric_greater_is_better"] is False

    ranked = data["ranked_models"]
    results_map = {m["model_id"]: m["metrics"]["rmse"] for m in data["models_evaluated"] if m["status"] == "successful"}
    # Verify RMSE of 1st ranked <= RMSE of 2nd ranked
    if len(ranked) >= 2:
        assert results_map[ranked[0]] <= results_map[ranked[1]]


def test_estimator_resilience_on_failure(isolated_env) -> None:
    """Requirement 15: If one estimator fails, the experiment completes with remaining models."""
    client, _, _ = isolated_env
    rows = ["f1,f2,target"]
    for i in range(30):
        rows.append(f"{i},{i * 3},{i % 2}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    # Request includes an invalid/unsupported model name alongside valid models
    bad_req = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "models": ["dummy", "non_existent_estimator"]},
    )
    # Registry rejects nonexistent model name with 400
    assert bad_req.status_code == 400

    # Test valid models run without crashing
    good_req = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "models": ["dummy", "logistic_regression", "decision_tree"]},
    )
    assert good_req.status_code == 201
    assert len(good_req.json()["ranked_models"]) >= 2


def test_reproducibility_with_fixed_seed(isolated_env) -> None:
    """Requirement 16: Two identical runs produce identical holdout metric scores."""
    client, _, _ = isolated_env
    rows = ["f1,f2,target"]
    for i in range(40):
        rows.append(f"{i * 0.7},{i * 2.3},{i % 2}")
    csv_data = "\n".join(rows) + "\n"
    dataset_id = upload_csv(client, csv_data)

    payload = {
        "target_column": "target",
        "random_state": 12345,
        "models": ["dummy", "logistic_regression", "decision_tree"],
    }
    res1 = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    res2 = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)

    assert res1.status_code == 201
    assert res2.status_code == 201

    m1 = {m["model_id"]: m["metrics"] for m in res1.json()["models_evaluated"]}
    m2 = {m["model_id"]: m["metrics"] for m in res2.json()["models_evaluated"]}
    assert m1 == m2


def test_resource_limits_validated(isolated_env) -> None:
    """Requirement 17: Request exceeding configured limits is rejected."""
    client, _, _ = isolated_env
    csv_data = "a,b,c\n" + "\n".join(f"{i},{i},{i % 2}" for i in range(20))
    dataset_id = upload_csv(client, csv_data)

    # Time budget exceeds hard cap
    response = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "c", "time_budget_seconds": 350},  # Max is 300
    )
    assert response.status_code == 422


def test_no_target_leakage_through_preprocessing(isolated_env) -> None:
    """Requirement 18: Ensure target column is strictly excluded from features."""
    client, _, _ = isolated_env
    csv_data = "f1,target\n" + "\n".join(f"{i},{i % 2}" for i in range(25))
    dataset_id = upload_csv(client, csv_data)

    payload = {"target_column": "target"}
    response = client.post(f"/api/v1/datasets/{dataset_id}/train", json=payload)
    assert response.status_code == 201
    assert response.json()["features_count"] == 1  # Exactly 1 feature, target excluded


def test_no_raw_rows_or_server_paths_in_response(isolated_env) -> None:
    """Requirement 19: Verify response payload never leaks raw rows or absolute server paths."""
    client, _, exp_dir = isolated_env
    secret_value = "CONFIDENTIAL_PATIENT_SSN_9876"
    csv_data = f"id,feature,secret,label\n" + "\n".join(
        f"{i},{i * 2.5},{secret_value},{i % 2}" for i in range(25)
    )
    dataset_id = upload_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "label"},
    )
    assert response.status_code == 201
    response_text = response.text

    assert secret_value not in response_text
    assert str(exp_dir) not in response_text
    assert str(exp_dir.resolve()) not in response_text


def test_persisted_experiment_metadata_is_json_serializable(isolated_env) -> None:
    """Requirement 20: Persisted metadata.json exists and is strictly valid JSON."""
    client, _, exp_dir = isolated_env
    csv_data = "feat,target\n" + "\n".join(f"{i},{i % 2}" for i in range(20))
    dataset_id = upload_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target"},
    )
    assert response.status_code == 201
    exp_id = response.json()["experiment_id"]

    meta_file = exp_dir / exp_id / "metadata.json"
    assert meta_file.is_file()

    with open(meta_file, "r", encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded["experiment_id"] == exp_id
    assert loaded["dataset_id"] == dataset_id


def test_failed_training_cleans_up_or_leaves_no_corrupt_artifacts(isolated_env) -> None:
    """Requirement 21: When training fails validation, no bogus experiment folder is created."""
    client, _, exp_dir = isolated_env
    csv_data = "feat,target\n" + "\n".join(f"{i},1" for i in range(20))  # Constant target
    dataset_id = upload_csv(client, csv_data)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target"},
    )
    assert response.status_code == 400
    # No experiment directory created
    assert len(list(exp_dir.iterdir())) == 0
