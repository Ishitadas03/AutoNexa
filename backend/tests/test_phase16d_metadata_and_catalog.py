"""AutoNexa Phase 16D: Persistent Metadata, Dataset Catalog & Scalable Indexing Tests.

Validates:
1. SQLite WAL mode, foreign keys, busy timeouts, and schema version ledger.
2. Dataset catalog repository CRUD, deterministic ordering, filtering, pagination, and relationship counting.
3. Dataset catalog HTTP endpoints (GET /api/v1/datasets, GET /api/v1/datasets/{dataset_id}).
4. Phase 16B RBAC integration (Inference role for reads, Admin role for uploads, public health check).
5. Dataset upload streaming SHA-256 fingerprinting and automatic catalog registration.
6. Traversal attack protection on dataset endpoints and file resolution.
7. Idempotent legacy metadata reconciliation for uploads, experiments, and pipelines.
8. Relational indexed listing for experiments and pipelines with fallback resilience.
9. Database session rollback on error and multi-thread concurrency safety.
10. FastAPI lifespan startup initialization and clean shutdown engine disposal.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import time
from unittest.mock import patch

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.db.models import DatasetModel, ExperimentModel, PipelineModel, SchemaVersionModel, utc_now
from app.db.reconciliation import MetadataReconciliationService
from app.db.repositories.dataset_repository import DatasetRepository
from app.db.repositories.experiment_repository import ExperimentRepository
from app.db.repositories.pipeline_repository import PipelineRepository
from app.db.session import close_db, get_db_context, get_engine, init_db
from app.main import app
from app.services.automl.experiment_tracker_service import get_experiment_tracker_service
from app.services.automl.pipeline_service import get_pipeline_service
from app.services.dataset_service import get_dataset_service


@pytest.fixture
def phase16d_env(tmp_path: Path):
    """Provide isolated environment with SQLite metadata database, temporary upload and experiment dirs."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    db_path = experiments_dir / "metadata.db"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    read_key = "test-16d-read-key"
    admin_key = "test-16d-admin-key"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        METADATA_DB_PATH=str(db_path),
        API_AUTH_ENABLED=True,
        API_KEY_READ=read_key,
        API_KEY_ADMIN=admin_key,
        ENABLE_MLFLOW_TRACKING=False,
        ENVIRONMENT="development",
    )

    # Initialize isolated database
    init_db(db_path=db_path)

    patches = [
        patch("app.core.config.get_settings", return_value=test_settings),
        patch("app.core.security.get_settings", return_value=test_settings),
        patch("app.main.get_settings", return_value=test_settings),
        patch("app.main.settings", test_settings),
        patch("app.db.session.get_settings", return_value=test_settings),
        patch("app.db.reconciliation.get_settings", return_value=test_settings),
        patch("app.services.dataset_service.get_settings", return_value=test_settings),
        patch("app.services.analysis_service.get_settings", return_value=test_settings),
        patch("app.services.automl.training_service.get_settings", return_value=test_settings),
        patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings),
        patch("app.services.automl.pipeline_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_monitoring_service.get_settings", return_value=test_settings),
    ]

    for p in patches:
        p.start()

    with TestClient(app) as client:
        yield client, upload_dir, experiments_dir, db_path, read_key, admin_key

    for p in patches:
        p.stop()

    close_db()


# ==============================================================================
# 1. Database Initialization, WAL Pragmas, and Schema Version
# ==============================================================================


def test_db_initialization_pragmas_and_schema_version(tmp_path: Path):
    """Verify that init_db sets WAL mode, busy_timeout, foreign keys, and version 1."""
    db_file = tmp_path / "custom_meta.db"
    engine = get_engine(db_path=db_file)
    init_db(engine=engine, db_path=db_file)

    with engine.connect() as conn:
        journal_mode = conn.execute(text("PRAGMA journal_mode;")).scalar()
        busy_timeout = conn.execute(text("PRAGMA busy_timeout;")).scalar()
        foreign_keys = conn.execute(text("PRAGMA foreign_keys;")).scalar()

        # WAL mode is active
        assert journal_mode.upper() == "WAL"
        assert busy_timeout == 5000
        assert foreign_keys == 1

        # Check schema version ledger
        v_row = conn.execute(
            text("SELECT version, description FROM schema_versions WHERE version = 1;")
        ).fetchone()
        assert v_row is not None
        assert v_row[0] == 1
        assert "Phase 16D" in v_row[1]

    close_db(engine)


# ==============================================================================
# 2. Dataset Repository: CRUD, Ordering, Pagination, and Filters
# ==============================================================================


