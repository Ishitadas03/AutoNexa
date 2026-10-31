"""Phase 17D regression tests for performance, limits, and stress contracts."""

import asyncio
from pathlib import Path
import tempfile
import time
import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.db.session import init_db
from app.schemas.prediction import PredictionRequest
from app.schemas.training import ModelStatus, TrainingRequest
from app.services.automl.prediction_service import PredictionService
from app.services.automl.training_service import TrainingService
from app.services.dataset_service import DatasetService


@pytest.fixture
def isolated_stress_env(tmp_path: Path):
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    metadata_db_path = tmp_path / "metadata.db"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    init_db(db_path=metadata_db_path)

    training_svc = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_svc = PredictionService(experiments_dir=experiments_dir)
    dataset_svc = DatasetService(upload_dir=upload_dir, metadata_db_path=metadata_db_path)

    return {
        "upload_dir": upload_dir,
        "experiments_dir": experiments_dir,
        "training_svc": training_svc,
        "prediction_svc": prediction_svc,
        "dataset_svc": dataset_svc,
    }


def test_training_budget_schema_bounds():
    """Verify that training budget is bounded by schema validation [5s, 300s]."""
    # Exceeds maximum 300s
    with pytest.raises(ValidationError):
        TrainingRequest(target_column="target", task_type="classification", time_budget_seconds=301)

    # Below minimum 5s
    with pytest.raises(ValidationError):
        TrainingRequest(target_column="target", task_type="classification", time_budget_seconds=4)

    # Valid boundary budgets
    req_min = TrainingRequest(target_column="target", task_type="classification", time_budget_seconds=5)
    assert req_min.time_budget_seconds == 5

    req_max = TrainingRequest(target_column="target", task_type="classification", time_budget_seconds=300)
    assert req_max.time_budget_seconds == 300


def test_row_and_column_limit_enforcement(isolated_stress_env):
    """Verify that exceeding configured row or column limits raises HTTP 400 safely."""
    upload_dir = isolated_stress_env["upload_dir"]
    training_svc = isolated_stress_env["training_svc"]

    df = pd.DataFrame({"f1": range(10), "f2": range(10), "target": [0, 1] * 5})
    df.to_csv(upload_dir / "test_ds.csv", index=False)

    # Simulate strict row limit
    orig_rows = training_svc.max_dataset_rows
    training_svc.max_dataset_rows = 5
    try:
        with pytest.raises(HTTPException) as exc_info:
            training_svc.train_experiment(
                "test_ds",
                TrainingRequest(target_column="target", task_type="classification", time_budget_seconds=30),
            )
        assert exc_info.value.status_code == 400
        assert "exceed maximum supported training limit" in exc_info.value.detail
    finally:
        training_svc.max_dataset_rows = orig_rows


def test_prediction_batch_size_limit(isolated_stress_env):
    """Verify that prediction JSON requests exceeding max_prediction_records are rejected."""
    upload_dir = isolated_stress_env["upload_dir"]
    training_svc = isolated_stress_env["training_svc"]
    prediction_svc = isolated_stress_env["prediction_svc"]

    # Train a fast model
    df = pd.DataFrame({"f1": [1.0, 2.0, 3.0, 4.0] * 5, "target": [0, 1, 0, 1] * 5})
    df.to_csv(upload_dir / "quick_ds.csv", index=False)

    train_res = training_svc.train_experiment(
        "quick_ds",
        TrainingRequest(target_column="target", task_type="classification", models=["dummy"], time_budget_seconds=30),
    )

    # Exceed limit of 1,000 records
    oversized = [{"f1": 1.0} for _ in range(1001)]
    with pytest.raises(HTTPException) as exc_info:
        prediction_svc.predict_records(train_res.experiment_id, PredictionRequest(records=oversized))

    assert exc_info.value.status_code == 400
    assert "exceeds maximum permitted prediction batch size" in exc_info.value.detail


def test_time_budget_candidate_skipping(isolated_stress_env, monkeypatch):
    """Verify that timeout budget skipping executes safely without process crashing."""
    upload_dir = isolated_stress_env["upload_dir"]
    training_svc = isolated_stress_env["training_svc"]

    df = pd.DataFrame({"f1": range(20), "target": [0, 1] * 10})
    df.to_csv(upload_dir / "timeout_ds.csv", index=False)

    real_monotonic = time.monotonic
    start_time = real_monotonic()
    calls = 0

    def simulated_monotonic():
        nonlocal calls
        calls += 1
        # Advance clock by 100 seconds after initial setup
        if calls > 4:
            return start_time + 100.0
        return real_monotonic()

    monkeypatch.setattr("time.monotonic", simulated_monotonic)

    req = TrainingRequest(
        target_column="target",
        task_type="classification",
        models=["dummy", "decision_tree", "logistic_regression"],
        time_budget_seconds=10,
        random_state=42,
    )

    res = training_svc.train_experiment("timeout_ds", req)
    assert res.best_model is not None
    skipped_count = sum(1 for m in res.models_evaluated if m.status == ModelStatus.SKIPPED_TIMEOUT)
    assert skipped_count > 0
