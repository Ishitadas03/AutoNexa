"""Automated tests for AutoNexa Phase 8: Model Explainability (Global & Local Explanations)."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.explainability import (
    GlobalFeatureImportanceResponse,
    PredictionExplanationResponse,
)
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.explainability_service import (
    ExplainabilityService,
    get_explainability_service,
    parse_transformed_feature_name,
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
def explain_env(tmp_path: Path):
    """Fixture providing isolated temporary directories and mocked service overrides."""
    upload_dir = tmp_path / "exp_uploads"
    experiments_dir = tmp_path / "exp_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    explainability_service = ExplainabilityService(
        upload_dir=upload_dir, experiments_dir=experiments_dir
    )

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_explainability_service] = lambda: explainability_service

    client = TestClient(app)
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def train_classification_experiment(client: TestClient, model_type: str = "random_forest") -> str:
    """Helper to train a classification experiment with numeric and categorical features."""
    rows = ["age,city,income,churn"]
    for i in range(40):
        age = 20 + i
        city = "CityA" if i % 2 == 0 else "CityB"
        income = 30000 + (i * 1000)
        label = "yes" if i >= 20 else "no"
        rows.append(f"{age},{city},{income},{label}")
    csv_content = "\n".join(rows) + "\n"

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_churn.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    train_res = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "churn",
            "models": [model_type],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert train_res.status_code == 201
    return train_res.json()["experiment_id"]


def train_regression_experiment(client: TestClient) -> str:
    """Helper to train a regression experiment."""
    rows = ["size,rooms,neighborhood,price"]
    for i in range(40):
        size = 500 + (i * 50)
        rooms = 1 + (i % 4)
        neigh = "Downtown" if i % 2 == 0 else "Suburbs"
        price = 100000 + (size * 150) + (rooms * 20000)
        rows.append(f"{size},{rooms},{neigh},{price}")
    csv_content = "\n".join(rows) + "\n"

    upload_res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_house.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["dataset_id"]

    train_res = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "price",
            "task_type": "regression",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert train_res.status_code == 201
    return train_res.json()["experiment_id"]


def test_parse_transformed_feature_name_helper() -> None:
    """Unit test for feature label parsing and category mapping."""
    num_cols = ["age", "tenure_months"]
    cat_cols = ["contract", "city"]

    # Numeric column
    src, label = parse_transformed_feature_name("numeric__age", num_cols, cat_cols)
    assert src == "age"
    assert label == "age"

    # Categorical column with value
    src, label = parse_transformed_feature_name("categorical__contract_one-year", num_cols, cat_cols)
    assert src == "contract"
    assert label == "contract = one-year"

    # Categorical infrequent column
    src, label = parse_transformed_feature_name("categorical__city_infrequent_sklearn", num_cols, cat_cols)
    assert src == "city"
    assert label == "city (infrequent categories)"


def test_global_feature_importance_native_tree(explain_env) -> None:
    """Requirement 2.1: Native tree feature importance computation and feature mapping."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client, model_type="random_forest")

    res = client.get(f"/api/v1/experiments/{exp_id}/explainability/importance?method=native")
    assert res.status_code == 200
    data = res.json()

    # Validate schema
    obj = GlobalFeatureImportanceResponse(**data)
    assert obj.experiment_id == exp_id
    assert obj.importance_method == "native_tree_importance"
    assert obj.features_count == 3  # age, city, income
    assert len(obj.feature_importances) == 3

    # Check feature names are preserved
    features = {f.feature for f in obj.feature_importances}
    assert features == {"age", "city", "income"}

    # Check transformed breakdown is populated
    assert obj.transformed_feature_importances is not None
    assert len(obj.transformed_feature_importances) >= 3

    # Normalized importances should sum to ~1.0
    total_norm = sum(f.normalized_importance for f in obj.feature_importances if f.normalized_importance is not None)
    assert pytest.approx(total_norm, rel=1e-2) == 1.0

    # Verify scientific caveats present
    assert "causation" in obj.scientific_limitations.lower()


def test_global_feature_importance_permutation(explain_env) -> None:
    """Requirement 2.1: Model-agnostic permutation importance."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client, model_type="random_forest")

    res = client.get(f"/api/v1/experiments/{exp_id}/explainability/importance?method=permutation&sample_size=100")
    assert res.status_code == 200
    data = res.json()

    obj = GlobalFeatureImportanceResponse(**data)
    assert obj.importance_method == "permutation_importance"
    assert obj.sample_size <= 100
    assert len(obj.feature_importances) == 3

    # Permutation provides standard deviation across shuffle iterations
    for item in obj.feature_importances:
        assert item.importance_std is not None
        assert item.importance_std >= 0.0


def test_global_importance_linear_model_handling(explain_env) -> None:
    """Requirement 2.1: Graceful handling of estimators lacking native tree importances."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client, model_type="logistic_regression")

    # Native should fail with clear explanation
    bad_res = client.get(f"/api/v1/experiments/{exp_id}/explainability/importance?method=native")
    assert bad_res.status_code == 400
    assert "does not expose native feature_importances_" in bad_res.json()["detail"]

    # Auto or permutation should succeed automatically
    auto_res = client.get(f"/api/v1/experiments/{exp_id}/explainability/importance?method=auto")
    assert auto_res.status_code == 200
    assert auto_res.json()["importance_method"] == "permutation_importance"