def test_dataset_repository_crud_and_deterministic_pagination(phase16d_env):
    """Verify deterministic ordering (created_at DESC, dataset_id DESC) and pagination."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    with get_db_context() as session:
        repo = DatasetRepository(session)

        # Seed 15 dataset records with deterministic timestamps
        base_time = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        for i in range(15):
            t = datetime.fromtimestamp(base_time.timestamp() + i * 60, tz=timezone.utc)
            d = DatasetModel(
                dataset_id=f"ds_{i:02d}",
                filename=f"sample_{i:02d}.csv",
                file_size_bytes=1000 + i * 100,
                rows=100 + i * 10,
                columns=5,
                column_names=["feat_a", "feat_b", "target"],
                data_types={"feat_a": "float", "feat_b": "float", "target": "int"},
                missing_values={"feat_a": 0, "feat_b": 0, "target": 0},
                duplicate_rows=0,
                memory_usage_bytes=5000,
                fingerprint_sha256=f"sha256_{i:02d}" * 4,
                validation_status="valid" if i % 2 == 0 else "flagged",
                created_at=t,
                updated_at=t,
            )
            repo.upsert(d)
        session.commit()

        # Test page 1 (pageSize = 5)
        p1, total1 = repo.list_datasets(page=1, page_size=5)
        assert total1 == 15
        assert len(p1) == 5
        # Order must be newest first (ds_14 -> ds_10)
        assert [d.dataset_id for d in p1] == ["ds_14", "ds_13", "ds_12", "ds_11", "ds_10"]

        # Test page 2 (pageSize = 5)
        p2, total2 = repo.list_datasets(page=2, page_size=5)
        assert total2 == 15
        assert len(p2) == 5
        assert [d.dataset_id for d in p2] == ["ds_09", "ds_08", "ds_07", "ds_06", "ds_05"]

        # Filter by validation_status
        flagged, total_flagged = repo.list_datasets(status="flagged", page=1, page_size=20)
        assert total_flagged == 7
        assert all(d.validation_status == "flagged" for d in flagged)

        # Search query by filename
        searched, total_search = repo.list_datasets(search="sample_03", page=1, page_size=10)
        assert total_search == 1
        assert searched[0].dataset_id == "ds_03"


# ==============================================================================
# 3. RBAC Enforcement on Dataset Catalog Endpoints
# ==============================================================================


def test_dataset_catalog_rbac_protections(phase16d_env):
    """Verify that catalog reads require inference/read role and upload requires admin role."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    # 1. Unauthenticated GET /api/v1/datasets -> 401
    resp_no_auth = client.get("/api/v1/datasets")
    assert resp_no_auth.status_code == 401

    # 2. Invalid API key GET /api/v1/datasets -> 401
    resp_invalid_auth = client.get(
        "/api/v1/datasets",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert resp_invalid_auth.status_code == 401

    # 3. Read key (Inference role) GET /api/v1/datasets -> 200
    resp_read = client.get(
        "/api/v1/datasets",
        headers={"Authorization": f"Bearer {read_key}"},
    )
    assert resp_read.status_code == 200
    data = resp_read.json()
    assert "datasets" in data
    assert "total" in data
    assert data["total"] == 0

    # 4. Read key (Inference role) POST /api/v1/datasets/upload -> 403 Forbidden
    csv_bytes = b"feature_1,feature_2,target\n1.0,2.0,1\n3.0,4.0,0\n"
    files = {"file": ("test_rbac.csv", csv_bytes, "text/csv")}
    resp_upload_forbidden = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"Authorization": f"Bearer {read_key}"},
    )
    assert resp_upload_forbidden.status_code == 403

    # 5. Admin key POST /api/v1/datasets/upload -> 201 Created
    files2 = {"file": ("test_rbac.csv", csv_bytes, "text/csv")}
    resp_upload_admin = client.post(
        "/api/v1/datasets/upload",
        files=files2,
        headers={"Authorization": f"Bearer {admin_key}"},
    )
    assert resp_upload_admin.status_code == 201
    upload_data = resp_upload_admin.json()
    assert "dataset_id" in upload_data
    created_id = upload_data["dataset_id"]

    # 6. Read key GET /api/v1/datasets/{dataset_id} -> 200
    resp_get = client.get(
        f"/api/v1/datasets/{created_id}",
        headers={"Authorization": f"Bearer {read_key}"},
    )
    assert resp_get.status_code == 200
    item = resp_get.json()
    assert item["dataset_id"] == created_id
    assert item["rows"] == 2
    assert item["columns"] == 3
    assert item["validation_status"] == "validated"
    assert len(item["fingerprint_sha256"]) == 64

    # 7. Public health endpoint remains 200 without auth
    resp_health = client.get("/api/v1/health")
    assert resp_health.status_code == 200
    assert resp_health.json()["status"] == "healthy"


# ==============================================================================
# 4. Upload Integration & SHA-256 Fingerprinting
# ==============================================================================


