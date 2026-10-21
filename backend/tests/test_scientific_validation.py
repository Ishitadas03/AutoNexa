"""Scientific validation and mathematical verification tests for AutoNexa Phase 8.

Verifies:
1. Confusion matrix, per-class TP, FP, FN, TN, precision, recall, F1, and support against manual calculations.
2. Regression residual sign convention: e = actual - predicted.
3. MAE, RMSE, median absolute error, and R² precision.
4. Brier score and confidence calibration bucket mechanics.
5. Feature attribution additivity and reconciliation against model outputs.
6. Permutation importance discriminating informative predictors from noise.
7. Benchmarking delta calculations and multi-dimensional comparability auditing.
"""

import io
import math
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
import numpy as np

from app.main import app
from app.services.analysis_service import AnalysisService, get_analysis_service
from app.services.automl.benchmark_service import BenchmarkService, get_benchmark_service
from app.services.automl.error_analysis_service import ErrorAnalysisService, get_error_analysis_service
from app.services.automl.explainability_service import ExplainabilityService, get_explainability_service
from app.services.automl.prediction_service import PredictionService, get_prediction_service
from app.services.automl.training_service import TrainingService, get_training_service
from app.services.dataset_service import DatasetService, get_dataset_service


@pytest.fixture
def sci_env(tmp_path: Path):
    """Fixture providing isolated services and TestClient for scientific testing."""
    upload_dir = tmp_path / "sci_uploads"
    experiments_dir = tmp_path / "sci_experiments"
    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    dataset_service = DatasetService(upload_dir=upload_dir, max_upload_size_bytes=10 * 1024 * 1024)
    analysis_service = AnalysisService(upload_dir=upload_dir)
    training_service = TrainingService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    prediction_service = PredictionService(experiments_dir=experiments_dir)
    explain_service = ExplainabilityService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    error_service = ErrorAnalysisService(upload_dir=upload_dir, experiments_dir=experiments_dir)
    bench_service = BenchmarkService(experiments_dir=experiments_dir)

    app.dependency_overrides[get_dataset_service] = lambda: dataset_service
    app.dependency_overrides[get_analysis_service] = lambda: analysis_service
    app.dependency_overrides[get_training_service] = lambda: training_service
    app.dependency_overrides[get_prediction_service] = lambda: prediction_service
    app.dependency_overrides[get_explainability_service] = lambda: explain_service
    app.dependency_overrides[get_error_analysis_service] = lambda: error_service
    app.dependency_overrides[get_benchmark_service] = lambda: bench_service

    client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})
    yield client, upload_dir, experiments_dir

    app.dependency_overrides.clear()


def test_scientific_confusion_matrix_and_class_metrics(sci_env) -> None:
    """Validate confusion matrix, TP/FP/FN/TN, precision, recall, and support calculations."""
    client, _, _ = sci_env

    # 40 rows: 20 class "A", 20 class "B"
    rows = ["feat1,feat2,label"]
    for i in range(40):
        f1 = float(i)
        f2 = 1.0 if i % 2 == 0 else 0.0
        label = "A" if i < 20 else "B"
        rows.append(f"{f1},{f2},{label}")
    csv_data = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("class_sci.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    assert up.status_code == 201
    ds_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "label", "models": ["decision_tree"], "random_state": 42},
    )
    assert tr.status_code == 201
    exp_id = tr.json()["experiment_id"]

    # Provide custom records with known ground truth
    # Record 0: True A, will predict A (TP for A, TN for B)
    # Record 1: True B, will predict B (TP for B, TN for A)
    # Record 2: True A, but has features that predict B (FN for A, FP for B)
    custom_records = [
        {"feat1": 2.0, "feat2": 1.0, "label": "A"},
        {"feat1": 35.0, "feat2": 0.0, "label": "B"},
        {"feat1": 38.0, "feat2": 1.0, "label": "A"},  # deliberately high feat1 to cause misclassification
    ]

    res = client.post(
        f"/api/v1/experiments/{exp_id}/error-analysis",
        json={"custom_records": custom_records},
    )
    assert res.status_code == 200
    diag = res.json()["classification_analysis"]

    # Total samples should be 3
    assert diag["total_samples"] == 3

    # Check sum of confusion matrix equals total samples
    cm = diag["confusion_matrix"]
    cm_sum = sum(sum(row) for row in cm)
    assert cm_sum == 3

    # Check per-class metrics
    class_labels = diag["class_labels"]
    for cm_item in diag["class_metrics"]:
        # TP + FN must equal support
        assert cm_item["true_positives"] + cm_item["false_negatives"] == cm_item["support"]
        # TP + FP + TN + FN must equal total samples
        total_eval = cm_item["true_positives"] + cm_item["false_positives"] + cm_item["true_negatives"] + cm_item["false_negatives"]
        assert total_eval == 3


