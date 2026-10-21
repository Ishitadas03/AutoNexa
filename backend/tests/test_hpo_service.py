"""Integration tests for HPOService and Phase 10A API endpoints."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.benchmark_service import BenchmarkService, get_benchmark_service
from app.services.automl.hpo_service import HPOService, get_hpo_service
from app.services.automl.prediction_service import PredictionService, get_prediction_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def hpo_test_env(tmp_path: Path):
    """Fixture providing isolated environment for Phase 10A HPO experiment tests."""
    upload_dir = tmp_path / "hpo_uploads"
    experiments_dir = tmp_path / "hpo_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    benchmark_service = BenchmarkService(experiments_dir=experiments_dir)
    hpo_service = HPOService(
        upload_dir=upload_dir,
        experiments_dir=experiments_dir,
        analysis_service=analysis_service,
    )

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_benchmark_service] = lambda: benchmark_service
    app.dependency_overrides[get_hpo_service] = lambda: hpo_service

    client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def make_classification_csv() -> str:
    """Generate small deterministic classification dataset with numeric and categorical features."""
    lines = ["age,income,tier,churn"]
    for i in range(50):
        age = 20 + i
        inc = 30000 + (i * 1200)
        tier = "gold" if i % 3 == 0 else ("silver" if i % 3 == 1 else "bronze")
        churn = "yes" if i % 4 == 0 else "no"
        lines.append(f"{age},{inc},{tier},{churn}")
    return "\n".join(lines) + "\n"


def make_regression_csv() -> str:
    """Generate small deterministic regression dataset."""
    lines = ["area,bedrooms,location,price"]
    for i in range(50):
        area = 600 + i * 40
        beds = 1 + (i % 4)
        loc = "urban" if i % 2 == 0 else "suburban"
        price = 100000 + area * 200 + beds * 15000
        lines.append(f"{area},{beds},{loc},{price}")
    return "\n".join(lines) + "\n"


def test_hpo_spaces_endpoint(hpo_test_env):
    """Verify GET /api/v1/benchmarks/hpo-spaces returns valid model search spaces."""
    client, _, _ = hpo_test_env
    response = client.get("/api/v1/benchmarks/hpo-spaces")
    assert response.status_code == 200
    spaces = response.json()
    assert isinstance(spaces, list)
    assert len(spaces) >= 6
    rf = next(s for s in spaces if s["model_id"] == "random_forest")
    assert rf["model_name"] == "Random Forest Classifier"
    assert len(rf["parameters"]) >= 4


def test_hpo_controlled_experiment_classification(hpo_test_env):
    """Verify controlled HPO comparison for classification across matched seeds and untouched test evaluation."""
    client, upload_dir, experiments_dir = hpo_test_env

    # 1. Upload classification dataset
    csv_bytes = make_classification_csv().encode("utf-8")
    up_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("churn.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert up_resp.status_code == 201
    dataset_id = up_resp.json()["dataset_id"]

    # 2. Run HPO controlled experiment with 6 trials across 2 seeds
    payload = {
        "dataset_id": dataset_id,
        "target_column": "churn",
        "model_id": "decision_tree",
        "trial_budget": 6,
        "seeds": [42, 123],
        "evaluation_strategy": "cross_validation",
        "cv_folds": 2,
        "test_size": 0.2,
        "primary_metric": "f1_weighted",
    }

    resp = client.post("/api/v1/benchmarks/hpo-experiment", json=payload)
    assert resp.status_code == 201
    data = resp.json()

    assert data["experiment_id"] is not None
    assert len(data["replicates"]) == 2

    # Check protocol
    protocol = data["protocol"]
    assert protocol["dataset_id"] == dataset_id
    assert protocol["model_id"] == "decision_tree"
    assert protocol["trial_budget"] == 6
    assert protocol["seeds"] == [42, 123]
    assert protocol["bayesian_library"] == "optuna"

    # Check replicates
    for rep in data["replicates"]:
        assert rep["random_search"]["total_trials"] == 6
        assert rep["bayesian_optimization"]["total_trials"] == 6
        assert len(rep["random_search"]["trials"]) == 6
        assert len(rep["bayesian_optimization"]["trials"]) == 6

        # Check that both selected a best parameter configuration
        assert "max_depth" in rep["random_search"]["best_parameters"]
        assert "max_depth" in rep["bayesian_optimization"]["best_parameters"]

        # Check untouched test score is populated
        assert rep["random_search"]["test_score"] is not None
        assert rep["bayesian_optimization"]["test_score"] is not None
        assert rep["validation_winner"] in ("bayesian", "random", "tied")
        assert rep["test_winner"] in ("bayesian", "random", "tied")

    # Check summaries and statistics
    rand_sum = data["random_search_summary"]
    bayes_sum = data["bayesian_summary"]
    assert rand_sum["n_replicates"] == 2
    assert bayes_sum["n_replicates"] == 2
    assert len(rand_sum["mean_convergence_curve"]) == 6
    assert len(bayes_sum["mean_convergence_curve"]) == 6

    stat = data["statistical_comparison"]
    assert stat["n_replicates"] == 2
    assert stat["mean_validation_difference"] is not None
    assert stat["mean_test_difference"] is not None
    assert stat["scientific_conclusion"] is not None
    assert stat["uncertainty_limitations"] is not None

    # Check overall winner
    assert data["overall_winner"] in ("bayesian_optimization", "random_search", "inconclusive")

    # 3. Retrieve stored experiment via GET
    get_resp = client.get(f"/api/v1/benchmarks/hpo-experiment/{data['experiment_id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["experiment_id"] == data["experiment_id"]

    # 4. Export CSV
    csv_resp = client.get(f"/api/v1/benchmarks/hpo-experiment/{data['experiment_id']}/export-csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    csv_text = csv_resp.text
    assert "experiment_id" in csv_text
    assert "strategy" in csv_text
    assert "param_max_depth" in csv_text
    # 2 seeds * 2 strategies * 6 trials = 24 rows + header
    assert len(csv_text.strip().split("\n")) == 25


def test_hpo_controlled_experiment_regression(hpo_test_env):
    """Verify controlled HPO comparison for regression with minimization objective (RMSE)."""
    client, upload_dir, _ = hpo_test_env

    # 1. Upload regression dataset
    csv_bytes = make_regression_csv().encode("utf-8")
    up_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("housing.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert up_resp.status_code == 201
    dataset_id = up_resp.json()["dataset_id"]

    # 2. Run HPO with Ridge / Linear Regression
    payload = {
        "dataset_id": dataset_id,
        "target_column": "price",
        "model_id": "linear_regression",
        "trial_budget": 5,
        "seeds": [42],
        "evaluation_strategy": "holdout",
        "test_size": 0.2,
        "primary_metric": "rmse",
    }

    resp = client.post("/api/v1/benchmarks/hpo-experiment", json=payload)
    assert resp.status_code == 201
    data = resp.json()

    assert data["protocol"]["task_type"] == "regression"
    assert data["protocol"]["primary_metric"] == "rmse"
    assert data["protocol"]["greater_is_better"] is False

    rep = data["replicates"][0]
    assert rep["random_search"]["completed_trials"] == 5
    assert rep["bayesian_optimization"]["completed_trials"] == 5

    # Check that RMSE is a positive non-zero number
    assert rep["random_search"]["best_validation_score"] > 0
    assert rep["bayesian_optimization"]["best_validation_score"] > 0
