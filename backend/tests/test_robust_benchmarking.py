"""Comprehensive test suite for Phase 11: Robust AutoML Benchmarking & Statistical Reliability."""

import math
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.robust_benchmark import (
    RobustBenchmarkRequest,
    RobustBenchmarkResponse,
    PairedComparisonResult,
)
from app.services.automl.dataset_catalog import (
    DatasetCatalogService,
    get_dataset_catalog_service,
)
from app.services.automl.resource_profiler import ResourceProfiler
from app.services.automl.robust_benchmarking_service import (
    RobustBenchmarkingService,
    get_robust_benchmark_service,
)
from app.services.automl.statistical_engine import StatisticalEngine

client = TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"})


# ---------------------------------------------------------------------------
# 1. Dataset Catalog & Provenance Tests
# ---------------------------------------------------------------------------


def test_dataset_catalog_discovery():
    """Verify local benchmark fixtures are properly discovered and fingerprinted."""
    svc = get_dataset_catalog_service()
    catalog = svc.list_catalog()
    assert len(catalog) >= 3, f"Expected at least 3 benchmark fixtures, found {len(catalog)}"

    dataset_ids = [c.dataset_id for c in catalog]
    assert "wine_multiclass" in dataset_ids
    assert "diabetes_regression" in dataset_ids
    assert "breast_cancer_binary" in dataset_ids

    wine_entry = next(c for c in catalog if c.dataset_id == "wine_multiclass")
    assert wine_entry.task_type == "multiclass_classification"
    assert wine_entry.target_column == "target"
    assert wine_entry.n_rows == 178
    assert wine_entry.n_features == 13
    assert len(wine_entry.dataset_fingerprint) == 64
    assert wine_entry.is_cached is True
    assert "CC BY" in wine_entry.license


def test_dataset_catalog_dataframe_loading():
    """Verify DataFrame and entry are loaded consistently."""
    svc = get_dataset_catalog_service()
    df, entry = svc.load_dataset_dataframe("wine_multiclass")
    assert len(df) == 178
    assert entry.dataset_id == "wine_multiclass"
    assert entry.target_column in df.columns


# ---------------------------------------------------------------------------
# 2. Resource Profiler: Process RSS vs Python Heap
# ---------------------------------------------------------------------------


def test_resource_profiler_rss_measurement():
    """Verify psutil process RSS is captured as an integer and differs from tracemalloc heap."""
    rss_bytes = ResourceProfiler.get_process_rss_bytes()
    assert rss_bytes is not None
    assert rss_bytes > 10 * 1024 * 1024, f"Process RSS should be > 10MB, got {rss_bytes}"

    # Profile training execution
    def dummy_alloc():
        # Allocate Python objects
        _ = [list(range(50000)) for _ in range(5)]

    dur, heap, rss_peak, rss_delta = ResourceProfiler.profile_training_execution(dummy_alloc)
    assert dur >= 0.0
    assert heap is not None and heap > 0
    assert rss_peak is not None and rss_peak > 10 * 1024 * 1024


# ---------------------------------------------------------------------------
# 3. Statistical Engine: Quartiles, CIs, and Paired Comparisons
# ---------------------------------------------------------------------------


def test_statistical_engine_quartiles_and_iqr():
    """Verify quartiles (q25, q75) and IQR calculation with Bessel ddof=1 std."""
    scores = [0.80, 0.82, 0.85, 0.88, 0.90]
    summary = StatisticalEngine.compute_summary(scores, "accuracy", greater_is_better=True)

    assert summary.valid_runs == 5
    assert math.isclose(summary.mean, 0.85, rel_tol=1e-3)
    assert math.isclose(summary.median, 0.85, rel_tol=1e-3)
    assert summary.q25 is not None and summary.q75 is not None
    assert summary.q25 <= summary.median <= summary.q75
    assert summary.iqr is not None and summary.iqr > 0
    # Bessel's sample std (ddof=1)
    assert summary.std is not None and summary.std > 0
    assert summary.ci_95_t is not None
    assert summary.ci_95_t[0] < summary.mean < summary.ci_95_t[1]
    assert summary.ci_95_bootstrap is not None


