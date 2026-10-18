"""Automated test suite for AutoNexa Phase 8: Reproducible Research Benchmarking."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.benchmark import BenchmarkComparisonResponse
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.benchmark_service import (
    BenchmarkService,
    get_benchmark_service,
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
def benchmark_env(tmp_path: Path):
    """Fixture providing isolated environment for benchmark tests."""
    upload_dir = tmp_path / "bench_uploads"
    experiments_dir = tmp_path / "bench_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    benchmark_service = BenchmarkService(experiments_dir=experiments_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_benchmark_service] = lambda: benchmark_service

    client = TestClient(app)
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def upload_synthetic_dataset(client: TestClient, prefix: str = "A") -> str:
    """Helper to upload a synthetic classification dataset and return dataset_id."""
    rows = ["feature1,feature2,target"]
    for i in range(40):
        f1 = float(i)
        f2 = float(i * 2) if prefix == "A" else float(i * 3 + 10)
        label = "pass" if i >= 20 else "fail"
        rows.append(f"{f1},{f2},{label}")
    csv_content = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": (f"bench_data_{prefix}.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert up.status_code == 201
    return up.json()["dataset_id"]


def test_benchmark_strictly_comparable_models(benchmark_env) -> None:
    """Requirement 4: Compare two models trained under strictly identical data splits and conditions."""
    client, _, _ = benchmark_env
    dataset_id = upload_synthetic_dataset(client, prefix="A")

    # Train Model 1 (Random Forest)
    tr1 = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert tr1.status_code == 201
    exp1_id = tr1.json()["experiment_id"]

    # Train Model 2 (Decision Tree)
    tr2 = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "models": ["decision_tree"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    assert tr2.status_code == 201
    exp2_id = tr2.json()["experiment_id"]

    # Execute benchmark comparison
    bench_res = client.post(
        "/api/v1/benchmarks/compare",
        json={
            "experiment_ids": [exp1_id, exp2_id],
            "baseline_experiment_id": exp1_id,
        },
    )
    assert bench_res.status_code == 200
    data = bench_res.json()

    obj = BenchmarkComparisonResponse(**data)
    assert obj.is_strictly_comparable is True
    assert obj.comparability_verdict == "strictly_comparable"
    assert len(obj.comparability_warnings) == 0
    assert obj.models_compared_count == 2
    assert len(obj.leaderboard) == 2

    # Check ranks 1 and 2
    ranks = [entry.rank for entry in obj.leaderboard]
    assert ranks == [1, 2]

    # Check baseline deltas
    baseline_entry = next(e for e in obj.leaderboard if e.experiment_id == exp1_id)
    assert baseline_entry.is_baseline is True
    assert baseline_entry.delta_primary_metric == 0.0

    challenger_entry = next(e for e in obj.leaderboard if e.experiment_id == exp2_id)
    assert challenger_entry.is_baseline is False
    assert challenger_entry.delta_primary_metric is not None

    # Check reproducibility manifest
    manifest = obj.reproducibility_manifest
    assert len(manifest["dataset_fingerprints"]) == 1
    assert len(manifest["random_seeds"]) == 1


def test_benchmark_comparability_audit_differing_datasets(benchmark_env) -> None:
    """Requirement 4 & 5: Detect differing dataset fingerprints and flag comparison as non-comparable."""
    client, _, _ = benchmark_env
    ds1_id = upload_synthetic_dataset(client, prefix="A")
    ds2_id = upload_synthetic_dataset(client, prefix="B")

    # Train on dataset 1
    tr1 = client.post(
        f"/api/v1/datasets/{ds1_id}/train",
        json={
            "target_column": "target",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    exp1 = tr1.json()["experiment_id"]

    # Train on dataset 2
    tr2 = client.post(
        f"/api/v1/datasets/{ds2_id}/train",
        json={
            "target_column": "target",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "test_size": 0.25,
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    exp2 = tr2.json()["experiment_id"]

    res = client.post(
        "/api/v1/benchmarks/compare",
        json={"experiment_ids": [exp1, exp2]},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["is_strictly_comparable"] is False
    assert data["comparability_verdict"] == "non_comparable"

    # Must contain critical warning about dataset fingerprint mismatch
    crit_warnings = [w for w in data["comparability_warnings"] if w["severity"] == "critical"]
    assert len(crit_warnings) >= 1
    assert any(w["dimension"] == "dataset_fingerprint" for w in crit_warnings)


def test_benchmark_comparability_differing_seeds(benchmark_env) -> None:
    """Requirement 4: Detect differing random seeds across experiments."""
    client, _, _ = benchmark_env
    dataset_id = upload_synthetic_dataset(client, prefix="A")

    tr1 = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "random_state": 42,
            "time_budget_seconds": 30,
        },
    )
    exp1 = tr1.json()["experiment_id"]

    tr2 = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={
            "target_column": "target",
            "models": ["random_forest"],
            "evaluation_strategy": "holdout",
            "random_state": 99,
            "time_budget_seconds": 30,
        },
    )
    exp2 = tr2.json()["experiment_id"]

    res = client.post(
        "/api/v1/benchmarks/compare",
        json={"experiment_ids": [exp1, exp2]},
    )
    assert res.status_code == 200
    data = res.json()

    assert any(w["dimension"] == "random_state" for w in data["comparability_warnings"])


def test_benchmark_task_mismatch_validation(benchmark_env) -> None:
    """Requirement 4: Reject comparison of experiments having conflicting task types."""
    client, _, _ = benchmark_env
    ds_id = upload_synthetic_dataset(client, prefix="A")

    # Classification
    tr1 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["random_forest"], "time_budget_seconds": 30},
    )
    exp1 = tr1.json()["experiment_id"]

    # Regression on feature2
    tr2 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "feature2", "task_type": "regression", "models": ["linear_regression"], "time_budget_seconds": 30},
    )
    exp2 = tr2.json()["experiment_id"]

    res = client.post(
        "/api/v1/benchmarks/compare",
        json={"experiment_ids": [exp1, exp2]},
    )
    assert res.status_code == 400
    assert "incompatible task types" in res.json()["detail"].lower()


def test_benchmark_input_validation(benchmark_env) -> None:
    """Requirement 4: Proper validation on experiment count, baseline presence, and non-existent IDs."""
    client, _, _ = benchmark_env

    # 1. Less than 2 experiments
    res_few = client.post("/api/v1/benchmarks/compare", json={"experiment_ids": ["exp-1"]})
    assert res_few.status_code == 422 or res_few.status_code == 400

    # 2. Unknown experiment ID
    res_unknown = client.post(
        "/api/v1/benchmarks/compare",
        json={"experiment_ids": ["unknown-1", "unknown-2"]},
    )
    assert res_unknown.status_code == 404

    # 3. Baseline ID not in compared experiments
    ds_id = upload_synthetic_dataset(client, prefix="A")
    tr1 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["random_forest"], "time_budget_seconds": 30},
    )
    exp1 = tr1.json()["experiment_id"]
    tr2 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["decision_tree"], "time_budget_seconds": 30},
    )
    exp2 = tr2.json()["experiment_id"]

    res_bad_baseline = client.post(
        "/api/v1/benchmarks/compare",
        json={"experiment_ids": [exp1, exp2], "baseline_experiment_id": "other-nonexistent-exp"},
    )
    assert res_bad_baseline.status_code == 400
    assert "not in the list of compared" in res_bad_baseline.json()["detail"].lower()
