"""Unit tests for Pareto dominance, mixed objective directions, resource constraints, and selection policies."""

import pytest

from app.schemas.multi_objective import (
    CandidateMeasurement,
    ModelComplexityMetadata,
    ObjectiveDefinition,
    ResourceConstraints,
)
from app.services.automl.pareto import ParetoFrontierCalculator, FLOAT_TOLERANCE


def _make_candidate(
    candidate_id: str,
    validation_score: float = 0.85,
    predictive_direction: str = "maximize",
    inference_latency_ms: float = 1.5,
    training_duration_seconds: float = 5.0,
    artifact_size_bytes: int = 10000,
    complexity_score: float = 50.0,
    peak_memory_bytes: int = 1024 * 1024,
    status: str = "completed",
    error_message: str = None,
) -> CandidateMeasurement:
    """Helper to construct CandidateMeasurement fixtures."""
    return CandidateMeasurement(
        candidate_id=candidate_id,
        model_id="test_model",
        model_name=f"Model {candidate_id}",
        hyperparameters={"param": 1},
        status=status,
        error_message=error_message,
        predictive_metric="f1_weighted" if predictive_direction == "maximize" else "rmse",
        predictive_direction=predictive_direction,
        validation_score=validation_score if status == "completed" else None,
        cv_std=0.02 if status == "completed" else None,
        training_duration_seconds=training_duration_seconds,
        inference_latency_ms_per_sample=inference_latency_ms,
        inference_throughput_samples_per_sec=1000.0 / max(0.001, inference_latency_ms),
        model_artifact_size_bytes=artifact_size_bytes,
        peak_memory_bytes=peak_memory_bytes,
        complexity=ModelComplexityMetadata(
            estimator_type="TestEstimator",
            summary_complexity_score=complexity_score,
            complexity_unit="nodes",
            notes="test",
        ),
    )


def test_pareto_dominance_maximize_maximize():
    """Test strict dominance when both objectives are maximized."""
    objectives = [
        ObjectiveDefinition(name="Score A", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Score B", key="complexity", direction="maximize", unit="score", description=""),
    ]
    cand_a = _make_candidate("A", validation_score=0.90, complexity_score=80.0)
    cand_b = _make_candidate("B", validation_score=0.80, complexity_score=70.0)

    # A is strictly better in both
    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is True
    assert ParetoFrontierCalculator.check_dominance(cand_b, cand_a, objectives) is False


def test_pareto_dominance_minimize_minimize():
    """Test strict dominance when both objectives are minimized."""
    objectives = [
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
        ObjectiveDefinition(name="Size", key="artifact_size_bytes", direction="minimize", unit="bytes", description=""),
    ]
    cand_a = _make_candidate("A", inference_latency_ms=1.0, artifact_size_bytes=5000)
    cand_b = _make_candidate("B", inference_latency_ms=2.0, artifact_size_bytes=8000)

    # A has lower latency and smaller size -> A dominates B
    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is True
    assert ParetoFrontierCalculator.check_dominance(cand_b, cand_a, objectives) is False


def test_pareto_dominance_mixed_directions():
    """Test mixed directions: Maximize accuracy while minimizing latency and artifact size."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
        ObjectiveDefinition(name="Size", key="artifact_size_bytes", direction="minimize", unit="bytes", description=""),
    ]
    # cand_a: higher score, lower latency, smaller size -> strictly dominates cand_b
    cand_a = _make_candidate("A", validation_score=0.92, inference_latency_ms=1.2, artifact_size_bytes=4000)
    cand_b = _make_candidate("B", validation_score=0.85, inference_latency_ms=2.5, artifact_size_bytes=6000)

    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is True
    assert ParetoFrontierCalculator.check_dominance(cand_b, cand_a, objectives) is False

    # cand_c: higher score, but higher latency -> mutual trade-off, neither dominates
    cand_c = _make_candidate("C", validation_score=0.95, inference_latency_ms=3.0, artifact_size_bytes=8000)
    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_c, objectives) is False
    assert ParetoFrontierCalculator.check_dominance(cand_c, cand_a, objectives) is False


def test_pareto_dominance_floating_point_tolerance():
    """Verify numerical safety with tolerance eps=1e-7."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
    ]
    cand_a = _make_candidate("A", validation_score=0.85000001, inference_latency_ms=1.0)
    cand_b = _make_candidate("B", validation_score=0.85000000, inference_latency_ms=1.0)

    # Difference is 1e-8 which is <= FLOAT_TOLERANCE (1e-7), so A does NOT strictly dominate B
    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is False
    assert ParetoFrontierCalculator.check_dominance(cand_b, cand_a, objectives) is False


def test_pareto_dominance_equal_candidates():
    """Identical candidates do not strictly dominate each other."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
    ]
    cand_a = _make_candidate("A", validation_score=0.85, inference_latency_ms=1.0)
    cand_b = _make_candidate("B", validation_score=0.85, inference_latency_ms=1.0)

    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is False
    assert ParetoFrontierCalculator.check_dominance(cand_b, cand_a, objectives) is False


def test_pareto_missing_values_indeterminate():
    """Missing objective value yields indeterminate dominance (None)."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Peak RAM", key="peak_memory_bytes", direction="minimize", unit="bytes", description=""),
    ]
    cand_a = _make_candidate("A", validation_score=0.85, peak_memory_bytes=None)
    cand_b = _make_candidate("B", validation_score=0.80, peak_memory_bytes=1000)

    # Because peak_memory_bytes is None on A, comparison cannot be definitively proven
    assert ParetoFrontierCalculator.check_dominance(cand_a, cand_b, objectives) is None


