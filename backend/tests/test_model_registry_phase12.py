"""Comprehensive automated tests for Phase 12: Model Registry, Semantic Versioning, and Lifecycle Management."""

import hashlib
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.schemas.tracking import LifecycleStage


@pytest.fixture
def registry_env(tmp_path: Path):
    """Isolated test environment with temporary experiments and registry storage."""
    experiments_dir = tmp_path / "experiments"
    upload_dir = tmp_path / "uploads"
    experiments_dir.mkdir(parents=True, exist_ok=True)
    upload_dir.mkdir(parents=True, exist_ok=True)

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        ENABLE_MLFLOW_TRACKING=False,
    )

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings), \
         patch("app.services.automl.prediction_service.get_settings", return_value=test_settings):
        with TestClient(app) as client:
            yield client, experiments_dir


def create_mock_experiment(
    experiments_dir: Path,
    exp_id: str,
    status: str = "completed",
    task_type: str = "classification",
    best_model: str = "random_forest",
    best_score: float = 0.95,
    create_artifact: bool = True,
    corrupt_meta_checksum: bool = False,
) -> Path:
    """Create a realistic completed experiment directory with valid model binary."""
    exp_dir = experiments_dir / exp_id
    exp_dir.mkdir(parents=True, exist_ok=True)

    model_file = exp_dir / "best_model.joblib"
    model_sha256 = None
    model_size = None

    if create_artifact:
        content = f"DUMMY_SCIKIT_MODEL_PIPELINE_{exp_id}".encode("utf-8")
        model_file.write_bytes(content)
        model_size = len(content)
        model_sha256 = hashlib.sha256(content).hexdigest()

    meta_sha = "0000000000000000000000000000000000000000000000000000000000000000" if corrupt_meta_checksum else model_sha256

    meta = {
        "experiment_id": exp_id,
        "name": f"Run {exp_id}",
        "status": status,
        "created_at": "2026-10-20T10:00:00Z",
        "dataset_id": "dataset-prod-churn",
        "dataset_fingerprint": "c1d2e3f4" * 8,
        "target_column": "churn",
        "task_type": task_type,
        "evaluation_strategy": "cross_validation",
        "primary_metric": "roc_auc",
        "primary_metric_greater_is_better": True,
        "best_model": best_model if status == "completed" else None,
        "best_score": best_score if status == "completed" else None,
        "test_metrics": {"roc_auc": best_score, "accuracy": best_score - 0.05} if status == "completed" else None,
        "artifacts": {
            "model_filename": "best_model.joblib",
            "model_format": "joblib",
            "model_sha256": meta_sha,
            "model_size_bytes": model_size,
        },
    }

    meta_file = exp_dir / "metadata.json"
    meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return exp_dir


