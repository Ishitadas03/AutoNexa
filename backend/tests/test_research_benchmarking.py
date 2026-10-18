"""Automated integration tests for AutoNexa Phase 9: Research-Grade Experimental Validation & Benchmarking Framework."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.benchmark_service import BenchmarkService, get_benchmark_service
from app.services.automl.prediction_service import PredictionService, get_prediction_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.automl.research_benchmarking_service import (
    ResearchBenchmarkingService,
    get_research_benchmark_service,
)
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def research_bench_env(tmp_path: Path):
    """Fixture providing isolated environment for Phase 9 research benchmark tests."""
    upload_dir = tmp_path / "research_uploads"
    experiments_dir = tmp_path / "research_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    benchmark_service = BenchmarkService(experiments_dir=experiments_dir)
    research_bench_service = ResearchBenchmarkingService(
        upload_dir=upload_dir,
        experiments_dir=experiments_dir,
        analysis_service=analysis_service,
        training_service=training_service,
        prediction_service=prediction_service,
    )

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_benchmark_service] = lambda: benchmark_service
    app.dependency_overrides[get_research_benchmark_service] = lambda: research_bench_service

    client = TestClient(app)
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def create_synthetic_classification_csv() -> str:
    """Create synthetic binary classification CSV."""
    rows = ["feature1,feature2,feature3,label"]
    for i in range(40):
        f1 = float(i * 1.5)
        f2 = float((i % 5) * 2.0)
        f3 = float(100 - i)
        target = "accepted" if i >= 20 else "rejected"
        rows.append(f"{f1},{f2},{f3},{target}")
    return "\n".join(rows) + "\n"


def create_synthetic_regression_csv() -> str:
    """Create synthetic regression CSV."""
    rows = ["size,rooms,price"]
    for i in range(40):
        size = float(500 + i * 50)
        rooms = float(1 + (i % 4))
        price = float(100000 + size * 150 + rooms * 10000)
        rows.append(f"{size},{rooms},{price}")
    return "\n".join(rows) + "\n"


def test_repeated_runs_classification(research_bench_env):
    """Test full repeated-seed execution for classification."""
    client, upload_dir, _ = research_bench_env

    # 1. Upload dataset
    csv_bytes = create_synthetic_classification_csv().encode("utf-8")
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_clf.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_resp.status_code in [200, 201], upload_resp.text
    dataset_id = upload_resp.json()["dataset_id"]

    # 2. Trigger repeated runs with 2 seeds
    req_payload = {
        "dataset_id": dataset_id,
        "target_column": "label",
        "task_type": "classification",
        "seeds": [42, 101],
        "test_size": 0.2,
        "cv_folds": 2,
        "models": ["logistic_regression"],
        "primary_metric": "accuracy",
        "bootstrap_resamples": 200,
    }
    run_resp = client.post("/api/v1/benchmarks/repeated-runs", json=req_payload)
    assert run_resp.status_code == 201, run_resp.text
    data = run_resp.json()

    # Verify response schema
    assert "run_group_id" in data
    assert data["n_requested_runs"] == 2
    assert data["n_successful_runs"] == 2
    assert data["n_failed_runs"] == 0

    # Verify Protocol
    proto = data["protocol"]
    assert proto["protocol_version"] == "1.0"
    assert proto["dataset_id"] == dataset_id
    assert proto["dataset_fingerprint"] is not None
    assert proto["target_column"] == "label"
    assert proto["task_type"] == "classification"
    assert proto["package_versions"] is not None
    assert "numpy" in proto["package_versions"]

    # Verify Individual Runs
    runs = data["runs"]
    assert len(runs) == 2
    for r in runs:
        assert r["status"] == "successful"
        assert r["seed"] in [42, 101]
        assert r["duration_seconds"] > 0
        assert "accuracy" in r["test_metrics"]

    # Verify Resource Efficiency
    res_eff = data["resource_efficiency"]
    assert res_eff is not None
    assert res_eff["peak_memory_bytes"] is not None
    assert res_eff["prediction_latency_ms_per_sample"] is not None
    assert res_eff["prediction_throughput_samples_per_sec"] is not None

    # Verify Statistical Summaries
    stats = data["metric_summaries"]
    assert "accuracy" in stats
    acc_stat = stats["accuracy"]
    assert acc_stat["valid_runs"] == 2
    assert acc_stat["mean"] is not None
    assert acc_stat["std"] is not None  # N=2, std with ddof=1 is valid!
    assert acc_stat["median"] is not None
    assert acc_stat["ci_95_t"] is not None
    assert acc_stat["ci_95_bootstrap"] is not None

    # Verify Baselines
    baselines = data["baseline_comparisons"]
    assert len(baselines) >= 2
    dummy = next((b for b in baselines if "dummy" in b["baseline_name"]), None)
    assert dummy is not None
    assert dummy["selection_quality"] in ["outperformed", "tied", "underperformed"]

    # 3. Test Retrieval Endpoint
    run_group_id = data["run_group_id"]
    get_resp = client.get(f"/api/v1/benchmarks/repeated-runs/{run_group_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["run_group_id"] == run_group_id

    # 4. Test CSV Export
    csv_resp = client.get(f"/api/v1/benchmarks/repeated-runs/{run_group_id}/export-csv")
    assert csv_resp.status_code == 200
    assert "run_group_id" in csv_resp.text
    assert "accuracy" in csv_resp.text

    # 5. Test LaTeX Export
    latex_resp = client.get(f"/api/v1/benchmarks/repeated-runs/{run_group_id}/latex")
    assert latex_resp.status_code == 200
    latex_json = latex_resp.json()
    assert "\\begin{table}" in latex_json["latex"]
    assert "\\toprule" in latex_json["latex"]


def test_repeated_runs_regression(research_bench_env):
    """Test repeated-seed execution for regression task."""
    client, _, _ = research_bench_env

    # 1. Upload dataset
    csv_bytes = create_synthetic_regression_csv().encode("utf-8")
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_reg.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert upload_resp.status_code in [200, 201]
    dataset_id = upload_resp.json()["dataset_id"]

    # 2. Trigger repeated runs
    req_payload = {
        "dataset_id": dataset_id,
        "target_column": "price",
        "task_type": "regression",
        "seeds": [10, 20],
        "models": ["linear_regression"],
        "primary_metric": "r2",
        "bootstrap_resamples": 100,
    }
    run_resp = client.post("/api/v1/benchmarks/repeated-runs", json=req_payload)
    assert run_resp.status_code == 201, run_resp.text
    data = run_resp.json()

    assert data["n_successful_runs"] == 2
    assert "r2" in data["metric_summaries"]
    r2_stat = data["metric_summaries"]["r2"]
    assert r2_stat["mean"] is not None


def test_baseline_comparison_endpoint(research_bench_env):
    """Test standalone baseline comparison endpoint against an existing experiment."""
    client, _, _ = research_bench_env

    # 1. Upload dataset & train an experiment
    csv_bytes = create_synthetic_classification_csv().encode("utf-8")
    upload_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("synth_clf2.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    dataset_id = upload_resp.json()["dataset_id"]

    train_resp = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "label",
            "candidate_models": ["logistic_regression"],
            "random_state": 42,
        },
    )
    assert train_resp.status_code == 201, train_resp.text
    experiment_id = train_resp.json()["experiment_id"]

    # 2. Compare against baselines
    comp_resp = client.post(
        "/api/v1/benchmarks/baseline-comparison",
        json={
            "experiment_id": experiment_id,
            "primary_metric": "accuracy",
        },
    )
    assert comp_resp.status_code == 200, comp_resp.text
    results = comp_resp.json()
    assert len(results) >= 2
    for item in results:
        assert item["baseline_metrics"] is not None
        assert item["model_metrics"] is not None
        assert item["delta_absolute"] is not None
        assert item["selection_quality"] in ["outperformed", "tied", "underperformed"]


def test_invalid_requests(research_bench_env):
    """Verify validation and error handling."""
    client, _, _ = research_bench_env

    # Non-existent dataset
    resp = client.post(
        "/api/v1/benchmarks/repeated-runs",
        json={
            "dataset_id": "nonexistent_dataset_12345",
            "target_column": "target",
            "task_type": "classification",
            "seeds": [42, 101],
        },
    )
    assert resp.status_code == 404

    # Non-existent run group
    resp = client.get("/api/v1/benchmarks/repeated-runs/invalid_group_id")
    assert resp.status_code == 404
