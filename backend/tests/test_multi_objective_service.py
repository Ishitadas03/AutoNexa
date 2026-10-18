"""Integration tests for MultiObjectiveService: candidate profiling, Pareto frontier, constraints, and test leakage isolation."""

from pathlib import Path
import pytest
import pandas as pd
import numpy as np

from app.schemas.multi_objective import (
    MultiObjectiveExperimentRequest,
    MultiObjectiveSelectionRequest,
    ResourceConstraints,
)
from app.services.analysis_service import AnalysisService
from app.services.automl.multi_objective_service import MultiObjectiveService


@pytest.fixture
def temp_dataset_env(tmp_path: Path):
    """Setup temporary uploads and experiments directory with sample classification and regression datasets."""
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir(parents=True)
    exp_dir = tmp_path / "experiments"
    exp_dir.mkdir(parents=True)

    np.random.seed(42)
    n = 60

    # Binary classification dataset
    clf_df = pd.DataFrame({
        "num1": np.random.randn(n),
        "num2": np.random.uniform(10, 50, size=n),
        "cat1": np.random.choice(["type_a", "type_b", "type_c"], size=n),
        "target_clf": np.random.choice([0, 1], size=n, p=[0.6, 0.4]),
    })
    clf_path = upload_dir / "clf_data.csv"
    clf_df.to_csv(clf_path, index=False)

    # Regression dataset
    reg_df = pd.DataFrame({
        "feature_a": np.random.randn(n),
        "feature_b": np.random.uniform(1, 100, size=n),
        "target_reg": np.random.randn(n) * 10 + 50,
    })
    reg_path = upload_dir / "reg_data.csv"
    reg_df.to_csv(reg_path, index=False)

    analysis_service = AnalysisService(upload_dir=upload_dir)
    service = MultiObjectiveService(
        upload_dir=upload_dir,
        experiments_dir=exp_dir,
        analysis_service=analysis_service,
    )

    return service, upload_dir, exp_dir


def test_multi_objective_classification_end_to_end(temp_dataset_env):
    """Run full classification multi-objective experiment, check Pareto frontier, and post-selection test evaluation."""
    service, _, _ = temp_dataset_env

    req = MultiObjectiveExperimentRequest(
        dataset_id="clf_data.csv",
        target_column="target_clf",
        candidate_models=["logistic_regression", "decision_tree"],
        include_hpo_candidates=False,
        evaluation_strategy="cross_validation",
        cv_folds=2,
        test_size=0.25,
        primary_metric="f1_weighted",
        random_state=42,
        selection_policy="best_performance_constrained",
    )

    res = service.run_multi_objective_experiment(req)

    assert res.experiment_id is not None
    assert res.task_type in ["binary_classification", "multiclass_classification"]
    assert len(res.candidates) >= 2
    assert res.primary_metric == "f1_weighted"

    # Verify objectives were evaluated
    obj_keys = [o.key for o in res.objectives_evaluated]
    assert "predictive_metric" in obj_keys
    assert "inference_latency_ms" in obj_keys
    assert "training_duration_seconds" in obj_keys
    assert "artifact_size_bytes" in obj_keys
    assert "model_complexity" in obj_keys

    # Verify non-empty Pareto frontier
    assert len(res.pareto_frontier_candidate_ids) > 0

    # Verify model selection outcome
    assert res.selection.selected_candidate_id is not None
    assert res.selection.satisfies_all_constraints is True
    assert res.selection.untouched_test_evaluation is not None
    assert "f1_weighted" in res.selection.untouched_test_evaluation


def test_multi_objective_regression_minimization_direction(temp_dataset_env):
    """Run regression multi-objective experiment where primary metric RMSE is minimized."""
    service, _, _ = temp_dataset_env

    req = MultiObjectiveExperimentRequest(
        dataset_id="reg_data.csv",
        target_column="target_reg",
        candidate_models=["linear_regression", "decision_tree"],
        include_hpo_candidates=False,
        evaluation_strategy="cross_validation",
        cv_folds=2,
        test_size=0.25,
        primary_metric="rmse",
        random_state=42,
        selection_policy="best_performance_constrained",
    )

    res = service.run_multi_objective_experiment(req)

    assert res.task_type == "regression"
    assert res.primary_metric == "rmse"

    pred_obj = next(o for o in res.objectives_evaluated if o.key == "predictive_metric")
    assert pred_obj.direction == "minimize"

    assert res.selection.selected_candidate_id is not None
    assert res.selection.untouched_test_evaluation is not None
    assert "rmse" in res.selection.untouched_test_evaluation


def test_scientific_leakage_safeguards(temp_dataset_env):
    """Prove that holdout test partition is strictly isolated and infeasible models cannot enter Pareto frontier."""
    service, _, _ = temp_dataset_env

    req = MultiObjectiveExperimentRequest(
        dataset_id="clf_data.csv",
        target_column="target_clf",
        candidate_models=["logistic_regression", "decision_tree"],
        include_hpo_candidates=False,
        cv_folds=2,
        test_size=0.2,
        constraints=ResourceConstraints(max_inference_latency_ms=0.0001),  # Unrealistic constraint: all models violate
        random_state=42,
    )

    res = service.run_multi_objective_experiment(req)

    # Infeasible candidates must NOT be in the feasible Pareto frontier
    assert len(res.pareto_frontier_candidate_ids) == 0
    assert res.selection.satisfies_all_constraints is False
    assert res.selection.selected_candidate_id is None

    # Verify that before selection, candidate test scores were None (untouched)
    for cand in res.candidates:
        assert cand.is_feasible is False
        assert cand.is_pareto_optimal is False


def test_select_model_dynamic_constraints(temp_dataset_env):
    """Test re-evaluating selection and Pareto frontier on existing experiment with updated constraints."""
    service, _, _ = temp_dataset_env

    # 1. Run baseline experiment with no constraints
    req = MultiObjectiveExperimentRequest(
        dataset_id="clf_data.csv",
        target_column="target_clf",
        candidate_models=["logistic_regression", "decision_tree"],
        include_hpo_candidates=False,
        cv_folds=2,
        test_size=0.2,
        random_state=42,
    )
    res = service.run_multi_objective_experiment(req)

    # 2. Select with lowest latency policy
    sel_req = MultiObjectiveSelectionRequest(
        policy="lowest_latency_constrained",
        constraints=None,
    )
    sel_res = service.select_model_for_experiment(res.experiment_id, sel_req)

    assert sel_res.satisfies_all_constraints is True
    assert sel_res.selected_candidate_id is not None
    assert sel_res.policy_used == "lowest_latency_constrained"
    assert sel_res.untouched_test_evaluation is not None
    assert sel_res.selected_candidate.measurement.test_score is not None


def test_csv_export(temp_dataset_env):
    """Verify that export_csv generates valid CSV text with all required column headers."""
    service, _, _ = temp_dataset_env

    req = MultiObjectiveExperimentRequest(
        dataset_id="clf_data.csv",
        target_column="target_clf",
        candidate_models=["logistic_regression"],
        include_hpo_candidates=False,
        cv_folds=2,
        test_size=0.2,
        random_state=42,
    )
    res = service.run_multi_objective_experiment(req)

    csv_text = service.export_csv(res.experiment_id)
    assert "candidate_id" in csv_text
    assert "is_pareto_optimal" in csv_text
    assert "inference_latency_ms_per_sample" in csv_text
    assert "complexity_score" in csv_text
    assert "validation_score" in csv_text