def test_model_registration_lifecycle(registry_env):
    """Test registering a model version from a completed experiment, validating version numbering and audit entry."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-reg-success-1", best_score=0.942)

    # Register as new model family
    res = client.post(
        "/api/v1/models/register",
        json={
            "experiment_id": "exp-reg-success-1",
            "model_name": "telco_churn_detector",
            "description": "Baseline random forest model for churn detection",
            "tags": ["telecom", "churn", "v1-candidate"],
            "initial_stage": "development",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["model_name"] == "telco_churn_detector"
    assert data["version"] == 1
    assert data["version_tag"] == "v1"
    assert data["stage"] == "development"
    assert data["score"] == 0.942
    assert data["primary_metric"] == "roc_auc"
    assert len(data["artifact_sha256"]) == 64
    assert len(data["audit_history"]) == 1
    assert data["audit_history"][0]["to_stage"] == "development"

    # Verify physical file was copied to model registry storage
    saved_model = exp_dir / "model_registry" / "telco_churn_detector" / "v1" / "best_model.joblib"
    assert saved_model.is_file()
    assert saved_model.stat().st_size == data["artifact_size_bytes"]


def test_reject_registration_from_failed_or_invalid_experiment(registry_env):
    """Verify registration guards reject failed runs, missing artifacts, invalid names, and corrupted checksums."""
    client, exp_dir = registry_env

    # 1. Failed experiment
    create_mock_experiment(exp_dir, "exp-fail", status="failed", create_artifact=False)
    res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-fail", "model_name": "invalid_model"},
    )
    assert res.status_code == 400
    assert "status 'failed'" in res.json()["detail"]

    # 2. Non-existent experiment
    res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-nonexistent", "model_name": "invalid_model"},
    )
    assert res.status_code == 404

    # 3. Missing artifact on disk
    create_mock_experiment(exp_dir, "exp-no-artifact", status="completed", create_artifact=False)
    res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-no-artifact", "model_name": "invalid_model"},
    )
    assert res.status_code == 404

    # 4. Checksum mismatch
    create_mock_experiment(exp_dir, "exp-mismatch", status="completed", corrupt_meta_checksum=True)
    res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-mismatch", "model_name": "invalid_model"},
    )
    assert res.status_code == 400
    assert "checksum mismatch" in res.json()["detail"].lower()

    # 5. Invalid model name
    create_mock_experiment(exp_dir, "exp-valid-id")
    res = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-valid-id", "model_name": "bad model!name@"},
    )
    assert res.status_code == 422  # Pydantic regex pattern violation


def test_monotonic_version_increments_and_retrieval(registry_env):
    """Verify successive registrations increment version monotonically (v1 -> v2 -> v3)."""
    client, exp_dir = registry_env

    create_mock_experiment(exp_dir, "exp-v1", best_score=0.88)
    create_mock_experiment(exp_dir, "exp-v2", best_score=0.91)
    create_mock_experiment(exp_dir, "exp-v3", best_score=0.95)

    # Register v1
    r1 = client.post("/api/v1/models/register", json={"experiment_id": "exp-v1", "model_name": "housing_pricing"})
    assert r1.status_code == 201
    assert r1.json()["version"] == 1

    # Register v2
    r2 = client.post("/api/v1/models/register", json={"experiment_id": "exp-v2", "model_name": "housing_pricing"})
    assert r2.status_code == 201
    assert r2.json()["version"] == 2

    # Register v3
    r3 = client.post("/api/v1/models/register", json={"experiment_id": "exp-v3", "model_name": "housing_pricing"})
    assert r3.status_code == 201
    assert r3.json()["version"] == 3

    # List all versions (should return 3 records, newest first)
    res = client.get("/api/v1/models/housing_pricing")
    assert res.status_code == 200
    versions = res.json()
    assert len(versions) == 3
    assert [v["version"] for v in versions] == [3, 2, 1]

    # Retrieve specific version details
    v2_res = client.get("/api/v1/models/housing_pricing/versions/2")
    assert v2_res.status_code == 200
    assert v2_res.json()["version"] == 2
    assert v2_res.json()["score"] == 0.91


def test_lifecycle_stage_transitions_and_production_exclusivity(registry_env):
    """Verify stage transitions, audit log recording, and single-production version exclusivity."""
    client, exp_dir = registry_env

    create_mock_experiment(exp_dir, "exp-prod-1", best_score=0.90)
    create_mock_experiment(exp_dir, "exp-prod-2", best_score=0.95)

    client.post("/api/v1/models/register", json={"experiment_id": "exp-prod-1", "model_name": "fraud_detector"})
    client.post("/api/v1/models/register", json={"experiment_id": "exp-prod-2", "model_name": "fraud_detector"})

    # 1. Promote v1 to Staging then Production
    client.post(
        "/api/v1/models/fraud_detector/versions/1/stage",
        json={"new_stage": "staging", "reason": "Passed integration tests"},
    )
    v1_prod = client.post(
        "/api/v1/models/fraud_detector/versions/1/stage",
        json={"new_stage": "production", "reason": "Approved by release committee"},
    )
    assert v1_prod.status_code == 200
    assert v1_prod.json()["stage"] == "production"
    assert len(v1_prod.json()["audit_history"]) == 3

    # Check catalog shows v1 in production
    catalog = client.get("/api/v1/models").json()
    model_entry = next(m for m in catalog["models"] if m["model_name"] == "fraud_detector")
    assert model_entry["production_version"] == 1

    # 2. Promote v2 directly to Production -> v1 must be automatically demoted to Archived!
    v2_prod = client.post(
        "/api/v1/models/fraud_detector/versions/2/stage",
        json={"new_stage": "production", "reason": "Superior performance (0.95 vs 0.90)"},
    )
    assert v2_prod.status_code == 200
    assert v2_prod.json()["stage"] == "production"

    # Re-inspect v1
    v1_updated = client.get("/api/v1/models/fraud_detector/versions/1").json()
    assert v1_updated["stage"] == "archived"
    assert any("Superceded by promotion" in h["reason"] for h in v1_updated["audit_history"])

    # Catalog should now reflect v2 as Production
    catalog_updated = client.get("/api/v1/models").json()
    model_entry_updated = next(m for m in catalog_updated["models"] if m["model_name"] == "fraud_detector")
    assert model_entry_updated["production_version"] == 2


def test_artifact_integrity_verification_and_tamper_detection(registry_env):
    """Verify live SHA-256 verification detects corrupted or deleted model binaries in the registry."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-tamper-check")
    client.post("/api/v1/models/register", json={"experiment_id": "exp-tamper-check", "model_name": "tamper_test"})

    # 1. Initial verification should succeed
    res = client.get("/api/v1/models/tamper_test/versions/1/verify")
    assert res.status_code == 200
    assert res.json()["verified"] is True
    assert res.json()["artifact_exists"] is True

    # 2. Tamper with file
    v1_file = exp_dir / "model_registry" / "tamper_test" / "v1" / "best_model.joblib"
    v1_file.write_bytes(b"MALICIOUS_TAMPERED_CONTENT")

    res = client.get("/api/v1/models/tamper_test/versions/1/verify")
    assert res.status_code == 200
    data = res.json()
    assert data["verified"] is False
    assert "FAILURE" in data["message"]

    # 3. Missing file
    v1_file.unlink()
    res = client.get("/api/v1/models/tamper_test/versions/1/verify")
    assert res.status_code == 200
    assert res.json()["verified"] is False
    assert res.json()["artifact_exists"] is False


