"""FastAPI route integration tests for Multi-Objective AutoML Optimization endpoints."""

import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.multi_objective_service import (
    MultiObjectiveService,
    get_multi_objective_service,
)
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def mo_routes_env(tmp_path: Path):
    """Fixture providing isolated environment for Phase 10B multi-objective route tests."""
    upload_dir = tmp_path / "mo_uploads"
    experiments_dir = tmp_path / "mo_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    mo_service = MultiObjectiveService(
        upload_dir=upload_dir,
        experiments_dir=experiments_dir,
        analysis_service=analysis_service,
    )

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_multi_objective_service] = lambda: mo_service

    client = TestClient(app)
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def make_test_csv() -> str:
    """Generate small classification dataset."""
    lines = ["x1,x2,category,label"]
    for i in range(50):
        c = "cat_a" if i % 2 == 0 else "cat_b"
        lbl = 1 if i % 3 == 0 else 0
        lines.append(f"{i * 1.5},{50 - i},{c},{lbl}")
    return "\n".join(lines) + "\n"


def test_multi_objective_endpoints_full_lifecycle(mo_routes_env):
    """Test POST /multi-objective, GET report, GET pareto, POST select, and GET export-csv."""
    client, upload_dir, _ = mo_routes_env

    # 1. Upload sample dataset
    csv_bytes = make_test_csv().encode("utf-8")
    up_resp = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("test_mo.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert up_resp.status_code == 201
    dataset_id = up_resp.json()["dataset_id"]

    # 2. POST /api/v1/benchmarks/multi-objective
    payload = {
        "dataset_id": dataset_id,
        "target_column": "label",
        "candidate_models": ["logistic_regression", "decision_tree"],
        "include_hpo_candidates": False,
        "evaluation_strategy": "cross_validation",
        "cv_folds": 2,
        "test_size": 0.2,
        "primary_metric": "f1_weighted",
        "random_state": 42,
        "selection_policy": "best_performance_constrained",
    }
    create_resp = client.post("/api/v1/benchmarks/multi-objective", json=payload)
    assert create_resp.status_code == 201
    exp_data = create_resp.json()

    exp_id = exp_data["experiment_id"]
    assert exp_id is not None
    assert len(exp_data["candidates"]) >= 2
    assert len(exp_data["pareto_frontier_candidate_ids"]) > 0
    assert exp_data["selection"]["selected_candidate_id"] is not None

    # 3. GET /api/v1/benchmarks/multi-objective/{exp_id}
    get_resp = client.get(f"/api/v1/benchmarks/multi-objective/{exp_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["experiment_id"] == exp_id

    # 4. GET /api/v1/benchmarks/multi-objective/{exp_id}/pareto
    pareto_resp = client.get(f"/api/v1/benchmarks/multi-objective/{exp_id}/pareto")
    assert pareto_resp.status_code == 200
    pareto_list = pareto_resp.json()
    assert isinstance(pareto_list, list)
    assert len(pareto_list) == len(exp_data["pareto_frontier_candidate_ids"])
    for item in pareto_list:
        assert item["is_pareto_optimal"] is True

    # 5. POST /api/v1/benchmarks/multi-objective/{exp_id}/select with custom constraints
    select_payload = {
        "policy": "lowest_latency_constrained",
        "constraints": {
            "max_training_duration_seconds": 60.0,
        },
    }
    sel_resp = client.post(f"/api/v1/benchmarks/multi-objective/{exp_id}/select", json=select_payload)
    assert sel_resp.status_code == 200
    sel_data = sel_resp.json()
    assert sel_data["policy_used"] == "lowest_latency_constrained"
    assert sel_data["satisfies_all_constraints"] is True
    assert sel_data["selected_candidate_id"] is not None

    # 6. GET /api/v1/benchmarks/multi-objective/{exp_id}/export-csv
    csv_resp = client.get(f"/api/v1/benchmarks/multi-objective/{exp_id}/export-csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "candidate_id" in csv_resp.text
    assert "inference_latency_ms_per_sample" in csv_resp.text