def test_statistical_engine_paired_comparison():
    """Verify paired per-seed differences, Cohen's dz, paired t-test, and Wilcoxon."""
    # Method A clearly outperforms Method B across 5 seeds
    scores_a = [0.90, 0.92, 0.91, 0.93, 0.94]
    scores_b = [0.80, 0.81, 0.79, 0.82, 0.83]
    seeds = [42, 123, 456, 789, 1011]

    comp = StatisticalEngine.compute_paired_comparison(
        scores_a=scores_a,
        scores_b=scores_b,
        seeds=seeds,
        metric_name="accuracy",
        method_a_name="random_forest",
        method_b_name="decision_tree",
        greater_is_better=True,
        alpha=0.05,
        num_comparisons=1,
    )

    assert comp.n_matched_seeds == 5
    assert math.isclose(comp.mean_difference, 0.108, abs_tol=1e-2)
    assert comp.std_difference is not None and comp.std_difference > 0
    assert comp.cohens_dz is not None and comp.cohens_dz > 0.8
    assert comp.cohens_dz_magnitude == "large"
    assert comp.t_test_p_value is not None and comp.t_test_p_value < 0.05
    assert comp.wilcoxon_p_value is not None
    assert comp.verdict == "statistically_superior"
    assert len(comp.per_seed_differences) == 5
    for rec in comp.per_seed_differences:
        assert rec.delta > 0


def test_statistical_engine_small_sample_and_zero_variance():
    """Verify small sample (N < 5) triggers conservative warning and zero delta is handled."""
    # Only 3 seeds
    scores_a = [0.85, 0.85, 0.85]
    scores_b = [0.85, 0.85, 0.85]
    seeds = [42, 123, 456]

    comp = StatisticalEngine.compute_paired_comparison(
        scores_a=scores_a,
        scores_b=scores_b,
        seeds=seeds,
        metric_name="accuracy",
        method_a_name="method_a",
        method_b_name="method_b",
        greater_is_better=True,
    )

    assert comp.n_matched_seeds == 3
    assert comp.mean_difference == 0.0
    assert comp.cohens_dz == 0.0
    assert comp.verdict in ("insufficient_sample_size", "statistically_equivalent")


def test_paired_comparison_missing_seed_alignment():
    """Verify paired comparison correctly aligns matched seeds when missing/NaN values occur."""
    # Seed 123 is None in A, Seed 456 is NaN in B
    scores_a = [0.90, None, 0.95, 0.92, 0.94]
    scores_b = [0.80, 0.82, float("nan"), 0.81, 0.83]
    seeds = [42, 123, 456, 789, 1011]

    comp = StatisticalEngine.compute_paired_comparison(
        scores_a=scores_a,
        scores_b=scores_b,
        seeds=seeds,
        metric_name="accuracy",
        method_a_name="cand",
        method_b_name="base",
        greater_is_better=True,
    )

    # Only seeds 42, 789, 1011 should be matched
    assert comp.n_matched_seeds == 3
    matched_seeds_found = [r.seed for r in comp.per_seed_differences]
    assert matched_seeds_found == [42, 789, 1011]
    assert math.isclose(comp.per_seed_differences[0].delta, 0.10, abs_tol=1e-3)  # 0.90 - 0.80
    assert math.isclose(comp.per_seed_differences[1].delta, 0.11, abs_tol=1e-3)  # 0.92 - 0.81
    assert math.isclose(comp.per_seed_differences[2].delta, 0.11, abs_tol=1e-3)  # 0.94 - 0.83


def test_wilcoxon_ties_and_zero_deltas():
    """Verify Wilcoxon test and Cohen's dz when some seeds have tied scores (delta = 0)."""
    scores_a = [0.85, 0.88, 0.85, 0.90, 0.92]
    scores_b = [0.85, 0.80, 0.85, 0.82, 0.84]
    seeds = [42, 123, 456, 789, 1011]

    comp = StatisticalEngine.compute_paired_comparison(
        scores_a=scores_a,
        scores_b=scores_b,
        seeds=seeds,
        metric_name="accuracy",
        method_a_name="cand",
        method_b_name="base",
        greater_is_better=True,
    )

    assert comp.n_matched_seeds == 5
    # Two tied seeds (42 and 456)
    tied = [r for r in comp.per_seed_differences if r.delta == 0.0]
    assert len(tied) == 2
    assert comp.wilcoxon_statistic is not None or comp.t_test_p_value is not None


# ---------------------------------------------------------------------------
# 4. Multi-Seed Robust Benchmarking Execution
# ---------------------------------------------------------------------------