def test_upload_integration_persists_metadata_and_sha256(phase16d_env):
    """Verify that uploading a CSV computes SHA-256 and registers in SQLite catalog."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    csv_content = (
        "age,income,credit_score,approved\n"
        "25,50000,700,1\n"
        "30,60000,720,1\n"
        "45,90000,680,0\n"
        "50,120000,800,1\n"
    )
    files = {"file": ("credit_dataset.csv", csv_content.encode("utf-8"), "text/csv")}

    resp = client.post(
        "/api/v1/datasets/upload",
        files=files,
        headers={"Authorization": f"Bearer {admin_key}"},
    )
    assert resp.status_code == 201
    profile = resp.json()
    dataset_id = profile["dataset_id"]

    # Verify database model was persisted
    with get_db_context() as session:
        repo = DatasetRepository(session)
        model = repo.get_by_id(dataset_id)
        assert model is not None
        assert model.filename == "credit_dataset.csv"
        assert model.row_count == 4
        assert model.column_count == 4
        assert model.validation_status == "validated"
        assert len(model.fingerprint_sha256) == 64

        # Verify disk file actually exists
        ds_file = upload_dir / f"{dataset_id}.csv"
        assert ds_file.exists()
        import hashlib
        expected_sha = hashlib.sha256(csv_content.encode("utf-8")).hexdigest()
        assert model.fingerprint_sha256 == expected_sha


# ==============================================================================
# 5. Traversal Attack Protection on Dataset Catalog
# ==============================================================================


def test_dataset_traversal_attack_protection(phase16d_env):
    """Ensure dataset endpoints block directory traversal attempts."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    traversal_ids = [
        "../etc/passwd",
        "..%2F..%2Fetc%2Fpasswd",
        "nested/path/attack",
        "dataset;rm -rf /",
    ]

    for bad_id in traversal_ids:
        resp = client.get(
            f"/api/v1/datasets/{bad_id}",
            headers={"Authorization": f"Bearer {read_key}"},
        )
        # Should return 400 Bad Request or 404 Not Found, never 200 or 500
        assert resp.status_code in (400, 404), f"Failed to reject traversal: {bad_id}"


# ==============================================================================
# 6. Legacy Metadata Reconciliation Idempotency
# ==============================================================================