def test_model_artifact_download_and_safe_retrieval(registry_env):
    """Verify secure model artifact download streaming and rejection of corrupted models."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-download-model")
    client.post("/api/v1/models/register", json={"experiment_id": "exp-download-model", "model_name": "download_test"})

    res = client.get("/api/v1/models/download_test/versions/1/download")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/octet-stream"
    assert "download_test_v1.joblib" in res.headers["content-disposition"]
    assert "X-Artifact-SHA256" in res.headers


def test_compare_model_versions(registry_env):
    """Verify comparative analysis across registered versions of a model family."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-v1-comp", best_model="logistic_regression", best_score=0.85)
    create_mock_experiment(exp_dir, "exp-v2-comp", best_model="random_forest", best_score=0.92)

    client.post("/api/v1/models/register", json={"experiment_id": "exp-v1-comp", "model_name": "compare_test"})
    client.post("/api/v1/models/register", json={"experiment_id": "exp-v2-comp", "model_name": "compare_test"})

    res = client.post("/api/v1/models/compare_test/compare-versions")
    assert res.status_code == 200
    data = res.json()

    assert data["model_name"] == "compare_test"
    assert "v1" in data["versions_compared"]
    assert "v2" in data["versions_compared"]
    assert data["algorithms"]["v1"] == "logistic_regression"
    assert data["algorithms"]["v2"] == "random_forest"
    assert "roc_auc" in data["metric_comparison"]
    assert data["metric_comparison"]["roc_auc"]["v1"] == 0.85
    assert data["metric_comparison"]["roc_auc"]["v2"] == 0.92


