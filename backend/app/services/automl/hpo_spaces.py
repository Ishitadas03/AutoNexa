"""Hyperparameter search spaces and estimator instantiation for supported model families."""

from typing import Any, Dict, List, Optional
from sklearn.base import BaseEstimator
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from app.schemas.analysis import TaskType
from app.schemas.hpo_experiment import HyperparameterSpace, ParameterDomain


# Registry of supported hyperparameter search spaces
_SEARCH_SPACES: Dict[str, HyperparameterSpace] = {
    # 1. Random Forest Classifier
    "random_forest": HyperparameterSpace(
        model_id="random_forest",
        model_name="Random Forest Classifier",
        task_type=TaskType.BINARY_CLASSIFICATION.value,
        parameters=[
            ParameterDomain(
                name="n_estimators",
                param_type="int",
                low=10,
                high=150,
                step=5,
                log=False,
                description="Number of decision trees in the ensemble",
            ),
            ParameterDomain(
                name="max_depth",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Maximum depth of each individual tree",
            ),
            ParameterDomain(
                name="min_samples_split",
                param_type="int",
                low=2,
                high=15,
                step=1,
                log=False,
                description="Minimum number of samples required to split an internal node",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=1,
                high=10,
                step=1,
                log=False,
                description="Minimum number of samples required to be at a leaf node",
            ),
            ParameterDomain(
                name="max_features",
                param_type="categorical",
                choices=["sqrt", "log2", None],
                description="Number of features to consider when looking for the best split",
            ),
            ParameterDomain(
                name="criterion",
                param_type="categorical",
                choices=["gini", "entropy"],
                description="Function to measure split quality",
            ),
        ],
    ),
    # 2. Random Forest Regressor
    "random_forest_regressor": HyperparameterSpace(
        model_id="random_forest_regressor",
        model_name="Random Forest Regressor",
        task_type=TaskType.REGRESSION.value,
        parameters=[
            ParameterDomain(
                name="n_estimators",
                param_type="int",
                low=10,
                high=150,
                step=5,
                log=False,
                description="Number of decision trees in the ensemble",
            ),
            ParameterDomain(
                name="max_depth",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Maximum depth of each individual tree",
            ),
            ParameterDomain(
                name="min_samples_split",
                param_type="int",
                low=2,
                high=15,
                step=1,
                log=False,
                description="Minimum number of samples required to split an internal node",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=1,
                high=10,
                step=1,
                log=False,
                description="Minimum number of samples required to be at a leaf node",
            ),
            ParameterDomain(
                name="max_features",
                param_type="categorical",
                choices=["sqrt", "log2", None],
                description="Number of features to consider when looking for the best split",
            ),
            ParameterDomain(
                name="criterion",
                param_type="categorical",
                choices=["squared_error", "absolute_error"],
                description="Function to measure split quality",
            ),
        ],
    ),
    # 3. Histogram Gradient Boosting Classifier
    "hist_gradient_boosting": HyperparameterSpace(
        model_id="hist_gradient_boosting",
        model_name="Histogram Gradient Boosting Classifier",
        task_type=TaskType.BINARY_CLASSIFICATION.value,
        parameters=[
            ParameterDomain(
                name="max_iter",
                param_type="int",
                low=20,
                high=150,
                step=10,
                log=False,
                description="Maximum number of boosting iterations",
            ),
            ParameterDomain(
                name="learning_rate",
                param_type="float",
                low=0.01,
                high=0.3,
                log=True,
                description="Learning rate shrinking contribution of each tree",
            ),
            ParameterDomain(
                name="max_leaf_nodes",
                param_type="int",
                low=15,
                high=63,
                step=2,
                log=False,
                description="Maximum number of leaves for each tree",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=10,
                high=50,
                step=5,
                log=False,
                description="Minimum number of samples per leaf",
            ),
            ParameterDomain(
                name="l2_regularization",
                param_type="float",
                low=0.0,
                high=10.0,
                step=0.5,
                log=False,
                description="L2 regularization parameter",
            ),
        ],
    ),
    # 4. Histogram Gradient Boosting Regressor
    "hist_gradient_boosting_regressor": HyperparameterSpace(
        model_id="hist_gradient_boosting_regressor",
        model_name="Histogram Gradient Boosting Regressor",
        task_type=TaskType.REGRESSION.value,
        parameters=[
            ParameterDomain(
                name="max_iter",
                param_type="int",
                low=20,
                high=150,
                step=10,
                log=False,
                description="Maximum number of boosting iterations",
            ),
            ParameterDomain(
                name="learning_rate",
                param_type="float",
                low=0.01,
                high=0.3,
                log=True,
                description="Learning rate shrinking contribution of each tree",
            ),
            ParameterDomain(
                name="max_leaf_nodes",
                param_type="int",
                low=15,
                high=63,
                step=2,
                log=False,
                description="Maximum number of leaves for each tree",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=10,
                high=50,
                step=5,
                log=False,
                description="Minimum number of samples per leaf",
            ),
            ParameterDomain(
                name="l2_regularization",
                param_type="float",
                low=0.0,
                high=10.0,
                step=0.5,
                log=False,
                description="L2 regularization parameter",
            ),
        ],
    ),
    # 5. Decision Tree Classifier
    "decision_tree": HyperparameterSpace(
        model_id="decision_tree",
        model_name="Decision Tree Classifier",
        task_type=TaskType.BINARY_CLASSIFICATION.value,
        parameters=[
            ParameterDomain(
                name="max_depth",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Maximum depth of the tree",
            ),
            ParameterDomain(
                name="min_samples_split",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Minimum number of samples required to split an internal node",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=1,
                high=10,
                step=1,
                log=False,
                description="Minimum number of samples required to be at a leaf node",
            ),
            ParameterDomain(
                name="criterion",
                param_type="categorical",
                choices=["gini", "entropy"],
                description="Function to measure split quality",
            ),
        ],
    ),
    # 6. Decision Tree Regressor
    "decision_tree_regressor": HyperparameterSpace(
        model_id="decision_tree_regressor",
        model_name="Decision Tree Regressor",
        task_type=TaskType.REGRESSION.value,
        parameters=[
            ParameterDomain(
                name="max_depth",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Maximum depth of the tree",
            ),
            ParameterDomain(
                name="min_samples_split",
                param_type="int",
                low=2,
                high=20,
                step=1,
                log=False,
                description="Minimum number of samples required to split an internal node",
            ),
            ParameterDomain(
                name="min_samples_leaf",
                param_type="int",
                low=1,
                high=10,
                step=1,
                log=False,
                description="Minimum number of samples required to be at a leaf node",
            ),
            ParameterDomain(
                name="criterion",
                param_type="categorical",
                choices=["squared_error", "absolute_error"],
                description="Function to measure split quality",
            ),
        ],
    ),
    # 7. Logistic Regression
    "logistic_regression": HyperparameterSpace(
        model_id="logistic_regression",
        model_name="Logistic Regression",
        task_type=TaskType.BINARY_CLASSIFICATION.value,
        parameters=[
            ParameterDomain(
                name="C",
                param_type="float",
                low=0.001,
                high=100.0,
                log=True,
                description="Inverse of regularization strength",
            ),
            ParameterDomain(
                name="penalty",
                param_type="categorical",
                choices=["l2", None],
                description="Norm of the penalty",
            ),
        ],
    ),
    # 8. Ridge Regression
    "linear_regression": HyperparameterSpace(
        model_id="linear_regression",
        model_name="Ridge Linear Regression",
        task_type=TaskType.REGRESSION.value,
        parameters=[
            ParameterDomain(
                name="alpha",
                param_type="float",
                low=0.001,
                high=100.0,
                log=True,
                description="Regularization strength",
            ),
        ],
    ),
}


