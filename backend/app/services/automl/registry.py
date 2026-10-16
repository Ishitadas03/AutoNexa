"""Model registry containing supported scikit-learn estimators for classification and regression."""

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional
from sklearn.base import BaseEstimator
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from app.schemas.analysis import TaskType


@dataclass(frozen=True)
class ModelDefinition:
    """Specification of a registered machine learning estimator."""
    id: str
    name: str
    supported_tasks: List[TaskType]
    factory: Callable[[int], BaseEstimator]


class ModelRegistry:
    """Central registry of supported estimators for tabular classification and regression."""

    def __init__(self) -> None:
        self._models: Dict[str, ModelDefinition] = {}
        self._register_defaults()

    def _register(
        self,
        model_id: str,
        name: str,
        supported_tasks: List[TaskType],
        factory: Callable[[int], BaseEstimator],
    ) -> None:
        self._models[model_id] = ModelDefinition(
            id=model_id,
            name=name,
            supported_tasks=supported_tasks,
            factory=factory,
        )

    def _register_defaults(self) -> None:
        # Classification Estimators
        self._register(
            model_id="dummy",
            name="Dummy Baseline Classifier",
            supported_tasks=[TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION],
            factory=lambda seed: DummyClassifier(strategy="prior"),
        )
        self._register(
            model_id="logistic_regression",
            name="Logistic Regression",
            supported_tasks=[TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION],
            factory=lambda seed: LogisticRegression(max_iter=1000, random_state=seed),
        )
        self._register(
            model_id="decision_tree",
            name="Decision Tree Classifier",
            supported_tasks=[TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION],
            factory=lambda seed: DecisionTreeClassifier(max_depth=10, random_state=seed),
        )
        self._register(
            model_id="random_forest",
            name="Random Forest Classifier",
            supported_tasks=[TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION],
            factory=lambda seed: RandomForestClassifier(n_estimators=50, max_depth=10, n_jobs=1, random_state=seed),
        )
        self._register(
            model_id="hist_gradient_boosting",
            name="Histogram Gradient Boosting Classifier",
            supported_tasks=[TaskType.BINARY_CLASSIFICATION, TaskType.MULTICLASS_CLASSIFICATION],
            factory=lambda seed: HistGradientBoostingClassifier(max_iter=50, random_state=seed),
        )

        # Regression Estimators
        self._register(
            model_id="dummy_regressor",
            name="Dummy Baseline Regressor",
            supported_tasks=[TaskType.REGRESSION],
            factory=lambda seed: DummyRegressor(strategy="mean"),
        )
        self._register(
            model_id="linear_regression",
            name="Ridge Linear Regression",
            supported_tasks=[TaskType.REGRESSION],
            factory=lambda seed: Ridge(alpha=1.0, random_state=seed),
        )
        self._register(
            model_id="decision_tree_regressor",
            name="Decision Tree Regressor",
            supported_tasks=[TaskType.REGRESSION],
            factory=lambda seed: DecisionTreeRegressor(max_depth=10, random_state=seed),
        )
        self._register(
            model_id="random_forest_regressor",
            name="Random Forest Regressor",
            supported_tasks=[TaskType.REGRESSION],
            factory=lambda seed: RandomForestRegressor(n_estimators=50, max_depth=10, n_jobs=1, random_state=seed),
        )
        self._register(
            model_id="hist_gradient_boosting_regressor",
            name="Histogram Gradient Boosting Regressor",
            supported_tasks=[TaskType.REGRESSION],
            factory=lambda seed: HistGradientBoostingRegressor(max_iter=50, random_state=seed),
        )

    def get_supported_model_ids(self, task: TaskType) -> List[str]:
        """Return list of model IDs compatible with the target task."""
        return [
            m.id for m in self._models.values()
            if task in m.supported_tasks
        ]

    def resolve_candidates(
        self,
        task: TaskType,
        requested_models: Optional[List[str]] = None,
    ) -> List[ModelDefinition]:
        """Resolve and validate the list of ModelDefinitions to execute for a task."""
        supported = [m for m in self._models.values() if task in m.supported_tasks]
        supported_ids = {m.id for m in supported}

        # Also support canonical aliases like "dummy" mapping to "dummy_regressor" for regression
        alias_map = {
            "dummy": "dummy_regressor" if task == TaskType.REGRESSION else "dummy",
            "decision_tree": "decision_tree_regressor" if task == TaskType.REGRESSION else "decision_tree",
            "random_forest": "random_forest_regressor" if task == TaskType.REGRESSION else "random_forest",
            "hist_gradient_boosting": "hist_gradient_boosting_regressor" if task == TaskType.REGRESSION else "hist_gradient_boosting",
        }

        if not requested_models:
            return supported

        resolved: List[ModelDefinition] = []
        for req_id in requested_models:
            mapped_id = alias_map.get(req_id, req_id)
            if mapped_id not in supported_ids:
                raise ValueError(
                    f"Model identifier '{req_id}' is not supported for task '{task.value}'. "
                    f"Available models for this task: {sorted(list(supported_ids))}"
                )
            resolved.append(self._models[mapped_id])

        return resolved
