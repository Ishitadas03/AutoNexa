"""Comprehensive tests for Phase 12: Research-Grade Experiment Tracking & Audit Layer."""

import json
from pathlib import Path
import tempfile
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.db.session import init_db
from app.main import app


@pytest.fixture
def tracking_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Isolated test environment with temporary experiments, uploads, and database."""
    experiments_dir = tmp_path / "experiments"
    upload_dir = tmp_path / "uploads"
    data_dir = tmp_path / "data"
    db_path = data_dir / "metadata.db"

    experiments_dir.mkdir(parents=True, exist_ok=True)
    upload_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        METADATA_DB_PATH=str(db_path),
        ENABLE_MLFLOW_TRACKING=False,
    )

    init_db(db_path=db_path)
    monkeypatch.setenv("METADATA_DB_PATH", str(db_path))
    monkeypatch.setenv("EXPERIMENTS_DIR", str(experiments_dir))
    monkeypatch.setenv("UPLOAD_DIR", str(upload_dir))
    get_settings.cache_clear()

    patches = [
        patch("app.core.config.get_settings", return_value=test_settings),
        patch("app.db.session.get_settings", return_value=test_settings),
        patch("app.db.reconciliation.get_settings", return_value=test_settings),
        patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings),
        patch("app.services.automl.prediction_service.get_settings", return_value=test_settings),
    ]

    for p in patches:
        p.start()

    try:
        with TestClient(app, headers={"X-API-Key": "autonexa-admin-key-secret"}) as client:
            yield client, experiments_dir
    finally:
        for p in reversed(patches):
            p.stop()
        get_settings.cache_clear()


def create_synthetic_experiment(
    experiments_dir: Path,
    exp_id: str,
    status: str = "completed",
    task_type: str = "classification",
    target_col: str = "target",
    primary_metric: str = "accuracy",
    best_score: float = 0.95,
    best_model: str = "random_forest",
    create_artifact: bool = True,
    corrupt_artifact: bool = False,
    error_info: dict = None,
) -> Path:
    """Helper to write a synthetic experiment directory with metadata and optional artifact."""
    exp_dir = experiments_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)

    model_file = exp_dir / "best_model.joblib"
    model_sha256 = None
    model_size = None

    if create_artifact:
        content = b"FAKE_JOBLIB_MODEL_BINARY_DATA_FOR_TESTING"
        import hashlib
        model_sha256 = hashlib.sha256(content).hexdigest()
        if corrupt_artifact:
            model_file.write_bytes(b"TAMPERED_DATA")
            model_size = len(b"TAMPERED_DATA")
        else:
            model_file.write_bytes(content)
            model_size = len(content)

    meta = {
        "experiment_id": exp_id,
        "name": f"Test Experiment {exp_id[:6]}",
        "status": status,
        "created_at": "2026-10-20T12:00:00Z",
        "dataset_id": "dataset-synthetic-123",
        "dataset_fingerprint": "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
        "target_column": target_col,
        "task_type": task_type,
        "evaluation_strategy": "holdout",
        "primary_metric": primary_metric,
        "primary_metric_greater_is_better": True if primary_metric in ["accuracy", "f1", "roc_auc"] else False,
        "random_state": 42,
        "test_size": 0.2,
        "train_rows": 100,
        "test_rows": 25,
        "features_count": 4,
        "feature_names": ["f1", "f2", "f3", "f4"],
        "numeric_features": ["f1", "f2"],
        "categorical_features": ["f3", "f4"],
        "ranked_models": [best_model, "dummy"],
        "best_model": best_model if status == "completed" else None,
        "best_score": best_score if status == "completed" else None,
        "test_metrics": {primary_metric: best_score, "f1": best_score - 0.02} if status == "completed" else None,
        "total_duration_seconds": 1.25,
        "models_evaluated": [
            {
                "model_id": best_model,
                "model_name": best_model.replace("_", " ").title(),
                "status": "successful",
                "metrics": {primary_metric: best_score},
                "duration_seconds": 0.75,
            },
            {
                "model_id": "dummy",
                "model_name": "Dummy Baseline",
                "status": "successful",
                "metrics": {primary_metric: 0.50},
                "duration_seconds": 0.10,
            },
        ],
        "artifacts": {
            "model_filename": "best_model.joblib",
            "model_format": "joblib",
            "model_sha256": model_sha256,
            "model_size_bytes": model_size,
        },
        "package_versions": {
            "scikit-learn": "1.7.0",
            "pandas": "2.2.3",
            "numpy": "2.2.6",
        },
        "system_info": {
            "os_name": "Windows",
            "python_version": "3.11.3",
        },
        "error_info": error_info,
    }

    meta_file = exp_dir / "metadata.json"
    meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    db_candidates = [
        experiments_dir.parent / "data" / "metadata.db",
        experiments_dir.parent / "metadata.db",
        experiments_dir / "metadata.db",
    ]
    for db_file in db_candidates:
        if db_file.exists():
            try:
                from app.db.session import get_db_context
                from app.db.reconciliation import MetadataReconciliationService
                with get_db_context(db_file) as session:
                    MetadataReconciliationService().reconcile_experiments(session, experiments_dir)
            except Exception:
                pass
            break

    return exp_dir


def test_list_experiments_empty_and_populated(tracking_env):
    """Test listing experiments returns empty page when no runs exist and summaries when populated."""
    client, exp_dir = tracking_env

    # 1. Empty list
    res = client.get("/api/v1/experiments")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["items"] == []

    # 2. Add experiments
    create_synthetic_experiment(exp_dir, "exp-1", task_type="classification", best_score=0.92)
    create_synthetic_experiment(exp_dir, "exp-2", task_type="regression", primary_metric="rmse", best_score=12.4)

    res = client.get("/api/v1/experiments")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    ids = [item["experiment_id"] for item in data["items"]]
    assert "exp-1" in ids
    assert "exp-2" in ids
    assert all(item["has_artifact"] is True for item in data["items"])


def test_list_experiments_pagination(tracking_env):
    """Test pagination bounds and slicing across multiple experiment records."""
    client, exp_dir = tracking_env

    for i in range(5):
        create_synthetic_experiment(exp_dir, f"exp-page-{i}", best_score=0.80 + i * 0.02)

    # Page 1 with size 2
    res = client.get("/api/v1/experiments?page=1&page_size=2")
    assert res.status_code == 200
    p1 = res.json()
    assert p1["total"] == 5
    assert len(p1["items"]) == 2
    assert p1["page"] == 1
    assert p1["total_pages"] == 3

    # Page 3 with size 2 (remaining 1 item)
    res = client.get("/api/v1/experiments?page=3&page_size=2")
    assert res.status_code == 200
    p3 = res.json()
    assert len(p3["items"]) == 1


def test_list_experiments_filtering_and_search(tracking_env):
    """Verify filtering by task type, status, and searching across attributes."""
    client, exp_dir = tracking_env

    create_synthetic_experiment(exp_dir, "exp-clf-1", task_type="classification", status="completed", target_col="churn")
    create_synthetic_experiment(exp_dir, "exp-reg-1", task_type="regression", status="completed", target_col="price")
    create_synthetic_experiment(exp_dir, "exp-fail-1", task_type="classification", status="failed", create_artifact=False)

    # Filter task_type
    res = client.get("/api/v1/experiments?task_type=regression")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["experiment_id"] == "exp-reg-1"

    # Filter status
    res = client.get("/api/v1/experiments?status=failed")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["experiment_id"] == "exp-fail-1"
    assert data["items"][0]["has_artifact"] is False

    # Search keyword
    res = client.get("/api/v1/experiments?search=churn")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert data["items"][0]["experiment_id"] == "exp-clf-1"


def test_get_experiment_details_and_metrics(tracking_env):
    """Verify detailed metadata inspection and metrics extraction."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-detail-1", primary_metric="accuracy", best_score=0.96)

    # 1. Full details
    res = client.get("/api/v1/experiments/exp-detail-1/details")
    assert res.status_code == 200
    detail = res.json()
    assert detail["experiment_id"] == "exp-detail-1"
    assert detail["primary_metric"] == "accuracy"
    assert detail["best_score"] == 0.96
    assert detail["train_rows"] == 100
    assert "scikit-learn" in detail["package_versions"]
    assert detail["system_info"]["python_version"] is not None

    # 2. Metrics summary
    res = client.get("/api/v1/experiments/exp-detail-1/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert metrics["best_score"] == 0.96
    assert "random_forest" in metrics["candidate_models"]

    # 3. Non-existent experiment
    res = client.get("/api/v1/experiments/non-existent-exp/details")
    assert res.status_code == 404


def test_failed_experiment_diagnostic_retention(tracking_env):
    """Ensure failed experiments preserve structured error diagnostics without exposing sensitive paths."""
    client, exp_dir = tracking_env
    err = {
        "error_type": "ValueError",
        "error_message": "Matrix dimension mismatch during matrix inversion.",
    }
    create_synthetic_experiment(
        exp_dir,
        "exp-failed-run",
        status="failed",
        create_artifact=False,
        error_info=err,
    )

    res = client.get("/api/v1/experiments/exp-failed-run/details")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "failed"
    assert data["error_info"]["error_type"] == "ValueError"
    assert "Matrix dimension" in data["error_info"]["error_message"]
    # Ensure no local file paths leaked into error info
    assert "C:\\" not in str(data["error_info"])
    assert "/Users/" not in str(data["error_info"])


def test_reproducibility_manifest_export_and_integrity(tracking_env):
    """Verify manifest generation, canonical SHA-256 fingerprinting, and artifact integrity checks."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-manifest-test", best_score=0.94)

    # 1. Export reproducibility manifest
    res = client.get("/api/v1/experiments/exp-manifest-test/reproducibility-manifest")
    assert res.status_code == 200
    manifest = res.json()

    assert manifest["experiment_id"] == "exp-manifest-test"
    assert manifest["reproducibility_level"] == "configuration_and_environment"
    assert "scientific_disclaimer" in manifest
    assert len(manifest["manifest_sha256"]) == 64
    assert manifest["artifact"]["sha256"] is not None

    # 2. Verify artifact integrity (matches)
    res = client.get("/api/v1/experiments/exp-manifest-test/reproducibility-manifest/verify")
    assert res.status_code == 200
    veri = res.json()
    assert veri["verified"] is True
    assert veri["artifact_exists"] is True
    assert veri["actual_sha256"] == veri["expected_sha256"]

    # 3. Tamper with artifact -> verification must fail
    model_file = exp_dir / "exp-manifest-test" / "best_model.joblib"
    model_file.write_bytes(b"TAMPERED_CONTENT_NEW_HASH")

    res = client.get("/api/v1/experiments/exp-manifest-test/reproducibility-manifest/verify")
    assert res.status_code == 200
    veri_tampered = res.json()
    assert veri_tampered["verified"] is False
    assert "MISMATCH" in veri_tampered["message"]


def test_experiment_comparison(tracking_env):
    """Verify side-by-side comparison across multiple experiments."""
    client, exp_dir = tracking_env

    create_synthetic_experiment(exp_dir, "exp-comp-1", primary_metric="accuracy", best_score=0.91, best_model="logistic_regression")
    create_synthetic_experiment(exp_dir, "exp-comp-2", primary_metric="accuracy", best_score=0.95, best_model="random_forest")

    # 1. Compatible comparison
    res = client.post(
        "/api/v1/experiments/compare",
        json={"experiment_ids": ["exp-comp-1", "exp-comp-2"]},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["common_dataset"] is True
    assert data["common_task"] is True
    assert data["compatibility_warning"] is None
    assert "accuracy" in data["metric_comparison"]
    assert data["best_per_metric"]["accuracy"] == "exp-comp-2"
    assert data["statistical_summary"] is not None

    # 2. Incompatible tasks comparison
    create_synthetic_experiment(exp_dir, "exp-comp-reg", task_type="regression", primary_metric="rmse", best_score=10.5)
    res = client.post(
        "/api/v1/experiments/compare",
        json={"experiment_ids": ["exp-comp-1", "exp-comp-reg"]},
    )
    assert res.status_code == 200
    incomp_data = res.json()
    assert incomp_data["common_task"] is False
    assert incomp_data["compatibility_warning"] is not None
    assert "disparate machine learning tasks" in incomp_data["compatibility_warning"]

    # 3. Validation bounds (< 2 experiments)
    res = client.post("/api/v1/experiments/compare", json={"experiment_ids": ["exp-comp-1"]})
    assert res.status_code == 422  # Pydantic min_length=2


def test_safe_deletion_and_traversal_protection(tracking_env):
    """Verify directory traversal is strictly blocked and valid deletion works."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-del-test")

    # Invalid characters or traversal in identifier rejected with 400
    res = client.get("/api/v1/experiments/bad..traversal/details")
    assert res.status_code == 400

    res = client.delete("/api/v1/experiments/bad..traversal")
    assert res.status_code == 400

    from app.services.automl.experiment_tracker_service import ExperimentTrackerService
    from fastapi import HTTPException
    tracker = ExperimentTrackerService(exp_dir)
    with pytest.raises(HTTPException) as exc_info:
        tracker.safe_resolve_experiment_dir("../escape")
    assert exc_info.value.status_code == 400

    # Valid deletion
    res = client.delete("/api/v1/experiments/exp-del-test")
    assert res.status_code == 200
    assert res.json()["success"] is True
    assert not (exp_dir / "exp-del-test").exists()


