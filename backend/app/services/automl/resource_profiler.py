"""Resource profiler: wall-clock timing, inference latency, memory tracking, and structural complexity."""

import io
import logging
import time
import tracemalloc
from typing import Any, Dict, Optional, Tuple
import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from app.schemas.multi_objective import ModelComplexityMetadata

logger = logging.getLogger(__name__)


class ResourceProfiler:
    """Measures training duration, latency, memory, artifact size, and model complexity."""

    @staticmethod
    def profile_inference_latency(
        pipeline: Any,
        X_sample: pd.DataFrame,
        n_passes: int = 5,
        max_batch_size: int = 100,
    ) -> Tuple[float, float]:
        """Benchmark inference latency (ms/sample) and throughput (samples/sec) with warm-up.

        Returns:
            Tuple[latency_ms_per_sample, throughput_samples_per_sec]
        """
        if len(X_sample) == 0:
            return 0.0, 0.0

        batch = X_sample.iloc[: min(max_batch_size, len(X_sample))]
        n_samples = len(batch)

        # 1. Warm-up pass to eliminate initial initialization, JIT or cache artifacts
        try:
            _ = pipeline.predict(batch)
        except Exception as exc:
            logger.warning("Warm-up prediction pass failed: %s", exc)

        # 2. Repeated high-resolution monotonic timing
        t_start = time.perf_counter()
        for _ in range(n_passes):
            _ = pipeline.predict(batch)
        elapsed_total = time.perf_counter() - t_start

        total_predictions = n_samples * n_passes
        if elapsed_total <= 0:
            elapsed_total = 1e-6

        latency_ms_per_sample = round((elapsed_total / total_predictions) * 1000.0, 4)
        throughput_samples_sec = round(total_predictions / elapsed_total, 2)

        return latency_ms_per_sample, throughput_samples_sec

    @staticmethod
    def measure_artifact_size_bytes(pipeline: Any) -> int:
        """Measure serialized joblib disk footprint in bytes without persisting to disk."""
        buf = io.BytesIO()
        joblib.dump(pipeline, buf, compress=3)
        return len(buf.getvalue())

    @staticmethod
    def extract_model_complexity(estimator: Any) -> ModelComplexityMetadata:
        """Inspect and quantify estimator-specific structural complexity."""
        # Unwrap pipeline if needed
        model = estimator
        if hasattr(estimator, "named_steps") and "model" in estimator.named_steps:
            model = estimator.named_steps["model"]

        est_name = model.__class__.__name__

        # 1. Random Forest Ensembles
        if isinstance(model, (RandomForestClassifier, RandomForestRegressor)) and hasattr(model, "estimators_"):
            sub_trees = model.estimators_
            tree_count = len(sub_trees)
            total_nodes = int(sum(t.tree_.node_count for t in sub_trees))
            max_depth = int(max(t.tree_.max_depth for t in sub_trees))
            leaves = int(sum(t.tree_.n_leaves for t in sub_trees))

            return ModelComplexityMetadata(
                estimator_type=est_name,
                tree_count=tree_count,
                max_depth=max_depth,
                total_tree_nodes=total_nodes,
                leaf_count=leaves,
                n_parameters=None,
                n_nonzero_coefficients=None,
                summary_complexity_score=float(total_nodes),
                complexity_unit="tree_nodes",
                notes=f"Ensemble of {tree_count} decision trees with a total of {total_nodes} nodes and max depth {max_depth}.",
            )

        # 2. Single Decision Trees
        if isinstance(model, (DecisionTreeClassifier, DecisionTreeRegressor)) and hasattr(model, "tree_"):
            total_nodes = int(model.tree_.node_count)
            max_depth = int(model.tree_.max_depth)
            leaves = int(model.tree_.n_leaves)

            return ModelComplexityMetadata(
                estimator_type=est_name,
                tree_count=1,
                max_depth=max_depth,
                total_tree_nodes=total_nodes,
                leaf_count=leaves,
                n_parameters=None,
                n_nonzero_coefficients=None,
                summary_complexity_score=float(total_nodes),
                complexity_unit="tree_nodes",
                notes=f"Single decision tree with {total_nodes} nodes, {leaves} leaves, and max depth {max_depth}.",
            )

        # 3. Histogram Gradient Boosting
        if isinstance(model, (HistGradientBoostingClassifier, HistGradientBoostingRegressor)):
            n_iter = int(getattr(model, "n_iter_", getattr(model, "max_iter", 50)))
            max_leaves = int(getattr(model, "max_leaf_nodes", 31))
            effective_nodes = n_iter * max_leaves

            return ModelComplexityMetadata(
                estimator_type=est_name,
                tree_count=n_iter,
                max_depth=getattr(model, "max_depth", None),
                total_tree_nodes=effective_nodes,
                leaf_count=n_iter * max_leaves,
                n_parameters=None,
                n_nonzero_coefficients=None,
                summary_complexity_score=float(effective_nodes),
                complexity_unit="effective_nodes",
                notes=f"Histogram gradient booster evaluated over {n_iter} iterations (max {max_leaves} leaves/tree).",
            )

        # 4. Linear Models (Logistic Regression & Ridge)
        if isinstance(model, (LogisticRegression, Ridge)) and hasattr(model, "coef_"):
            coef = np.asarray(model.coef_)
            n_params = int(coef.size + (model.intercept_.size if hasattr(model, "intercept_") else 0))
            non_zero = int(np.count_nonzero(coef))

            return ModelComplexityMetadata(
                estimator_type=est_name,
                tree_count=None,
                max_depth=None,
                total_tree_nodes=None,
                leaf_count=None,
                n_parameters=n_params,
                n_nonzero_coefficients=non_zero,
                summary_complexity_score=float(non_zero),
                complexity_unit="nonzero_coefficients",
                notes=f"Linear model with {non_zero} non-zero coefficients out of {n_params} total parameters.",
            )

        # 5. Generic Fallback
        params_dict = model.get_params() if hasattr(model, "get_params") else {}
        return ModelComplexityMetadata(
            estimator_type=est_name,
            tree_count=None,
            max_depth=None,
            total_tree_nodes=None,
            leaf_count=None,
            n_parameters=len(params_dict),
            n_nonzero_coefficients=None,
            summary_complexity_score=float(len(params_dict)),
            complexity_unit="tunable_hyperparameters",
            notes=f"Generic estimator parameterized by {len(params_dict)} hyperparameter attributes.",
        )
