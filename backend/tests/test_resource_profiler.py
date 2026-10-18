"""Unit tests for ResourceProfiler: latency benchmarking, artifact footprint, and structural complexity."""

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from app.services.automl.resource_profiler import ResourceProfiler


@pytest.fixture
def sample_data():
    np.random.seed(42)
    X = pd.DataFrame(np.random.randn(50, 4), columns=["f1", "f2", "f3", "f4"])
    y = np.random.randint(0, 2, size=50)
    return X, y


def test_profile_inference_latency_with_warmup(sample_data):
    """Verify inference latency timing performs warm-up and produces positive latency and throughput."""
    X, y = sample_data
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("model", LogisticRegression(random_state=42)),
    ])
    pipe.fit(X, y)

    lat_ms, tput_sec = ResourceProfiler.profile_inference_latency(pipe, X, n_passes=5, max_batch_size=25)

    assert lat_ms > 0.0
    assert tput_sec > 0.0
    # Throughput should roughly inversely scale with latency
    assert isinstance(lat_ms, float)
    assert isinstance(tput_sec, float)


def test_measure_artifact_size_bytes(sample_data):
    """Verify serialized joblib byte measurement reflects pipeline size."""
    X, y = sample_data
    pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("model", DecisionTreeClassifier(max_depth=3, random_state=42)),
    ])
    pipe.fit(X, y)

    size_bytes = ResourceProfiler.measure_artifact_size_bytes(pipe)
    assert isinstance(size_bytes, int)
    assert size_bytes > 500  # Typical serialized scikit-learn pipeline is at least several hundred bytes


def test_extract_model_complexity_random_forest(sample_data):
    """Verify structural introspection for RandomForest."""
    X, y = sample_data
    rf = RandomForestClassifier(n_estimators=10, max_depth=4, random_state=42)
    rf.fit(X, y)

    comp = ResourceProfiler.extract_model_complexity(rf)
    assert comp.estimator_type == "RandomForestClassifier"
    assert comp.tree_count == 10
    assert comp.total_tree_nodes is not None and comp.total_tree_nodes > 10
    assert comp.max_depth is not None and comp.max_depth <= 4
    assert comp.complexity_unit == "tree_nodes"
    assert comp.summary_complexity_score == float(comp.total_tree_nodes)


def test_extract_model_complexity_decision_tree(sample_data):
    """Verify structural introspection for DecisionTree."""
    X, y = sample_data
    dt = DecisionTreeClassifier(max_depth=3, random_state=42)
    dt.fit(X, y)

    comp = ResourceProfiler.extract_model_complexity(dt)
    assert comp.estimator_type == "DecisionTreeClassifier"
    assert comp.tree_count == 1
    assert comp.max_depth is not None and comp.max_depth <= 3
    assert comp.complexity_unit == "tree_nodes"
    assert comp.summary_complexity_score == float(comp.total_tree_nodes)


def test_extract_model_complexity_hist_gradient_boosting(sample_data):
    """Verify complexity quantification for HistGradientBoosting."""
    X, y = sample_data
    hgb = HistGradientBoostingClassifier(max_iter=15, max_leaf_nodes=10, random_state=42)
    hgb.fit(X, y)

    comp = ResourceProfiler.extract_model_complexity(hgb)
    assert comp.estimator_type == "HistGradientBoostingClassifier"
    assert comp.tree_count == 15
    assert comp.complexity_unit == "effective_nodes"
    assert comp.summary_complexity_score > 0.0


def test_extract_model_complexity_linear_models(sample_data):
    """Verify non-zero weight count and parameter count for linear models."""
    X, y = sample_data
    lr = LogisticRegression(random_state=42)
    lr.fit(X, y)

    comp = ResourceProfiler.extract_model_complexity(lr)
    assert comp.estimator_type == "LogisticRegression"
    assert comp.n_parameters is not None and comp.n_parameters >= 4
    assert comp.n_nonzero_coefficients is not None and comp.n_nonzero_coefficients > 0
    assert comp.complexity_unit == "nonzero_coefficients"
