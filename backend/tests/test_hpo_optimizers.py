"""Unit tests for Phase 10A Hyperparameter Optimizers (Random Search and Bayesian Optuna)."""

import pytest
import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge

from app.schemas.hpo_experiment import HyperparameterSpace, ParameterDomain
from app.services.automl.bayesian_optuna import BayesianOptunaOptimizer
from app.services.automl.hpo_spaces import (
    get_search_space,
    instantiate_estimator,
    list_available_search_spaces,
)
from app.services.automl.random_search import RandomSearchOptimizer


def test_hpo_spaces_retrieval_and_validation():
    """Verify predefined hyperparameter spaces exist, validate, and support alias resolution."""
    spaces = list_available_search_spaces()
    assert len(spaces) >= 6

    # Test retrieval
    rf_space = get_search_space("random_forest")
    assert rf_space.model_id == "random_forest"
    assert len(rf_space.parameters) >= 4

    # Test alias resolution for regression
    rf_reg_space = get_search_space("random_forest", task_type="regression")
    assert rf_reg_space.model_id == "random_forest_regressor"

    # Test invalid model space raises ValueError
    with pytest.raises(ValueError, match="No hyperparameter search space defined"):
        get_search_space("non_existent_neural_net")


def test_estimator_instantiation():
    """Verify correct instantiation of estimators with custom parameter configurations."""
    rf = instantiate_estimator(
        "random_forest",
        {"n_estimators": 25, "max_depth": 5, "min_samples_split": 4, "criterion": "entropy"},
        random_state=42,
    )
    assert isinstance(rf, RandomForestClassifier)
    assert rf.n_estimators == 25
    assert rf.max_depth == 5
    assert rf.criterion == "entropy"
    assert rf.random_state == 42

    ridge = instantiate_estimator("linear_regression", {"alpha": 2.5}, random_state=123)
    assert isinstance(ridge, Ridge)
    assert ridge.alpha == 2.5


def test_random_search_reproducibility():
    """Verify that RandomSearchOptimizer with identical seeds produces identical sequences of configurations."""
    rf_space = get_search_space("random_forest")

    opt1 = RandomSearchOptimizer(rf_space, seed=42)
    opt2 = RandomSearchOptimizer(rf_space, seed=42)

    configs1 = [opt1.sample_configuration() for _ in range(5)]
    configs2 = [opt2.sample_configuration() for _ in range(5)]

    assert configs1 == configs2

    # Different seeds should produce different configurations
    opt3 = RandomSearchOptimizer(rf_space, seed=999)
    configs3 = [opt3.sample_configuration() for _ in range(5)]
    assert configs1 != configs3


def test_random_search_budget_and_failure_handling():
    """Verify RandomSearchOptimizer strictly adheres to trial budget and isolates exceptions."""
    rf_space = get_search_space("random_forest")
    optimizer = RandomSearchOptimizer(rf_space, seed=42)

    call_count = 0

    def mock_objective(trial_num: int, config: dict) -> float:
        nonlocal call_count
        call_count += 1
        if trial_num == 2:
            raise ValueError("Injected synthetic mathematical divergence")
        return 0.75 + (trial_num * 0.01)

    trials = optimizer.run_search(
        objective_fn=mock_objective,
        trial_budget=5,
        greater_is_better=True,
    )

    assert len(trials) == 5
    assert call_count == 5

    # Trial 2 should be marked failed
    assert trials[1].trial_number == 2
    assert trials[1].status == "failed"
    assert "Injected synthetic mathematical divergence" in trials[1].error_message
    assert trials[1].validation_score is None

    # Other trials should be successful
    assert trials[0].status == "completed"
    assert trials[0].validation_score == 0.76
    assert trials[2].status == "completed"
    assert trials[4].status == "completed"


def test_bayesian_optuna_optimizer_execution():
    """Verify BayesianOptunaOptimizer runs TPE optimization, enforces budget, and tracks best-so-far."""
    rf_space = get_search_space("random_forest")
    optimizer = BayesianOptunaOptimizer(rf_space, seed=42, n_startup_trials=2)

    def simple_objective(trial_num: int, config: dict) -> float:
        # Synthetic objective function: penalize large depth, favor ~50 estimators
        n_est = config.get("n_estimators", 50)
        depth = config.get("max_depth", 5)
        score = 1.0 - abs(n_est - 50) * 0.005 - abs(depth - 6) * 0.02
        return float(max(0.0, score))

    trials = optimizer.run_search(
        objective_fn=simple_objective,
        trial_budget=6,
        greater_is_better=True,
    )

    assert len(trials) == 6
    for t in trials:
        assert t.status == "completed"
        assert t.validation_score is not None
        assert t.best_so_far_score is not None
        assert t.duration_seconds >= 0.0
        assert "n_estimators" in t.parameters

    # Check best-so-far monotonic improvement for maximization
    for i in range(1, len(trials)):
        assert trials[i].best_so_far_score >= trials[i - 1].best_so_far_score - 1e-6


def test_bayesian_optuna_failure_resilience():
    """Verify BayesianOptunaOptimizer gracefully handles failed trials without terminating the study."""
    rf_space = get_search_space("decision_tree")
    optimizer = BayesianOptunaOptimizer(rf_space, seed=123, n_startup_trials=2)

    def failing_objective(trial_num: int, config: dict) -> float:
        if trial_num == 3:
            raise ArithmeticError("Simulated singular matrix error")
        return 0.80

    trials = optimizer.run_search(
        objective_fn=failing_objective,
        trial_budget=5,
        greater_is_better=True,
    )

    assert len(trials) == 5
    trial_3 = next(t for t in trials if t.trial_number == 3)
    assert trial_3.status == "failed"
    assert "Simulated singular matrix error" in trial_3.error_message
