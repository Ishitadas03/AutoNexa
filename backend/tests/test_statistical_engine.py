import pytest
import numpy as np
from app.services.automl.statistical_engine import StatisticalEngine
from app.schemas.research_benchmark import MetricStatisticalSummary


def test_empty_or_all_nan_series():
    # When no valid values exist
    summary = StatisticalEngine.compute_summary([], "accuracy", greater_is_better=True)
    assert summary.valid_runs == 0
    assert summary.mean == 0.0
    assert summary.std is None
    assert summary.ci_95_t is None
    assert summary.ci_95_bootstrap is None
    assert "No valid numerical observations" in summary.interpretation_notes

    summary_nan = StatisticalEngine.compute_summary([None, np.nan], "f1")
    assert summary_nan.valid_runs == 0
    assert summary_nan.mean == 0.0


def test_single_value_sample():
    # With N=1, mean=value, but sample std (ddof=1) is undefined and Student's t is undefined
    summary = StatisticalEngine.compute_summary([0.85], "accuracy", greater_is_better=True)
    assert summary.valid_runs == 1
    assert summary.mean == 0.85
    assert summary.std is None  # Bessel's correction ddof=1 requires N > 1
    assert summary.min == 0.85
    assert summary.max == 0.85
    assert summary.median == 0.85
    assert summary.ci_95_t is None
    assert "Single observation" in summary.interpretation_notes


def test_multiple_identical_values():
    # Constant values: std should be 0.0, CI bounds equal the mean
    values = [0.80, 0.80, 0.80, 0.80, 0.80]
    summary = StatisticalEngine.compute_summary(values, "accuracy", greater_is_better=True)
    assert summary.valid_runs == 5
    assert summary.mean == 0.80
    assert summary.std == 0.0
    assert summary.median == 0.80
    assert summary.ci_95_t == [0.80, 0.80]
    assert summary.ci_95_bootstrap == [0.80, 0.80]


def test_known_statistical_calculation():
    # Known dataset: [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
    # N = 8
    # Mean = 40 / 8 = 5.0
    # Median = (4.0 + 5.0) / 2 = 4.5
    # Variance (ddof=1): sum((x-5)^2)/(8-1) = (9 + 1 + 1 + 1 + 0 + 0 + 4 + 16)/7 = 32/7 ~= 4.571428
    # Std ~= 2.1380899
    values = [2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0]
    summary = StatisticalEngine.compute_summary(values, "rmse", greater_is_better=False)
    assert summary.valid_runs == 8
    assert summary.mean == 5.0
    assert summary.median == 4.5
    assert summary.min == 2.0
    assert summary.max == 9.0
    assert summary.std == pytest.approx(round(float(np.std(values, ddof=1)), 4), abs=1e-4)

    # Student's t CI check
    ci_t = summary.ci_95_t
    assert ci_t is not None
    assert ci_t[0] < summary.mean < ci_t[1]

    # Bootstrap CI check
    ci_boot = summary.ci_95_bootstrap
    assert ci_boot is not None
    assert ci_boot[0] <= summary.mean <= ci_boot[1]


def test_bootstrap_determinism():
    # Bootstrap should use deterministic RandomState(42) so outputs are strictly reproducible
    values = [0.81, 0.83, 0.79, 0.85, 0.82]
    summary1 = StatisticalEngine.compute_summary(values, "accuracy", bootstrap_resamples=500, random_state=42)
    summary2 = StatisticalEngine.compute_summary(values, "accuracy", bootstrap_resamples=500, random_state=42)
    assert summary1.ci_95_bootstrap == summary2.ci_95_bootstrap


def test_failed_runs_accounting():
    # Ensure failed runs are not replaced with 0.0 scores
    values = [0.90, None, 0.92, float('nan'), 0.88]
    summary = StatisticalEngine.compute_summary(values, "accuracy")
    assert summary.valid_runs == 3
    # Mean should be (0.90 + 0.92 + 0.88) / 3 = 0.90, NOT 0.54
    assert summary.mean == pytest.approx(0.90, abs=1e-4)
    assert summary.min == 0.88
    assert summary.max == 0.92


def test_negative_metric_support():
    # For metrics like log loss or negative R2
    values = [-1.5, -0.8, -1.2, -2.0]
    summary = StatisticalEngine.compute_summary(values, "neg_mean_squared_error", greater_is_better=True)
    assert summary.valid_runs == 4
    assert summary.mean == pytest.approx(round(float(np.mean(values)), 4), abs=1e-4)
    assert summary.min == -2.0
    assert summary.max == -0.8
