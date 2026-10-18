"""Fair baseline model evaluator for classification and regression tasks."""

import logging
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.pipeline import Pipeline

from app.schemas.research_benchmark import BaselineComparisonResult
from app.services.automl.evaluator import ModelEvaluator

logger = logging.getLogger(__name__)


class BaselineEvaluator:
    """Evaluates simple, interpretable baselines under identical data partitions."""

    @staticmethod
    def evaluate_baselines(
        task_type: str,
        preprocessor: Any,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_test: pd.DataFrame,
        y_test: pd.Series,
        model_metrics: Dict[str, float],
        primary_metric: str,
        greater_is_better: bool = True,
        random_state: int = 42,
    ) -> List[BaselineComparisonResult]:
        """Train and evaluate canonical baselines on identical train/test splits."""
        results: List[BaselineComparisonResult] = []
        is_classification = "classification" in task_type.lower()
        model_score = model_metrics.get(primary_metric, 0.0)

        # 1. Define baseline estimator candidates
        if is_classification:
            baselines = [
                (
                    "dummy_most_frequent",
                    "Majority Class Baseline: predicts the empirical modal category observed in training partition",
                    DummyClassifier(strategy="most_frequent"),
                ),
                (
                    "simple_logistic_regression",
                    "Simple Linear Baseline: unregularized or L2-regularized logistic regression with standard preprocessing",
                    LogisticRegression(max_iter=1000, random_state=random_state),
                ),
            ]
        else:
            baselines = [
                (
                    "dummy_mean_regressor",
                    "Empirical Mean Baseline: always predicts the sample mean target of the training partition",
                    DummyRegressor(strategy="mean"),
                ),
                (
                    "simple_linear_regression",
                    "Ordinary Least Squares Baseline: unregularized linear regression with standard preprocessing",
                    LinearRegression(),
                ),
            ]

        # 2. Fit and evaluate each baseline under identical preprocessing
        for b_name, b_strategy, estimator in baselines:
            try:
                # Wrap with preprocessor if provided
                if preprocessor is not None:
                    pipeline = Pipeline(steps=[
                        ("preprocessor", preprocessor),
                        ("estimator", estimator),
                    ])
                else:
                    pipeline = Pipeline(steps=[("estimator", estimator)])

                pipeline.fit(X_train, y_train)

                if is_classification:
                    b_metrics = ModelEvaluator.evaluate_classification(pipeline, X_test, y_test)
                else:
                    b_metrics = ModelEvaluator.evaluate_regression(pipeline, X_test, y_test)

                raw_b_score = b_metrics.get(primary_metric)
                b_score = float(raw_b_score) if raw_b_score is not None else 0.0
                m_score = float(model_score) if model_score is not None else 0.0
                delta_abs = round(m_score - b_score, 4)

                # Safe percentage calculation
                delta_pct: Optional[float] = None
                pct_note = ""
                if abs(b_score) > 1e-5 and b_score > 0:
                    delta_pct = round((delta_abs / abs(b_score)) * 100.0, 2)
                else:
                    pct_note = " Baseline score is zero, negative, or near-zero; relative percentage omitted to avoid distorted ratios."

                # Selection quality verdict
                if greater_is_better:
                    if delta_abs > 0.001:
                        verdict = "outperformed"
                    elif abs(delta_abs) <= 0.001:
                        verdict = "tied"
                    else:
                        verdict = "underperformed"
                else:
                    # For error metrics like RMSE/MAE, lower is better
                    if delta_abs < -0.001:
                        verdict = "outperformed"
                    elif abs(delta_abs) <= 0.001:
                        verdict = "tied"
                    else:
                        verdict = "underperformed"

                notes = (
                    f"Baseline evaluated under identical holdout test partition ({len(X_test)} samples). "
                    f"AutoML model {verdict} baseline on primary metric '{primary_metric}'."
                    f"{pct_note}"
                )

                results.append(
                    BaselineComparisonResult(
                        baseline_name=b_name,
                        baseline_strategy=b_strategy,
                        baseline_metrics=b_metrics,
                        model_metrics=model_metrics,
                        primary_metric=primary_metric,
                        delta_absolute=delta_abs,
                        delta_percentage=delta_pct,
                        selection_quality=verdict,
                        notes=notes,
                    )
                )

            except Exception as exc:
                logger.warning("Baseline '%s' evaluation failed: %s", b_name, exc)
                results.append(
                    BaselineComparisonResult(
                        baseline_name=b_name,
                        baseline_strategy=b_strategy,
                        baseline_metrics={},
                        model_metrics=model_metrics,
                        primary_metric=primary_metric,
                        delta_absolute=0.0,
                        delta_percentage=None,
                        selection_quality="tied",
                        notes=f"Baseline evaluation could not be completed: {exc}",
                    )
                )

        return results