def get_search_space(model_id: str, task_type: Optional[str] = None) -> HyperparameterSpace:
    """Retrieve defined search space for a model identifier, resolving task aliases if necessary."""
    clean_id = model_id.lower().strip()
    # Resolve aliases
    if task_type and "regress" in task_type.lower():
        if clean_id == "random_forest":
            clean_id = "random_forest_regressor"
        elif clean_id == "decision_tree":
            clean_id = "decision_tree_regressor"
        elif clean_id == "hist_gradient_boosting":
            clean_id = "hist_gradient_boosting_regressor"

    if clean_id not in _SEARCH_SPACES:
        available = sorted(list(_SEARCH_SPACES.keys()))
        raise ValueError(f"No hyperparameter search space defined for model '{model_id}'. Available: {available}")

    return _SEARCH_SPACES[clean_id]


def list_available_search_spaces() -> List[HyperparameterSpace]:
    """Return all defined hyperparameter search spaces."""
    return list(_SEARCH_SPACES.values())


def instantiate_estimator(model_id: str, params: Dict[str, Any], random_state: int) -> BaseEstimator:
    """Instantiate a scikit-learn estimator with sampled parameters and execution seed."""
    clean_id = model_id.lower().strip()
    # Copy parameters to prevent mutation
    p = dict(params)

    if clean_id in ("random_forest", "random_forest_classifier"):
        return RandomForestClassifier(
            n_estimators=int(p.get("n_estimators", 50)),
            max_depth=int(p["max_depth"]) if p.get("max_depth") is not None else None,
            min_samples_split=int(p.get("min_samples_split", 2)),
            min_samples_leaf=int(p.get("min_samples_leaf", 1)),
            max_features=p.get("max_features", "sqrt"),
            criterion=str(p.get("criterion", "gini")),
            random_state=random_state,
            n_jobs=1,
        )
    elif clean_id in ("random_forest_regressor",):
        return RandomForestRegressor(
            n_estimators=int(p.get("n_estimators", 50)),
            max_depth=int(p["max_depth"]) if p.get("max_depth") is not None else None,
            min_samples_split=int(p.get("min_samples_split", 2)),
            min_samples_leaf=int(p.get("min_samples_leaf", 1)),
            max_features=p.get("max_features", "sqrt"),
            criterion=str(p.get("criterion", "squared_error")),
            random_state=random_state,
            n_jobs=1,
        )
    elif clean_id in ("hist_gradient_boosting", "hist_gradient_boosting_classifier"):
        return HistGradientBoostingClassifier(
            max_iter=int(p.get("max_iter", 50)),
            learning_rate=float(p.get("learning_rate", 0.1)),
            max_leaf_nodes=int(p.get("max_leaf_nodes", 31)),
            min_samples_leaf=int(p.get("min_samples_leaf", 20)),
            l2_regularization=float(p.get("l2_regularization", 0.0)),
            random_state=random_state,
        )
    elif clean_id in ("hist_gradient_boosting_regressor",):
        return HistGradientBoostingRegressor(
            max_iter=int(p.get("max_iter", 50)),
            learning_rate=float(p.get("learning_rate", 0.1)),
            max_leaf_nodes=int(p.get("max_leaf_nodes", 31)),
            min_samples_leaf=int(p.get("min_samples_leaf", 20)),
            l2_regularization=float(p.get("l2_regularization", 0.0)),
            random_state=random_state,
        )
    elif clean_id in ("decision_tree", "decision_tree_classifier"):
        return DecisionTreeClassifier(
            max_depth=int(p["max_depth"]) if p.get("max_depth") is not None else None,
            min_samples_split=int(p.get("min_samples_split", 2)),
            min_samples_leaf=int(p.get("min_samples_leaf", 1)),
            criterion=str(p.get("criterion", "gini")),
            random_state=random_state,
        )
    elif clean_id in ("decision_tree_regressor",):
        return DecisionTreeRegressor(
            max_depth=int(p["max_depth"]) if p.get("max_depth") is not None else None,
            min_samples_split=int(p.get("min_samples_split", 2)),
            min_samples_leaf=int(p.get("min_samples_leaf", 1)),
            criterion=str(p.get("criterion", "squared_error")),
            random_state=random_state,
        )
    elif clean_id in ("logistic_regression",):
        return LogisticRegression(
            C=float(p.get("C", 1.0)),
            penalty=p.get("penalty", "l2"),
            solver="lbfgs",
            max_iter=1000,
            random_state=random_state,
        )
    elif clean_id in ("linear_regression", "ridge"):
        return Ridge(
            alpha=float(p.get("alpha", 1.0)),
            random_state=random_state,
        )
    else:
        raise ValueError(f"Unsupported model family identifier for instantiation: '{model_id}'")
