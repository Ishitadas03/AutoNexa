"""Evaluation metrics calculation and model ranking for classification and regression."""

import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    root_mean_squared_error,
)

from app.schemas.analysis import TaskType
from app.schemas.training import ModelEvaluationResult, ModelStatus


def sanitize_float(value: Any) -> Optional[float]:
    """Ensure floating point values are strictly JSON-compliant finite numbers."""
    if value is None:
        return None
    try:
        val = float(value)
        if math.isnan(val) or math.isinf(val):
            return None
        return round(val, 4)
    except (TypeError, ValueError):
        return None


class ModelEvaluator:
    """Computes comprehensive task-specific validation metrics and ranks models."""

    @staticmethod
    def get_default_metric(task_type: TaskType) -> Tuple[str, bool]:
        """Return (primary_metric_name, greater_is_better) default for a task."""
        if task_type == TaskType.REGRESSION:
            return "rmse", False
        return "f1_weighted", True

    @staticmethod
    def is_greater_better(metric_name: str) -> bool:
        """Determine whether higher metric value represents superior performance."""
        lower_is_better = {"rmse", "mae", "mse", "mean_squared_error", "mean_absolute_error"}
        return metric_name.lower().strip() not in lower_is_better

    @classmethod
    def evaluate_classification(
        cls,
        pipeline: Any,
        X_test: Any,
        y_test: Any,
    ) -> Dict[str, Any]:
        """Compute accuracy, weighted/macro precision/recall/f1, roc-auc, and confusion matrix."""
        y_pred = pipeline.predict(X_test)
        metrics: Dict[str, Any] = {}

        metrics["accuracy"] = sanitize_float(accuracy_score(y_test, y_pred))
        metrics["precision_weighted"] = sanitize_float(
            precision_score(y_test, y_pred, average="weighted", zero_division=0)
        )
        metrics["recall_weighted"] = sanitize_float(
            recall_score(y_test, y_pred, average="weighted", zero_division=0)
        )
        metrics["f1_weighted"] = sanitize_float(
            f1_score(y_test, y_pred, average="weighted", zero_division=0)
        )
        metrics["f1_macro"] = sanitize_float(
            f1_score(y_test, y_pred, average="macro", zero_division=0)
        )

        # ROC-AUC calculation if probabilities are available
        metrics["roc_auc"] = None
        if hasattr(pipeline, "predict_proba"):
            try:
                probs = pipeline.predict_proba(X_test)
                classes = np.unique(y_test)
                if len(classes) == 2:
                    # Binary classification
                    pos_idx = 1 if probs.shape[1] > 1 else 0
                    metrics["roc_auc"] = sanitize_float(roc_auc_score(y_test, probs[:, pos_idx]))
                elif len(classes) > 2 and probs.shape[1] == len(classes):
                    metrics["roc_auc"] = sanitize_float(
                        roc_auc_score(y_test, probs, multi_class="ovr", average="weighted")
                    )
            except Exception:
                metrics["roc_auc"] = None

        # Confusion Matrix
        try:
            cm = confusion_matrix(y_test, y_pred)
            metrics["confusion_matrix"] = cm.tolist()
        except Exception:
            metrics["confusion_matrix"] = None

        return metrics

    @classmethod
    def evaluate_regression(
        cls,
        pipeline: Any,
        X_test: Any,
        y_test: Any,
    ) -> Dict[str, Any]:
        """Compute RMSE, MAE, and R² for continuous regression evaluation."""
        y_pred = pipeline.predict(X_test)
        metrics: Dict[str, Any] = {}

        metrics["mae"] = sanitize_float(mean_absolute_error(y_test, y_pred))
        metrics["rmse"] = sanitize_float(root_mean_squared_error(y_test, y_pred))
        try:
            r2 = r2_score(y_test, y_pred)
            metrics["r2"] = sanitize_float(r2)
        except Exception:
            metrics["r2"] = None

        return metrics

    @classmethod
    def aggregate_cv_results(
        cls,
        fold_metrics_list: List[Dict[str, Any]],
        primary_metric: str,
    ) -> Tuple[Dict[str, Any], List[float], Optional[float], Optional[float], int]:
        """Aggregate metrics across cross-validation folds.

        Computes:
        - valid_folds_count: number of folds that yielded valid finite primary metric scores
        - cv_scores: list of primary metric scores across valid folds
        - cv_mean: average primary metric score across valid folds (or None if count < 1)
        - cv_std: sample standard deviation with ddof=1 only when >= 2 valid folds exist (otherwise None)
        - mean_metrics: dict of averaged scalar metrics across folds

        Never replaces undefined metrics with zero.
        """
        if not fold_metrics_list:
            return {}, [], None, None, 0

        valid_scores: List[float] = [
            f[primary_metric]
            for f in fold_metrics_list
            if f.get(primary_metric) is not None and isinstance(f[primary_metric], (int, float))
        ]
        valid_count = len(valid_scores)

        cv_mean = sanitize_float(sum(valid_scores) / valid_count) if valid_count >= 1 else None

        if valid_count >= 2:
            import statistics
            cv_std = sanitize_float(statistics.stdev(valid_scores))
        else:
            cv_std = None

        # Aggregate scalar metrics across folds
        all_keys = set().union(*(f.keys() for f in fold_metrics_list))
        mean_metrics: Dict[str, Any] = {}
        for key in sorted(all_keys):
            if key == "confusion_matrix":
                continue
            vals = [
                f[key] for f in fold_metrics_list
                if f.get(key) is not None and isinstance(f[key], (int, float))
            ]
            if vals:
                mean_metrics[key] = sanitize_float(sum(vals) / len(vals))
            else:
                mean_metrics[key] = None

        return mean_metrics, valid_scores, cv_mean, cv_std, valid_count

    @classmethod
    def rank_models(
        cls,
        results: List[ModelEvaluationResult],
        primary_metric: str,
        greater_is_better: bool,
    ) -> List[str]:
        """Sort successful candidate models from best to worst based on CV mean or holdout primary metric."""
        successful = [r for r in results if r.status == ModelStatus.SUCCESSFUL]
        if not successful:
            return []

        def get_sort_key(res: ModelEvaluationResult) -> float:
            # Use cv_mean if available (cross-validation), otherwise use holdout metric
            score = res.cv_mean if res.cv_mean is not None else res.metrics.get(primary_metric)
            if score is None:
                # If metric is undefined, place at the very end of ranking without substituting zero
                return -float("inf") if greater_is_better else float("inf")
            return float(score)

        sorted_results = sorted(successful, key=get_sort_key, reverse=greater_is_better)
        return [r.model_id for r in sorted_results]