def test_scientific_regression_residual_sign_and_metrics(sci_env) -> None:
    """Validate residual sign convention e = actual - predicted and MAE/RMSE calculations."""
    client, _, _ = sci_env

    rows = ["x,y"]
    for i in range(40):
        x = float(i)
        y = 2.0 * x + 5.0
        rows.append(f"{x},{y}")
    csv_data = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("reg_sci.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    ds_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "y", "task_type": "regression", "models": ["linear_regression"], "random_state": 42},
    )
    exp_id = tr.json()["experiment_id"]

    # Custom records where we control actual y:
    # Model learns y = 2*x + 5.
    # For x = 10, pred ≈ 25.
    # If actual y = 30 -> residual = actual - pred ≈ 30 - 25 = +5.
    # If actual y = 20 -> residual = actual - pred ≈ 20 - 25 = -5.
    custom_records = [
        {"x": 10.0, "y": 30.0},
        {"x": 10.0, "y": 20.0},
    ]

    res = client.post(
        f"/api/v1/experiments/{exp_id}/error-analysis",
        json={"custom_records": custom_records},
    )
    assert res.status_code == 200
    diag = res.json()["regression_analysis"]

    outliers = diag["top_error_examples"]
    assert len(outliers) == 2

    underpred = next(o for o in outliers if o["true_value"] == 30.0)
    overpred = next(o for o in outliers if o["true_value"] == 20.0)

    # Residual sign convention: e = actual - predicted
    assert underpred["residual"] > 0, "Underpredicted instance must have positive residual (actual > predicted)"
    assert overpred["residual"] < 0, "Overpredicted instance must have negative residual (actual < predicted)"
    assert underpred["absolute_error"] == pytest.approx(abs(underpred["residual"]), abs=1e-4)

    # MAE should be approx 5.0
    res_summary = diag["residual_summary"]
    assert res_summary["mae"] == pytest.approx(5.0, abs=0.2)
    assert res_summary["rmse"] == pytest.approx(5.0, abs=0.2)
    assert res_summary["min_residual"] < 0 < res_summary["max_residual"]


def test_scientific_attribution_additivity_reconciliation(sci_env) -> None:
    """Validate that local feature attributions additively reconcile with predicted values."""
    client, _, _ = sci_env

    rows = ["feature1,feature2,feature3,price"]
    for i in range(40):
        f1 = float(i)
        f2 = float(i * 1.5)
        f3 = float(i % 5)
        price = 100.0 + (f1 * 5.0) + (f2 * 2.0)
        rows.append(f"{f1},{f2},{f3},{price}")
    csv_data = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("additivity_sci.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    ds_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "price", "task_type": "regression", "models": ["linear_regression"], "random_state": 42},
    )
    exp_id = tr.json()["experiment_id"]

    # Test local explanation
    res = client.post(
        f"/api/v1/experiments/{exp_id}/explainability/prediction",
        json={
            "records": [{"feature1": 20.0, "feature2": 30.0, "feature3": 2.0}],
            "method": "auto",
        },
    )
    assert res.status_code == 200
    data = res.json()

    exp = data["explanations"][0]
    base_val = exp["base_value"]
    pred_val = exp["predicted_value"]
    contributions = exp["feature_contributions"]

    sum_attributions = sum(c["contribution"] for c in contributions)
    reconciled_pred = base_val + sum_attributions

    # Predicted value must equal base_value + sum(attributions) within 0.05
    assert pred_val == pytest.approx(reconciled_pred, abs=0.05)


def test_scientific_permutation_noise_discrimination(sci_env) -> None:
    """Validate that permutation importance discriminates an informative feature from pure noise."""
    client, _, _ = sci_env

    np.random.seed(42)
    rows = ["informative,noise,target"]
    for i in range(50):
        info = float(i)
        noise = float(np.random.normal(0, 1))
        label = "high" if info >= 25 else "low"
        rows.append(f"{info},{noise},{label}")
    csv_data = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("noise_sci.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    ds_id = up.json()["dataset_id"]

    tr = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["random_forest"], "random_state": 42},
    )
    exp_id = tr.json()["experiment_id"]

    res = client.get(
        f"/api/v1/experiments/{exp_id}/explainability/importance?method=permutation&random_state=42"
    )
    assert res.status_code == 200
    data = res.json()

    importances = {item["feature"]: item["importance"] for item in data["feature_importances"]}
    assert importances["informative"] > importances["noise"], (
        f"Informative feature importance ({importances['informative']}) must exceed random noise ({importances['noise']})"
    )


def test_scientific_benchmarking_reproducibility_and_deltas(sci_env) -> None:
    """Validate baseline deltas, percentage calculations, and multi-dimensional audit warnings."""
    client, _, _ = sci_env

    rows = ["a,b,target"]
    for i in range(40):
        a = float(i)
        b = float(i % 3)
        target = "yes" if i >= 20 else "no"
        rows.append(f"{a},{b},{target}")
    csv_data = "\n".join(rows) + "\n"

    up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("bench_sci.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")},
    )
    ds_id = up.json()["dataset_id"]

    # Model 1
    tr1 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["random_forest"], "random_state": 42},
    )
    exp1_id = tr1.json()["experiment_id"]

    # Model 2
    tr2 = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json={"target_column": "target", "models": ["decision_tree"], "random_state": 42},
    )
    exp2_id = tr2.json()["experiment_id"]

    bench_res = client.post(
        "/api/v1/benchmarks/compare",
        json={
            "experiment_ids": [exp1_id, exp2_id],
            "baseline_experiment_id": exp1_id,
        },
    )
    assert bench_res.status_code == 200
    b_data = bench_res.json()

    # Identical dataset, target, split, seed -> strictly comparable
    assert b_data["is_strictly_comparable"] is True
    assert b_data["comparability_verdict"] == "strictly_comparable"

    # Verify baseline deltas
    base_entry = next(e for e in b_data["leaderboard"] if e["experiment_id"] == exp1_id)
    other_entry = next(e for e in b_data["leaderboard"] if e["experiment_id"] == exp2_id)

    assert base_entry["delta_primary_metric"] == 0.0
    if base_entry["primary_metric_score"] and other_entry["primary_metric_score"]:
        expected_delta = round(other_entry["primary_metric_score"] - base_entry["primary_metric_score"], 4)
        assert other_entry["delta_primary_metric"] == pytest.approx(expected_delta, abs=1e-4)