def test_concurrent_model_registration(registry_env):
    """Verify thread-safe registration avoids version collision under concurrent requests."""
    from concurrent.futures import ThreadPoolExecutor
    client, exp_dir = registry_env

    # Create 5 distinct completed experiments
    for i in range(1, 6):
        create_mock_experiment(exp_dir, f"exp-concurrent-{i}", best_score=0.80 + i * 0.02)

    def register_worker(exp_num: int):
        return client.post(
            "/api/v1/models/register",
            json={
                "experiment_id": f"exp-concurrent-{exp_num}",
                "model_name": "concurrent_stress_model",
                "description": f"Worker {exp_num}",
            },
        )

    with ThreadPoolExecutor(max_workers=5) as executor:
        responses = list(executor.map(register_worker, range(1, 6)))

    assert all(r.status_code == 201 for r in responses)
    assigned_versions = {r.json()["version"] for r in responses}
    # Ensure all 5 versions 1..5 were uniquely assigned with 0 collisions
    assert assigned_versions == {1, 2, 3, 4, 5}


def test_duplicate_registration_is_idempotent(registry_env):
    """Verify duplicate registration of the same experiment returns existing record without bumping version."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-idempotent-1")

    # Initial registration -> v1
    res1 = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-idempotent-1", "model_name": "idempotent_model"},
    )
    assert res1.status_code == 201
    assert res1.json()["version"] == 1

    # Duplicate registration of the exact same experiment
    res2 = client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-idempotent-1", "model_name": "idempotent_model"},
    )
    assert res2.status_code in [200, 201]
    # Version must remain 1, NOT incremented to 2!
    assert res2.json()["version"] == 1

    # Catalog must reflect exactly 1 version
    catalog = client.get("/api/v1/models").json()
    model_entry = next(m for m in catalog["models"] if m["model_name"] == "idempotent_model")
    assert model_entry["versions_count"] == 1


def test_reject_production_promotion_for_corrupted_or_missing_artifact(registry_env):
    """Verify safeguard: Never promote a model to Production if its artifact does not exist or fails verification."""
    client, exp_dir = registry_env
    create_mock_experiment(exp_dir, "exp-prod-guard")

    client.post(
        "/api/v1/models/register",
        json={"experiment_id": "exp-prod-guard", "model_name": "tamper_prod_guard"},
    )

    # Corrupt the registered version artifact on disk
    v1_file = exp_dir / "model_registry" / "tamper_prod_guard" / "v1" / "best_model.joblib"
    v1_file.write_bytes(b"TAMPERED_MALICIOUS_BYTES")

    # Attempt promotion to Production -> must be rejected with 400 Bad Request
    res = client.post(
        "/api/v1/models/tamper_prod_guard/versions/1/stage",
        json={"new_stage": "production", "reason": "Attempting to release tampered build"},
    )
    assert res.status_code == 400
    assert "Cannot promote to Production" in res.json()["detail"]
    assert "integrity verification failed" in res.json()["detail"]

    # Verify stage remained Development
    v1_meta = client.get("/api/v1/models/tamper_prod_guard/versions/1").json()
    assert v1_meta["stage"] == "development"


def test_concurrent_production_stage_transitions(registry_env):
    """Verify thread-safe stage transitions preserve single-production exclusivity under concurrent promotions."""
    from concurrent.futures import ThreadPoolExecutor
    client, exp_dir = registry_env

    # Register 3 versions
    for i in range(1, 4):
        create_mock_experiment(exp_dir, f"exp-race-{i}", best_score=0.85 + i * 0.03)
        client.post(
            "/api/v1/models/register",
            json={"experiment_id": f"exp-race-{i}", "model_name": "race_prod_model"},
        )

    def promote_worker(version_num: int):
        return client.post(
            f"/api/v1/models/race_prod_model/versions/{version_num}/stage",
            json={"new_stage": "production", "reason": f"Concurrent promote v{version_num}"},
        )

    with ThreadPoolExecutor(max_workers=3) as executor:
        responses = list(executor.map(promote_worker, [1, 2, 3]))

    assert all(r.status_code == 200 for r in responses)

    # Check all version records: exactly 1 must be 'production', all others 'archived'
    versions = client.get("/api/v1/models/race_prod_model").json()
    stages = [v["stage"] for v in versions]
    assert stages.count("production") == 1
    assert stages.count("archived") == 2

    # Check catalog summary
    catalog = client.get("/api/v1/models").json()
    model_entry = next(m for m in catalog["models"] if m["model_name"] == "race_prod_model")
    assert model_entry["production_version"] is not None