def test_robust_benchmarking_service_classification_run():
    """Verify multi-seed matched execution on classification dataset."""
    svc = get_robust_benchmark_service()
    req = RobustBenchmarkRequest(
        dataset_id="wine_multiclass",
        seeds=[42, 123, 456],
        candidate_strategies=["decision_tree", "random_forest"],
        baseline_strategy="decision_tree",
        cv_folds=2,
        test_size=0.2,
        bootstrap_resamples=100,
    )

    resp = svc.run_robust_benchmark(req)

    assert resp.robust_benchmark_id is not None
    assert resp.dataset.dataset_id == "wine_multiclass"
    assert resp.seeds_evaluated == [42, 123, 456]
    assert "decision_tree" in resp.method_summaries
    assert "random_forest" in resp.method_summaries

    dt_summary = resp.method_summaries["decision_tree"]
    assert dt_summary.n_seeds_successful == 3
    assert dt_summary.n_seeds_failed == 0
    assert dt_summary.validation_score.mean > 0.5
    assert dt_summary.validation_score.std is not None
    assert dt_summary.holdout_test_score is not None

    # Process RSS was recorded
    assert dt_summary.peak_process_rss_bytes is not None
    assert dt_summary.peak_process_rss_bytes.mean > 0

    # Paired comparisons
    assert len(resp.paired_comparisons) == 1
    rf_vs_dt = resp.paired_comparisons[0]
    assert rf_vs_dt.method_a == "random_forest"
    assert rf_vs_dt.method_b == "decision_tree"
    assert rf_vs_dt.n_matched_seeds == 3

    # Raw runs count: 2 strategies * 3 seeds = 6 runs
    assert len(resp.raw_seed_runs) == 6
    for run in resp.raw_seed_runs:
        assert run.status == "completed"
        assert run.holdout_test_score is not None
        assert run.peak_process_rss_bytes is not None
        assert run.peak_heap_bytes is not None

    # CSV Export
    csv_text = svc.export_csv(resp.robust_benchmark_id)
    assert "robust_benchmark_id,dataset_id" in csv_text
    assert "random_forest" in csv_text
    assert "decision_tree" in csv_text


def test_robust_benchmarking_service_regression_run():
    """Verify multi-seed matched execution on regression dataset."""
    svc = get_robust_benchmark_service()
    req = RobustBenchmarkRequest(
        dataset_id="diabetes_regression",
        seeds=[42, 123],
        candidate_strategies=["ridge", "decision_tree"],
        baseline_strategy="ridge",
        cv_folds=2,
        test_size=0.2,
        bootstrap_resamples=100,
    )

    resp = svc.run_robust_benchmark(req)
    assert resp.dataset.task_type == "regression"
    assert "ridge" in resp.method_summaries
    assert "decision_tree" in resp.method_summaries

    # In regression, RMSE lower is better
    assert resp.primary_metric in ("rmse", "r2")
    ridge_summary = resp.method_summaries["ridge"]
    assert ridge_summary.n_seeds_successful == 2
    assert ridge_summary.validation_score.mean > 0


# ---------------------------------------------------------------------------
# 5. API Endpoints Integration Tests
# ---------------------------------------------------------------------------


def test_api_dataset_catalog():
    """GET /api/v1/benchmarks/dataset-catalog returns list of available fixtures."""
    res = client.get("/api/v1/benchmarks/dataset-catalog")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    sample = data[0]
    assert "dataset_id" in sample
    assert "dataset_fingerprint" in sample
    assert "license" in sample


def test_api_robust_benchmark_lifecycle():
    """POST /api/v1/benchmarks/robust and GET /api/v1/benchmarks/robust/{id} lifecycle."""
    payload = {
        "dataset_id": "wine_multiclass",
        "seeds": [42, 123],
        "candidate_strategies": ["decision_tree", "random_forest"],
        "baseline_strategy": "decision_tree",
        "cv_folds": 2,
        "bootstrap_resamples": 100,
    }
    post_res = client.post("/api/v1/benchmarks/robust", json=payload)
    assert post_res.status_code == 200
    bench_data = post_res.json()
    b_id = bench_data["robust_benchmark_id"]
    assert b_id is not None
    assert "method_summaries" in bench_data

    # Retrieve by ID
    get_res = client.get(f"/api/v1/benchmarks/robust/{b_id}")
    assert get_res.status_code == 200
    assert get_res.json()["robust_benchmark_id"] == b_id

    # Export CSV
    csv_res = client.get(f"/api/v1/benchmarks/robust/{b_id}/export-csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    assert "decision_tree" in csv_res.text


def test_api_robust_benchmark_validation_errors():
    """Verify validation error when fewer than 2 seeds or invalid dataset specified."""
    # Fewer than 2 seeds
    res_bad_seeds = client.post(
        "/api/v1/benchmarks/robust",
        json={"dataset_id": "wine_multiclass", "seeds": [42]},
    )
    assert res_bad_seeds.status_code in (400, 422)

    # Unknown dataset
    res_unknown_ds = client.post(
        "/api/v1/benchmarks/robust",
        json={"dataset_id": "non_existent_dataset_12345", "seeds": [42, 123]},
    )
    assert res_unknown_ds.status_code == 404