def test_local_prediction_explanation_classification(explain_env) -> None:
    """Requirement 2.2: Local prediction explanations for classification."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client, model_type="random_forest")

    query_payload = {
        "records": [
            {"age": 25, "city": "CityA", "income": 35000},
            {"age": 55, "city": "CityB", "income": 65000},
        ],
        "method": "auto",
    }

    res = client.post(f"/api/v1/experiments/{exp_id}/explainability/prediction", json=query_payload)
    assert res.status_code == 200
    data = res.json()

    obj = PredictionExplanationResponse(**data)
    assert obj.experiment_id == exp_id
    assert obj.explanation_count == 2
    assert len(obj.explanations) == 2

    first = obj.explanations[0]
    assert first.record_index == 0
    assert first.base_value is not None
    assert first.prediction in ("yes", "no")
    assert first.prediction_probabilities is not None

    # Check contributions map back to all 3 original features
    contrib_features = {c.feature for c in first.feature_contributions}
    assert contrib_features == {"age", "city", "income"}

    # Relative shares sum to ~1.0
    shares = [c.relative_share for c in first.feature_contributions if c.relative_share is not None]
    if shares:
        assert pytest.approx(sum(shares), abs=1e-2) == 1.0


def test_local_prediction_explanation_regression(explain_env) -> None:
    """Requirement 2.2: Local prediction explanations for regression."""
    client, _, _ = explain_env
    exp_id = train_regression_experiment(client)

    query_payload = {
        "records": [
            {"size": 1200, "rooms": 3, "neighborhood": "Downtown"},
        ],
        "method": "auto",
    }

    res = client.post(f"/api/v1/experiments/{exp_id}/explainability/prediction", json=query_payload)
    assert res.status_code == 200
    data = res.json()

    obj = PredictionExplanationResponse(**data)
    assert obj.task_type == "regression"
    inst = obj.explanations[0]
    assert isinstance(inst.prediction, (int, float))
    assert len(inst.feature_contributions) == 3


def test_local_explanation_model_agnostic_fallback(explain_env) -> None:
    """Requirement 2.2: Verify model-agnostic local attribution fallback."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client, model_type="random_forest")

    query_payload = {
        "records": [{"age": 30, "city": "CityA", "income": 40000}],
        "method": "fallback",
    }

    res = client.post(f"/api/v1/experiments/{exp_id}/explainability/prediction", json=query_payload)
    assert res.status_code == 200
    data = res.json()

    assert data["explanation_method"] == "local_perturbation_fallback"
    assert len(data["explanations"]) == 1
    assert len(data["explanations"][0]["feature_contributions"]) == 3


def test_explainability_error_handling(explain_env) -> None:
    """Requirement 2.3: Robust error handling on invalid requests and unknown experiments."""
    client, _, _ = explain_env
    exp_id = train_classification_experiment(client)

    # 1. Non-existent experiment
    res_404 = client.get("/api/v1/experiments/non-existent-uuid/explainability/importance")
    assert res_404.status_code == 404

    # 2. Invalid method
    res_bad_method = client.get(f"/api/v1/experiments/{exp_id}/explainability/importance?method=invalid_xyz")
    assert res_bad_method.status_code == 422  # Pydantic / Query literal validation

    # 3. Missing feature in local prediction records
    bad_record = client.post(
        f"/api/v1/experiments/{exp_id}/explainability/prediction",
        json={"records": [{"age": 30, "city": "CityA"}]},  # missing income
    )
    assert bad_record.status_code == 400
    assert "missing required feature" in bad_record.json()["detail"].lower()

    # 4. Unexpected feature in local prediction records
    extra_record = client.post(
        f"/api/v1/experiments/{exp_id}/explainability/prediction",
        json={"records": [{"age": 30, "city": "CityA", "income": 40000, "extra_col": 999}]},
    )
    assert extra_record.status_code == 400
    assert "unexpected feature" in extra_record.json()["detail"].lower()

    # 5. Empty records payload
    empty_record = client.post(
        f"/api/v1/experiments/{exp_id}/explainability/prediction",
        json={"records": []},
    )
    assert empty_record.status_code == 422 or empty_record.status_code == 400