def test_download_experiment_artifact(tracking_env):
    """Verify model artifact streaming endpoint returns genuine binary with SHA-256 header."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-download-test")

    res = client.get("/api/v1/experiments/exp-download-test/artifact")
    assert res.status_code == 200
    assert res.content == b"FAKE_JOBLIB_MODEL_BINARY_DATA_FOR_TESTING"
    assert res.headers["content-type"] == "application/octet-stream"
    assert "X-Artifact-SHA256" in res.headers


def test_download_experiment_artifact_rejects_corrupted_binary(tracking_env):
    """Verify download endpoint rejects corrupted or tampered model artifacts with 400 Bad Request."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-download-corrupt", corrupt_artifact=True)

    res = client.get("/api/v1/experiments/exp-download-corrupt/artifact")
    assert res.status_code == 400
    assert "Cannot download model artifact" in res.json()["detail"]
    assert "MISMATCH" in res.json()["detail"]


def test_comparison_with_nan_metrics_and_exact_ties(tracking_env):
    """Verify experiment comparison safely handles NaN/missing metrics and identifies exact ties."""
    client, exp_dir = tracking_env
    create_synthetic_experiment(exp_dir, "exp-tie-1", best_score=0.90)
    create_synthetic_experiment(exp_dir, "exp-tie-2", best_score=0.90)

    # Inject a NaN metric into exp-tie-1
    meta_path = exp_dir / "exp-tie-1" / "metadata.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["test_metrics"]["nan_metric"] = float("nan")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    res = client.post(
        "/api/v1/experiments/compare",
        json={"experiment_ids": ["exp-tie-1", "exp-tie-2"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["common_dataset"] is True
    assert data["common_task"] is True

    # Exact score tie should be marked as "tie"
    stat = data["statistical_summary"]
    assert stat is not None
    diffs = stat["metric_differences"]
    assert "accuracy" in diffs
    assert diffs["accuracy"]["absolute_difference"] == 0.0
    assert diffs["accuracy"]["superior_experiment"] == "tie"