def test_infeasible_candidates_excluded_from_frontier():
    """Infeasible candidate violating latency constraint must NOT appear in the Pareto frontier."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
    ]
    # cand_fast: lower score, very low latency (feasible)
    cand_fast = _make_candidate("Fast", validation_score=0.75, inference_latency_ms=0.5)
    # cand_huge: highest score, but massive latency violating max latency 2.0 ms
    cand_huge = _make_candidate("Huge", validation_score=0.99, inference_latency_ms=5.0)

    constraints = ResourceConstraints(max_inference_latency_ms=2.0)

    results, pareto_ids = ParetoFrontierCalculator.compute_pareto_frontier(
        measurements=[cand_fast, cand_huge],
        objectives=objectives,
        constraints=constraints,
    )

    assert "Fast" in pareto_ids
    assert "Huge" not in pareto_ids

    huge_res = next(r for r in results if r.measurement.candidate_id == "Huge")
    assert huge_res.is_feasible is False
    assert huge_res.is_pareto_optimal is False
    assert len(huge_res.constraint_violations) == 1
    assert huge_res.constraint_violations[0].constraint_name == "max_inference_latency_ms"


def test_failed_candidate_handling():
    """Failed candidate is marked infeasible with execution violation."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
    ]
    cand_ok = _make_candidate("OK", validation_score=0.80)
    cand_fail = _make_candidate("Fail", status="failed", error_message="CUDA OOM")

    results, pareto_ids = ParetoFrontierCalculator.compute_pareto_frontier(
        measurements=[cand_ok, cand_fail],
        objectives=objectives,
    )

    assert "OK" in pareto_ids
    assert "Fail" not in pareto_ids

    fail_res = next(r for r in results if r.measurement.candidate_id == "Fail")
    assert fail_res.is_feasible is False
    assert fail_res.is_pareto_optimal is False
    assert any("CUDA OOM" in v.message for v in fail_res.constraint_violations)


def test_selection_policies():
    """Verify all 4 selection policies under active constraints."""
    objectives = [
        ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description=""),
        ObjectiveDefinition(name="Latency", key="inference_latency_ms", direction="minimize", unit="ms", description=""),
        ObjectiveDefinition(name="Size", key="artifact_size_bytes", direction="minimize", unit="bytes", description=""),
    ]
    # A: Best score, highest latency
    cand_a = _make_candidate("A", validation_score=0.95, inference_latency_ms=4.0, artifact_size_bytes=20000)
    # B: Moderate score, lowest latency
    cand_b = _make_candidate("B", validation_score=0.88, inference_latency_ms=0.5, artifact_size_bytes=10000)
    # C: Lowest score, smallest size
    cand_c = _make_candidate("C", validation_score=0.80, inference_latency_ms=1.5, artifact_size_bytes=2000)

    results, _ = ParetoFrontierCalculator.compute_pareto_frontier(
        measurements=[cand_a, cand_b, cand_c],
        objectives=objectives,
    )

    # 1. Best Performance
    sel_perf = ParetoFrontierCalculator.select_model(results, policy="best_performance_constrained")
    assert sel_perf.selected_candidate_id == "A"
    assert sel_perf.satisfies_all_constraints is True

    # 2. Lowest Latency
    sel_lat = ParetoFrontierCalculator.select_model(results, policy="lowest_latency_constrained")
    assert sel_lat.selected_candidate_id == "B"

    # 3. Lowest Size
    sel_size = ParetoFrontierCalculator.select_model(results, policy="lowest_size_constrained")
    assert sel_size.selected_candidate_id == "C"

    # 4. Balanced Compromise (closest to Utopia point)
    sel_bal = ParetoFrontierCalculator.select_model(results, policy="balanced_compromise")
    assert sel_bal.selected_candidate_id in ["A", "B", "C"]
    assert sel_bal.satisfies_all_constraints is True


def test_selection_zero_feasible_candidates():
    """Verify clean reporting when no candidate satisfies constraints."""
    cand = _make_candidate("Heavy", validation_score=0.85, inference_latency_ms=10.0)
    constraints = ResourceConstraints(max_inference_latency_ms=1.0)

    results, _ = ParetoFrontierCalculator.compute_pareto_frontier(
        measurements=[cand],
        objectives=[ObjectiveDefinition(name="Score", key="predictive_metric", direction="maximize", unit="score", description="")],
        constraints=constraints,
    )

    sel = ParetoFrontierCalculator.select_model(results, policy="best_performance_constrained")
    assert sel.satisfies_all_constraints is False
    assert sel.selected_candidate_id is None
    assert sel.feasible_candidates_count == 0
    assert sel.infeasible_candidates_count == 1
    assert "No candidate model satisfied" in sel.selection_explanation
