import pytest
import numpy as np
import pandas as pd
from app.services.automl.baseline_evaluator import BaselineEvaluator
from app.schemas.research_benchmark import BaselineComparisonResult


def test_classification_baseline_evaluation():
    # Synthetic classification data: 2 classes
    np.random.seed(42)
    X_tr = pd.DataFrame(np.random.randn(80, 4), columns=["f1", "f2", "f3", "f4"])
    y_tr = pd.Series(np.random.choice([0, 1], size=80, p=[0.7, 0.3]))
    X_te = pd.DataFrame(np.random.randn(20, 4), columns=["f1", "f2", "f3", "f4"])
    y_te = pd.Series(np.random.choice([0, 1], size=20, p=[0.7, 0.3]))

    model_metrics = {"accuracy": 0.90, "f1": 0.88}

    results = BaselineEvaluator.evaluate_baselines(
        task_type="classification",
        preprocessor=None,
        X_train=X_tr,
        y_train=y_tr,
        X_test=X_te,
        y_test=y_te,
        model_metrics=model_metrics,
        primary_metric="accuracy",
        greater_is_better=True,
    )

    assert len(results) >= 2  # dummy + logistic
    dummy_res = next(r for r in results if "dummy" in r.baseline_name)
    linear_res = next(r for r in results if "logistic" in r.baseline_name)

    assert dummy_res.baseline_metrics.get("accuracy") is not None
    assert linear_res.baseline_metrics.get("accuracy") is not None
    assert dummy_res.selection_quality in ["outperformed", "tied", "underperformed"]
    assert dummy_res.delta_absolute is not None


def test_regression_baseline_evaluation():
    # Synthetic regression data
    np.random.seed(42)
    X_tr = pd.DataFrame(np.random.randn(100, 3), columns=["x1", "x2", "x3"])
    y_tr = pd.Series(2.5 * X_tr["x1"] - 1.2 * X_tr["x2"] + np.random.randn(100) * 0.1)
    X_te = pd.DataFrame(np.random.randn(30, 3), columns=["x1", "x2", "x3"])
    y_te = pd.Series(2.5 * X_te["x1"] - 1.2 * X_te["x2"] + np.random.randn(30) * 0.1)

    model_metrics = {"r2": 0.95, "rmse": 0.12}

    results = BaselineEvaluator.evaluate_baselines(
        task_type="regression",
        preprocessor=None,
        X_train=X_tr,
        y_train=y_tr,
        X_test=X_te,
        y_test=y_te,
        model_metrics=model_metrics,
        primary_metric="r2",
        greater_is_better=True,
    )

    assert len(results) >= 2
    dummy_res = next(r for r in results if "dummy" in r.baseline_name)
    linear_res = next(r for r in results if "linear" in r.baseline_name)

    assert dummy_res.baseline_metrics.get("r2") is not None
    assert linear_res.baseline_metrics.get("r2") is not None
    assert linear_res.selection_quality in ["outperformed", "tied", "underperformed"]


def test_baseline_delta_with_zero_or_negative_baseline():
    # Test safe percentage handling when baseline score <= 0 (e.g. bad R2 on noisy test set)
    X_tr = pd.DataFrame([[1.0], [2.0], [3.0]], columns=["x"])
    y_tr = pd.Series([1.0, 2.0, 3.0])
    X_te = pd.DataFrame([[10.0], [20.0]], columns=["x"])
    y_te = pd.Series([-5.0, -10.0])  # will yield negative R2 for mean dummy

    model_metrics = {"r2": 0.85}

    results = BaselineEvaluator.evaluate_baselines(
        task_type="regression",
        preprocessor=None,
        X_train=X_tr,
        y_train=y_tr,
        X_test=X_te,
        y_test=y_te,
        model_metrics=model_metrics,
        primary_metric="r2",
        greater_is_better=True,
    )

    dummy_res = next(r for r in results if "dummy" in r.baseline_name)
    # If baseline is <= 0, delta_percentage should be None to prevent distorted percentage ratios
    b_score = dummy_res.baseline_metrics.get("r2", 0.0)
    if b_score <= 0:
        assert dummy_res.delta_percentage is None
        assert "relative percentage omitted" in dummy_res.notes


def test_lower_is_better_metric_evaluation():
    # Test lower-is-better metrics (RMSE)
    np.random.seed(42)
    X_tr = pd.DataFrame(np.random.randn(60, 2), columns=["x1", "x2"])
    y_tr = pd.Series(np.random.randn(60) * 10)
    X_te = pd.DataFrame(np.random.randn(20, 2), columns=["x1", "x2"])
    y_te = pd.Series(np.random.randn(20) * 10)

    # Candidate has low RMSE (0.05), baseline will have high RMSE (~10)
    model_metrics = {"rmse": 0.05}

    results = BaselineEvaluator.evaluate_baselines(
        task_type="regression",
        preprocessor=None,
        X_train=X_tr,
        y_train=y_tr,
        X_test=X_te,
        y_test=y_te,
        model_metrics=model_metrics,
        primary_metric="rmse",
        greater_is_better=False,
    )

    dummy_res = next(r for r in results if "dummy" in r.baseline_name)
    # Since candidate RMSE (0.05) is much lower than dummy RMSE, it should be 'outperformed'
    assert dummy_res.selection_quality == "outperformed"
    assert dummy_res.delta_absolute < 0  # 0.05 - baseline < 0