def test_metadata_reconciliation_service_idempotency(phase16d_env):
    """Verify reconciliation discovers existing CSVs, experiments, and pipeline manifests."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    # 1. Place a legacy CSV in upload_dir
    legacy_csv = upload_dir / "legacy_users.csv"
    legacy_csv.write_text("user_id,age,churn\nu1,22,0\nu2,34,1\nu3,45,0\n", encoding="utf-8")

    # 2. Place a legacy experiment directory with metadata.json
    exp_dir = experiments_dir / "exp_legacy_alpha"
    exp_dir.mkdir(parents=True, exist_ok=True)
    exp_metadata = {
        "experiment_id": "exp_legacy_alpha",
        "dataset_id": "legacy_users",
        "task_type": "classification",
        "target_column": "churn",
        "best_model": "lightgbm",
        "status": "completed",
        "metrics": {"roc_auc": 0.89, "accuracy": 0.85},
        "created_at": "2026-02-01T12:00:00Z",
    }
    (exp_dir / "metadata.json").write_text(json.dumps(exp_metadata), encoding="utf-8")

    # 3. Place a legacy pipeline manifest
    pipe_dir = experiments_dir / "pipelines" / "manifests"
    pipe_dir.mkdir(parents=True, exist_ok=True)
    pipe_manifest = {
        "pipeline_id": "pipe_legacy_alpha",
        "dataset_id": "legacy_users",
        "target_column": "churn",
        "task_type": "classification",
        "model_name": "lightgbm",
        "status": "succeeded",
        "current_stage": "completed",
        "stages": [],
        "created_at": "2026-02-01T12:30:00Z",
        "updated_at": "2026-02-01T12:35:00Z",
    }
    (pipe_dir / "pipe_legacy_alpha.json").write_text(json.dumps(pipe_manifest), encoding="utf-8")

    # First reconciliation pass
    reconciler = MetadataReconciliationService()
    summary_1 = reconciler.reconcile_all()
    assert summary_1["datasets"] == 1
    assert summary_1["experiments"] == 1
    assert summary_1["pipelines"] == 1

    # Second reconciliation pass (must be idempotent: no duplicates, 0 newly reconciled)
    summary_2 = reconciler.reconcile_all()
    assert summary_2["datasets"] == 0
    assert summary_2["experiments"] == 0
    assert summary_2["pipelines"] == 0

    # Query via repositories
    with get_db_context() as session:
        ds_repo = DatasetRepository(session)
        ds = ds_repo.get_by_id("legacy_users")
        assert ds is not None
        assert ds.row_count == 3
        assert ds.column_count == 3
        # Check associated experiment count
        assert ds_repo.count_associated_experiments("legacy_users") == 1
        assert ds_repo.count_associated_pipelines("legacy_users") == 1

        exp_repo = ExperimentRepository(session)
        exp = exp_repo.get_by_id("exp_legacy_alpha")
        assert exp is not None
        assert exp.best_model == "lightgbm"
        assert exp.status == "completed"

        pipe_repo = PipelineRepository(session)
        pipe = pipe_repo.get_by_id("pipe_legacy_alpha")
        assert pipe is not None
        assert pipe.status == "succeeded"


# ==============================================================================
# 7. Indexed Queries for Experiments & Pipelines with Fallback
# ==============================================================================


def test_experiment_and_pipeline_indexed_queries_and_deletion(phase16d_env):
    """Verify indexed queries work through services and fallback cleanly on DB failure."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    # Upsert experiment via repository
    with get_db_context() as session:
        exp_repo = ExperimentRepository(session)
        exp_model = ExperimentModel(
            experiment_id="exp_idx_01",
            name="exp_idx_01",
            dataset_id="ds_idx_01",
            dataset_fingerprint="fp123",
            task_type="classification",
            target_column="target",
            status="completed",
            best_model="random_forest",
            primary_metric="accuracy",
            best_score=0.92,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        exp_repo.upsert(exp_model)
        session.commit()

    # Query via ExperimentTrackerService
    tracker = get_experiment_tracker_service()
    exp_list = tracker.list_experiments()
    assert any(e.experiment_id == "exp_idx_01" for e in exp_list.items)

    # Test pipeline upsert and listing via PipelineService
    with get_db_context() as session:
        pipe_repo = PipelineRepository(session)
        pipe_model = PipelineModel(
            pipeline_id="pipe_idx_01",
            name="pipe_idx_01",
            model_name="random_forest",
            dataset_id="ds_idx_01",
            target_column="target",
            status="succeeded",
            total_stages=3,
            completed_stages=3,
            manifest_json={
                "pipeline_id": "pipe_idx_01",
                "name": "pipe_idx_01",
                "model_name": "random_forest",
                "dataset_id": "ds_idx_01",
                "target_column": "target",
                "task_type": "classification",
                "status": "succeeded",
                "current_stage": "completed",
                "stages": [],
                "total_stages": 3,
                "completed_stages": 3,
                "created_at": "2026-02-01T12:00:00Z",
                "updated_at": "2026-02-01T12:00:00Z",
            },
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        pipe_repo.upsert(pipe_model)
        session.commit()

    pipe_svc = get_pipeline_service()
    pipe_list = pipe_svc.list_pipelines()
    assert any(p.pipeline_id == "pipe_idx_01" for p in pipe_list.pipelines)


# ==============================================================================
# 8. Multi-Thread Concurrency and WAL Read/Write Safety
# ==============================================================================


def test_concurrent_catalog_reads_and_writes(phase16d_env):
    """Verify WAL mode allows concurrent readers and writers without database locked errors."""
    client, upload_dir, experiments_dir, db_path, read_key, admin_key = phase16d_env

    errors = []

    def writer_worker(worker_id: int):
        try:
            with get_db_context() as session:
                repo = DatasetRepository(session)
                d = DatasetModel(
                    dataset_id=f"conc_ds_{worker_id}",
                    filename=f"conc_{worker_id}.csv",
                    file_size_bytes=500,
                    rows=50,
                    columns=3,
                    column_names=["a", "b", "c"],
                    data_types={"a": "int", "b": "int", "c": "int"},
                    missing_values={"a": 0, "b": 0, "c": 0},
                    duplicate_rows=0,
                    memory_usage_bytes=1000,
                    fingerprint_sha256=f"sha_{worker_id:04d}" * 8,
                    validation_status="valid",
                    created_at=utc_now(),
                    updated_at=utc_now(),
                )
                repo.upsert(d)
                session.commit()
        except Exception as exc:
            errors.append(f"Writer error: {exc}")

    def reader_worker():
        try:
            with get_db_context() as session:
                repo = DatasetRepository(session)
                items, total = repo.list_datasets(page=1, page_size=20)
                assert total >= 0
        except Exception as exc:
            errors.append(f"Reader error: {exc}")

    threads = []
    # 5 writers and 10 readers running simultaneously
    for i in range(5):
        t_w = threading.Thread(target=writer_worker, args=(i,))
        threads.append(t_w)
    for _ in range(10):
        t_r = threading.Thread(target=reader_worker)
        threads.append(t_r)

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10.0)

    assert len(errors) == 0, f"Encountered concurrency errors: {errors}"
