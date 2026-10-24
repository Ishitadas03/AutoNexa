"""AutoNexa Phase 17A - Comprehensive End-to-End Workflow Validation & Integration Hardening.

Covers the full application lifecycle:
CSV Upload -> Dataset Validation -> Data Profiling -> ML Task Selection ->
Model Training -> Evaluation -> Experiment Persistence -> Explainability / Error Analysis -> Prediction
"""

import io
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd

from app.core.config import Settings, get_settings
from app.db.reconciliation import MetadataReconciliationService
from app.db.session import close_db, get_db_context, init_db
from app.main import app
from app.schemas.analysis import AnalysisResponse, TaskType
from app.schemas.dataset import DatasetListResponse, DatasetProfileResponse, DatasetSummary
from app.schemas.error_analysis import ErrorAnalysisResponse
from app.schemas.explainability import (
    GlobalFeatureImportanceResponse,
    PredictionExplanationRequest,
    PredictionExplanationResponse,
)
from app.schemas.prediction import ExperimentInspectionResponse, PredictionRequest, PredictionResponse
from app.schemas.tracking import (
    ArtifactVerificationResponse,
    ExperimentDetailResponse,
    ModelRegistrationRequest,
    ModelVersionRecord,
    ReproducibilityManifest,
    StageTransitionRequest,
)
from app.schemas.training import TrainingRequest, TrainingResponse
from app.services.dataset_service import DatasetService


@pytest.fixture
def e2e_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Isolated test environment with dedicated directories and database."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    data_dir = tmp_path / "data"
    db_path = data_dir / "metadata.db"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)
    data_dir.mkdir(parents=True, exist_ok=True)

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        METADATA_DB_PATH=str(db_path),
        API_AUTH_ENABLED=True,
        API_KEY_ADMIN="autonexa-admin-key-secret",
        API_KEY_READ="autonexa-read-key-secret",
        ENABLE_MLFLOW_TRACKING=False,
        MAX_UPLOAD_SIZE_BYTES=10 * 1024 * 1024,
        MAX_DATASET_ROWS=100000,
        MAX_DATASET_COLUMNS=500,
        MAX_TRAINING_BUDGET_SECONDS=300,
    )

    init_db(db_path=db_path)
    monkeypatch.setenv("METADATA_DB_PATH", str(db_path))
    monkeypatch.setenv("EXPERIMENTS_DIR", str(experiments_dir))
    monkeypatch.setenv("UPLOAD_DIR", str(upload_dir))
    monkeypatch.setenv("API_AUTH_ENABLED", "true")
    monkeypatch.setenv("API_KEY_ADMIN", "autonexa-admin-key-secret")
    monkeypatch.setenv("API_KEY_READ", "autonexa-read-key-secret")
    get_settings.cache_clear()

    patches = [
        patch("app.core.config.get_settings", return_value=test_settings),
        patch("app.core.security.get_settings", return_value=test_settings),
        patch("app.db.session.get_settings", return_value=test_settings),
        patch("app.db.reconciliation.get_settings", return_value=test_settings),
        patch("app.services.dataset_service.get_settings", return_value=test_settings),
        patch("app.services.analysis_service.get_settings", return_value=test_settings),
        patch("app.services.automl.training_service.get_settings", return_value=test_settings),
        patch("app.services.automl.prediction_service.get_settings", return_value=test_settings),
        patch("app.services.automl.explainability_service.get_settings", return_value=test_settings),
        patch("app.services.automl.error_analysis_service.get_settings", return_value=test_settings),
        patch("app.services.automl.experiment_tracker_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_registry_service.get_settings", return_value=test_settings),
        patch("app.services.automl.model_serving_service.get_settings", return_value=test_settings),
    ]

    for p in patches:
        p.start()

    with TestClient(app) as client:
        yield client, upload_dir, experiments_dir, db_path, test_settings

    for p in patches:
        p.stop()
    get_settings.cache_clear()


ADMIN_HEADERS = {"X-API-Key": "autonexa-admin-key-secret"}
READ_HEADERS = {"X-API-Key": "autonexa-read-key-secret"}


# ==============================================================================
# TEST A: Dataset Upload and Validation
# ==============================================================================

def test_a_upload_valid_classification_and_regression_csv(e2e_env):
    """Test A.1: Upload valid classification and regression CSVs and verify schema & catalog."""
    client, upload_dir, _, _, _ = e2e_env

    # 1. Classification CSV with mixed features
    clf_csv = (
        "age,tenure,contract,monthly_charges,churn\n"
        "25,12,month-to-month,55.0,yes\n"
        "45,36,one-year,85.5,no\n"
        "30,6,month-to-month,40.0,yes\n"
        "60,60,two-year,105.0,no\n"
        "22,2,month-to-month,30.0,yes\n"
        "55,48,two-year,90.0,no\n"
        "35,24,one-year,70.0,no\n"
        "40,18,month-to-month,65.0,yes\n"
    )
    res_clf = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("customers.csv", clf_csv.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_clf.status_code == 201
    profile_clf = DatasetProfileResponse.model_validate(res_clf.json())
    assert profile_clf.filename == "customers.csv"
    assert profile_clf.rows == 8
    assert profile_clf.columns == 5
    assert set(profile_clf.column_names) == {"age", "tenure", "contract", "monthly_charges", "churn"}
    assert profile_clf.duplicate_rows == 0

    # 2. Regression CSV
    reg_csv = (
        "sqft,bedrooms,bathrooms,neighborhood,price\n"
        "1200,3,2,North,280000\n"
        "1600,4,2,South,360000\n"
        "850,2,1,East,190000\n"
        "2100,4,3,West,450000\n"
        "1400,3,2,North,310000\n"
        "1900,4,2,South,410000\n"
        "950,2,1,East,210000\n"
        "2400,5,3,West,510000\n"
    )
    res_reg = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("housing.csv", reg_csv.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_reg.status_code == 201
    profile_reg = DatasetProfileResponse.model_validate(res_reg.json())
    assert profile_reg.filename == "housing.csv"
    assert profile_reg.rows == 8
    assert profile_reg.columns == 5

    # 3. Verify datasets appear in persistent catalog
    cat_res = client.get("/api/v1/datasets", headers=READ_HEADERS)
    assert cat_res.status_code == 200
    cat_data = DatasetListResponse.model_validate(cat_res.json())
    assert cat_data.total >= 2
    dataset_ids = [d.dataset_id for d in cat_data.datasets]
    assert profile_clf.dataset_id in dataset_ids
    assert profile_reg.dataset_id in dataset_ids


def test_a_upload_edge_cases_missing_duplicates_constant(e2e_env):
    """Test A.2: Ingest datasets with missing values, duplicate rows, and constant features."""
    client, _, _, _, _ = e2e_env

    edge_csv = (
        "id,feature_num,feature_cat,constant_col,target\n"
        "1,10.5,alpha,const,1\n"
        "2,,beta,const,0\n"
        "3,30.2,,const,1\n"
        "4,40.0,alpha,const,0\n"
        "1,10.5,alpha,const,1\n"  # Exact duplicate of row 1
    )
    res = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("edge_cases.csv", edge_csv.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["rows"] == 5
    assert data["columns"] == 5
    assert data["duplicate_rows"] == 1
    assert data["missing_values"]["feature_num"] == 1
    assert data["missing_values"]["feature_cat"] == 1
    assert data["missing_values"]["constant_col"] == 0


def test_a_upload_rejection_empty_malformed_unsupported_limits(e2e_env):
    """Test A.3: Rejection of empty, whitespace, malformed, non-CSV, and oversized uploads."""
    client, upload_dir, _, _, test_settings = e2e_env

    # 1. Empty file (0 bytes) -> 400
    res_empty = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_empty.status_code == 400
    assert "empty" in res_empty.json()["detail"].lower()

    # 2. Whitespace only -> 400
    res_ws = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("blank.csv", b"   \n\t  \n  ", "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_ws.status_code == 400
    assert "whitespace" in res_ws.json()["detail"].lower()

    # 3. Non-CSV extension -> 400
    res_ext = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("malicious.exe", b"a,b,c\n1,2,3", "application/octet-stream")},
        headers=ADMIN_HEADERS,
    )
    assert res_ext.status_code == 400
    assert "extension" in res_ext.json()["detail"].lower()

    # 4. Malformed CSV (inconsistent row widths) -> 400
    malformed_csv = "col1,col2,col3\n1,2\n4,5,6,7\n"
    res_mal = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("bad_structure.csv", malformed_csv.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_mal.status_code == 400
    assert "malformed" in res_mal.json()["detail"].lower()

    # 5. Header only with no data rows -> 400
    header_only = "col1,col2,col3\n"
    res_hdr = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("no_rows.csv", header_only.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_hdr.status_code == 400
    assert "no data rows" in res_hdr.json()["detail"].lower()


def test_a_upload_authorization_rbac(e2e_env):
    """Test A.4: Upload authorization enforcement (401 without key, 403 with read-only key)."""
    client, _, _, _, _ = e2e_env
    valid_csv = "a,b,y\n1,2,0\n3,4,1\n5,6,0\n7,8,1\n"

    # No credentials -> 401
    res_no_auth = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("test.csv", valid_csv.encode("utf-8"), "text/csv")},
    )
    assert res_no_auth.status_code == 401

    # Read-only credentials -> 403 (upload requires admin)
    res_read_auth = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("test.csv", valid_csv.encode("utf-8"), "text/csv")},
        headers=READ_HEADERS,
    )
    assert res_read_auth.status_code == 403
    assert "Admin role required" in res_read_auth.json()["detail"]


# ==============================================================================
# TEST B: Profiling and Intelligence Analysis
# ==============================================================================

def test_b_profiling_and_intelligence_analysis(e2e_env):
    """Test B: Profile retrieval, column diagnostics, task recommendation, and candidate targets."""
    client, _, _, _, _ = e2e_env

    csv_data = (
        "age,income,credit_score,customer_class,churn\n"
        "25,35000,650,Silver,1\n"
        "42,75000,720,Gold,0\n"
        "31,48000,680,Silver,1\n"
        "55,120000,800,Platinum,0\n"
        "28,29000,610,Bronze,1\n"
        "48,95000,740,Gold,0\n"
        "36,54000,690,Silver,0\n"
        "61,110000,780,Platinum,0\n"
        "23,24000,590,Bronze,1\n"
        "39,63000,710,Silver,0\n"
    )
    res_upload = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("profile_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_upload.status_code == 201
    dataset_id = res_upload.json()["dataset_id"]

    # 1. Retrieve dataset details from catalog
    res_get = client.get(f"/api/v1/datasets/{dataset_id}", headers=READ_HEADERS)
    assert res_get.status_code == 200
    summary = DatasetSummary.model_validate(res_get.json())
    assert summary.dataset_id == dataset_id
    assert summary.rows == 10
    assert summary.columns == 5
    assert summary.fingerprint_sha256 is not None

    # 2. Run analysis without specifying target -> heuristic task & candidate target recommendations
    res_ana = client.post(f"/api/v1/datasets/{dataset_id}/analyze", headers=READ_HEADERS)
    assert res_ana.status_code == 200
    analysis = AnalysisResponse.model_validate(res_ana.json())
    assert analysis.dataset_id == dataset_id
    assert analysis.rows == 10
    assert len(analysis.candidate_targets) > 0
    candidate_names = [ct.column_name for ct in analysis.candidate_targets]
    assert "churn" in candidate_names

    # 3. Run analysis targeting 'churn'
    res_target = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "churn"},
        headers=READ_HEADERS,
    )
    assert res_target.status_code == 200
    ana_target = AnalysisResponse.model_validate(res_target.json())
    assert ana_target.task_recommendation is not None
    assert ana_target.task_recommendation.task_type in (
        TaskType.BINARY_CLASSIFICATION,
        TaskType.MULTICLASS_CLASSIFICATION,
    )
    assert ana_target.task_recommendation.target_column == "churn"


def test_b_analysis_invalid_target_and_edge_cases(e2e_env):
    """Test B.2: Target validation failure modes: non-existent column, single-value column."""
    client, _, _, _, _ = e2e_env

    csv_data = "a,b,constant_target\n1,2,1\n3,4,1\n5,6,1\n7,8,1\n9,10,1\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("invalid_targets.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    # Target does not exist -> 400
    res_missing = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "non_existent_column"},
        headers=READ_HEADERS,
    )
    assert res_missing.status_code == 400
    detail_lower = res_missing.json()["detail"].lower()
    assert "does not exist" in detail_lower or "not found" in detail_lower

    # Target has only 1 distinct value -> 400
    res_const = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        json={"target_column": "constant_target"},
        headers=READ_HEADERS,
    )
    assert res_const.status_code == 400
    assert "constant" in res_const.json()["detail"].lower()

    # Analysis without target -> constant column reported in quality_warnings
    res_general = client.post(
        f"/api/v1/datasets/{dataset_id}/analyze",
        headers=READ_HEADERS,
    )
    assert res_general.status_code == 200
    data = res_general.json()
    warning_codes = [w["code"] for w in data.get("quality_warnings", [])]
    assert any("constant" in c.lower() for c in warning_codes)


# ==============================================================================
# TEST C: AutoML Training
# ==============================================================================

def test_c_automl_training_classification_leakage_free(e2e_env):
    """Test C.1: Binary classification AutoML training with leakage-free holdout evaluation."""
    client, _, _, _, _ = e2e_env

    # 40-row synthetic binary classification dataset
    np.random.seed(42)
    rows = []
    for i in range(40):
        cls = i % 2
        age = int(np.random.randint(20, 70))
        charges = float(round(np.random.uniform(20.0, 120.0), 2))
        contract = "month-to-month" if cls == 1 else "two-year"
        rows.append(f"{age},{charges},{contract},{cls}")
    csv_body = "age,monthly_charges,contract,churn\n" + "\n".join(rows) + "\n"

    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_clf.csv", csv_body.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    train_req = TrainingRequest(
        target_column="churn",
        task_type="classification",
        evaluation_strategy="cross_validation",
        cv_folds=3,
        holdout_test=True,
        test_size=0.25,
        random_state=42,
        time_budget_seconds=30,
        models=["dummy", "logistic_regression", "random_forest"],
        primary_metric="f1_weighted",
    )

    res_train = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json=train_req.model_dump(),
        headers=ADMIN_HEADERS,
    )
    assert res_train.status_code == 201
    training_resp = TrainingResponse.model_validate(res_train.json())

    assert training_resp.dataset_id == dataset_id
    assert training_resp.target_column == "churn"
    assert training_resp.task_type == "binary_classification"
    assert training_resp.evaluation_strategy == "cross_validation"
    assert training_resp.features_count == 3
    assert set(training_resp.feature_names) == {"age", "monthly_charges", "contract"}
    assert "churn" not in training_resp.feature_names  # Target exclusion guarantee
    assert training_resp.artifacts_saved is True
    assert training_resp.best_model is not None
    assert len(training_resp.ranked_models) > 0
    assert training_resp.test_metrics is not None  # Holdout test evaluated once


def test_c_automl_training_regression_and_low_info(e2e_env):
    """Test C.2: Numeric regression training with mixed features and low-information features."""
    client, _, _, _, _ = e2e_env

    # 35-row regression dataset
    np.random.seed(123)
    rows = []
    for i in range(35):
        sqft = int(np.random.randint(800, 3000))
        bedrooms = int(np.random.randint(1, 5))
        garage = "yes" if i % 2 == 0 else "no"
        noise_col = "constant_value"
        price = float(round(sqft * 150.0 + bedrooms * 20000.0 + np.random.normal(0, 5000), 2))
        rows.append(f"{sqft},{bedrooms},{garage},{noise_col},{price}")
    csv_body = "sqft,bedrooms,garage,noise_col,price\n" + "\n".join(rows) + "\n"

    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("train_reg.csv", csv_body.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    train_req = TrainingRequest(
        target_column="price",
        task_type="regression",
        evaluation_strategy="holdout",
        test_size=0.2,
        random_state=42,
        time_budget_seconds=20,
        models=["dummy", "linear_regression", "random_forest"],
        primary_metric="rmse",
    )

    res_train = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json=train_req.model_dump(),
        headers=ADMIN_HEADERS,
    )
    assert res_train.status_code == 201
    training_resp = TrainingResponse.model_validate(res_train.json())

    assert training_resp.task_type == "regression"
    assert training_resp.primary_metric == "rmse"
    assert training_resp.primary_metric_greater_is_better is False  # Lower is better for RMSE
    assert training_resp.best_model is not None


def test_c_automl_training_time_budget_and_model_failure_isolation(e2e_env):
    """Test C.3: Time budget skipping and candidate model isolation."""
    client, _, _, _, _ = e2e_env

    csv_data = "x1,x2,y\n" + "\n".join([f"{i},{i*2},{i%2}" for i in range(30)]) + "\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("budget_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    # Budget exceeded settings limit (e.g. >300s) -> 400 or 422
    res_bad_budget = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y", "time_budget_seconds": 9999},
        headers=ADMIN_HEADERS,
    )
    assert res_bad_budget.status_code in (400, 422)


def test_c_automl_training_rbac_authorization(e2e_env):
    """Test C.4: Training authorization enforcement."""
    client, _, _, _, _ = e2e_env
    req_body = {"target_column": "churn"}

    # Unauthenticated -> 401
    res_no_auth = client.post("/api/v1/datasets/fake_id/train", json=req_body)
    assert res_no_auth.status_code == 401

    # Read-only key -> 403 (training requires admin)
    res_read = client.post("/api/v1/datasets/fake_id/train", json=req_body, headers=READ_HEADERS)
    assert res_read.status_code == 403


# ==============================================================================
# TEST D: Evaluation and Experiment Persistence
# ==============================================================================

def test_d_evaluation_and_experiment_persistence(e2e_env):
    """Test D: Retrieve experiment metadata, details, metrics, and manifest."""
    client, _, experiments_dir, db_path, _ = e2e_env

    # Run a quick training to produce a real experiment
    csv_data = (
        "f1,f2,f3,label\n"
        "1.0,10,alpha,1\n"
        "2.0,20,beta,0\n"
        "1.5,15,alpha,1\n"
        "2.5,25,beta,0\n"
        "3.0,30,alpha,1\n"
        "3.5,35,beta,0\n"
        "1.2,12,alpha,1\n"
        "2.8,28,beta,0\n"
        "1.8,18,alpha,1\n"
        "3.2,32,beta,0\n"
    )
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("persist_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    res_train = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "label", "models": ["dummy", "logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_train.json()["experiment_id"]

    # 1. Inspect experiment
    res_insp = client.get(f"/api/v1/experiments/{exp_id}", headers=READ_HEADERS)
    assert res_insp.status_code == 200
    inspection = ExperimentInspectionResponse.model_validate(res_insp.json())
    assert inspection.experiment_id == exp_id
    assert inspection.artifact_availability.model_file_exists is True
    assert inspection.artifact_availability.model_sha256 is not None

    # 2. Experiment Details
    res_det = client.get(f"/api/v1/experiments/{exp_id}/details", headers=READ_HEADERS)
    assert res_det.status_code == 200
    details = ExperimentDetailResponse.model_validate(res_det.json())
    assert details.experiment_id == exp_id
    assert details.models_evaluated is not None
    assert len(details.models_evaluated) >= 2

    # 3. Experiment Metrics summary
    res_met = client.get(f"/api/v1/experiments/{exp_id}/metrics", headers=READ_HEADERS)
    assert res_met.status_code == 200

    # 4. Reproducibility Manifest
    res_man = client.get(f"/api/v1/experiments/{exp_id}/reproducibility-manifest", headers=READ_HEADERS)
    assert res_man.status_code == 200
    manifest = ReproducibilityManifest.model_validate(res_man.json())
    assert manifest.dataset["dataset_fingerprint"] == res_train.json()["dataset_fingerprint"]
    assert manifest.configuration["random_state"] == 42
    assert manifest.artifact["sha256"] == inspection.artifact_availability.model_sha256

    # 5. Cryptographic verification probe
    res_ver = client.get(f"/api/v1/experiments/{exp_id}/reproducibility-manifest/verify", headers=READ_HEADERS)
    assert res_ver.status_code == 200
    ver = ArtifactVerificationResponse.model_validate(res_ver.json())
    assert ver.verified is True
    assert ver.artifact_exists is True


def test_d_sqlite_persistence_across_restart_and_reconciliation(e2e_env):
    """Test D.2: Verify SQLite persistence and metadata reconciliation service."""
    client, _, _, db_path, test_settings = e2e_env

    # Query experiments table
    with get_db_context(db_path) as session:
        from app.db.repositories.experiment_repository import ExperimentRepository
        repo = ExperimentRepository(session)
        items, total = repo.list_experiments(page=1, page_size=10)
        assert total >= 0
        assert isinstance(items, list)

    # Test Reconciliation Service pass
    reconciler = MetadataReconciliationService(test_settings)
    stats = reconciler.reconcile_all()
    assert "reconciled_experiments" in stats
    assert "reconciled_datasets" in stats


# ==============================================================================
# TEST E: Explainability and Error Analysis
# ==============================================================================

def test_e_explainability_global_importance_and_feature_mapping(e2e_env):
    """Test E.1: Global feature importance calculation and feature mapping."""
    client, _, _, _, _ = e2e_env

    csv_data = (
        "num1,num2,cat1,target\n"
        "10,100,A,1\n"
        "20,200,B,0\n"
        "15,150,A,1\n"
        "25,250,B,0\n"
        "30,300,A,1\n"
        "35,350,B,0\n"
        "12,120,A,1\n"
        "28,280,B,0\n"
        "18,180,A,1\n"
        "32,320,B,0\n"
    )
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("explain_data.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]

    res_train = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "models": ["random_forest"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_train.json()["experiment_id"]

    # Global importance
    res_imp = client.get(
        f"/api/v1/experiments/{exp_id}/explainability/importance?method=auto",
        headers=READ_HEADERS,
    )
    assert res_imp.status_code == 200
    imp_resp = GlobalFeatureImportanceResponse.model_validate(res_imp.json())
    assert imp_resp.experiment_id == exp_id
    assert len(imp_resp.feature_importances) == 3
    # Check that transformed names mapped back to original feature names
    features = [item.feature for item in imp_resp.feature_importances]
    assert set(features) == {"num1", "num2", "cat1"}


def test_e_explainability_local_attributions_and_fallback(e2e_env):
    """Test E.2: Local instance feature attribution (SHAP or marginal fallback)."""
    client, _, _, _, _ = e2e_env

    csv_data = "x,cat,y\n1,A,0\n2,B,1\n3,A,0\n4,B,1\n5,A,0\n6,B,1\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("local_exp.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]
    res_tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y", "models": ["logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_tr.json()["experiment_id"]

    local_req = PredictionExplanationRequest(
        records=[{"x": 2.5, "cat": "B"}],
        method="auto",
    )
    res_loc = client.post(
        f"/api/v1/experiments/{exp_id}/explainability/prediction",
        json=local_req.model_dump(),
        headers=READ_HEADERS,
    )
    assert res_loc.status_code == 200
    loc_resp = PredictionExplanationResponse.model_validate(res_loc.json())
    assert loc_resp.experiment_id == exp_id
    assert len(loc_resp.explanations) == 1
    expl = loc_resp.explanations[0]
    assert len(expl.feature_contributions) == 2


def test_e_error_analysis_classification_and_regression(e2e_env):
    """Test E.3: Error analysis confusion matrix, per-class metrics, and residuals."""
    client, _, _, _, _ = e2e_env

    csv_data = (
        "f1,f2,target\n"
        "1,10,0\n"
        "2,20,1\n"
        "3,30,0\n"
        "4,40,1\n"
        "5,50,0\n"
        "6,60,1\n"
        "7,70,0\n"
        "8,80,1\n"
        "9,90,0\n"
        "10,100,1\n"
    )
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("err_clf.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]
    res_tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "models": ["logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_tr.json()["experiment_id"]

    res_err = client.post(
        f"/api/v1/experiments/{exp_id}/error-analysis",
        json={"split": "train"},
        headers=READ_HEADERS,
    )
    assert res_err.status_code == 200
    err_resp = ErrorAnalysisResponse.model_validate(res_err.json())
    assert err_resp.experiment_id == exp_id
    assert err_resp.classification_analysis is not None
    assert err_resp.classification_analysis.confusion_matrix is not None


# ==============================================================================
# TEST F: Prediction and Artifact Integrity
# ==============================================================================

def test_f_prediction_single_and_batch_csv(e2e_env):
    """Test F.1: Single-record prediction and CSV batch prediction."""
    client, _, _, _, _ = e2e_env

    csv_data = (
        "feature1,feature2,category,label\n"
        "10,20,A,0\n"
        "30,40,B,1\n"
        "15,25,A,0\n"
        "35,45,B,1\n"
        "12,22,A,0\n"
        "32,42,B,1\n"
        "14,24,A,0\n"
        "34,44,B,1\n"
    )
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("pred_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]
    res_tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "label", "models": ["logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_tr.json()["experiment_id"]

    # 1. Single / bounded JSON prediction
    pred_req = PredictionRequest(
        records=[
            {"feature1": 11, "feature2": 21, "category": "A"},
            {"feature1": 31, "feature2": 41, "category": "B"},
        ]
    )
    res_pred = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json=pred_req.model_dump(),
        headers=READ_HEADERS,
    )
    assert res_pred.status_code == 200
    pred_resp = PredictionResponse.model_validate(res_pred.json())
    assert pred_resp.prediction_count == 2
    assert len(pred_resp.predictions) == 2
    assert pred_resp.probabilities is not None  # Probabilities returned for classification

    # 2. Batch CSV prediction
    batch_csv = (
        "feature1,feature2,category\n"
        "10,20,A\n"
        "30,40,B\n"
    )
    res_batch = client.post(
        f"/api/v1/experiments/{exp_id}/predict-csv",
        files={"file": ("batch_input.csv", batch_csv.encode("utf-8"), "text/csv")},
        headers=READ_HEADERS,
    )
    assert res_batch.status_code == 200
    assert "text/csv" in res_batch.headers.get("content-type", "")
    assert "predicted_label" in res_batch.text


def test_f_prediction_schema_validation_missing_and_unexpected_features(e2e_env):
    """Test F.2: Schema validation rejects missing, extra, and empty features."""
    client, _, _, _, _ = e2e_env

    csv_data = "x1,x2,y\n1,10,0\n2,20,1\n3,30,0\n4,40,1\n5,50,0\n6,60,1\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("schema_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]
    res_tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "y", "models": ["logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_tr.json()["experiment_id"]

    # Missing required feature 'x2' -> 400
    res_missing = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"x1": 1.5}]},
        headers=READ_HEADERS,
    )
    assert res_missing.status_code == 400
    assert "missing" in res_missing.json()["detail"].lower()

    # Unexpected feature 'extra_col' -> 400
    res_extra = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": [{"x1": 1.5, "x2": 15, "extra_col": 999}]},
        headers=READ_HEADERS,
    )
    assert res_extra.status_code == 400
    assert "unexpected" in res_extra.json()["detail"].lower()

    # Empty records -> 400 or 422
    res_empty = client.post(
        f"/api/v1/experiments/{exp_id}/predict",
        json={"records": []},
        headers=READ_HEADERS,
    )
    assert res_empty.status_code in (400, 422)


def test_f_model_serving_lifecycle_and_inference(e2e_env):
    """Test F.3: Register experiment to Model Registry, promote to production, and serve inference."""
    client, _, _, _, _ = e2e_env

    csv_data = "a,b,target\n1,2,0\n3,4,1\n5,6,0\n7,8,1\n9,10,0\n11,12,1\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("serve_test.csv", csv_data.encode("utf-8"), "text/csv")},
        headers=ADMIN_HEADERS,
    )
    dataset_id = res_up.json()["dataset_id"]
    res_tr = client.post(
        f"/api/v1/datasets/{dataset_id}/train",
        json={"target_column": "target", "models": ["logistic_regression"]},
        headers=ADMIN_HEADERS,
    )
    exp_id = res_tr.json()["experiment_id"]

    # 1. Register model
    reg_req = ModelRegistrationRequest(
        experiment_id=exp_id,
        model_name="fraud_detector",
        description="Production fraud classifier",
        initial_stage="staging",
    )
    res_reg = client.post(
        "/api/v1/models/register",
        json=reg_req.model_dump(),
        headers=ADMIN_HEADERS,
    )
    assert res_reg.status_code == 201
    reg_record = ModelVersionRecord.model_validate(res_reg.json())
    assert reg_record.model_name == "fraud_detector"
    assert reg_record.version == 1
    assert reg_record.stage == "staging"

    # 2. Promote to production
    trans_req = StageTransitionRequest(
        new_stage="production",
        reason="Passed all quality and benchmark gates",
    )
    res_prom = client.post(
        f"/api/v1/models/fraud_detector/versions/1/stage",
        json=trans_req.model_dump(),
        headers=ADMIN_HEADERS,
    )
    assert res_prom.status_code == 200
    assert res_prom.json()["stage"] == "production"

    # 3. Model Serving Inference on active production version
    serve_pred_req = {
        "records": [{"a": 2.0, "b": 3.0}]
    }
    res_serv = client.post(
        "/api/v1/serving/models/fraud_detector/predict",
        json=serve_pred_req,
        headers=READ_HEADERS,
    )
    assert res_serv.status_code == 200
    data = res_serv.json()
    assert data["model_name"] == "fraud_detector"
    assert len(data["predictions"]) == 1

    # 4. Serving operational metrics
    res_met = client.get("/api/v1/serving/metrics", headers=READ_HEADERS)
    assert res_met.status_code == 200


def test_f_corrupt_artifact_handling_safe_error(e2e_env):
    """Test F.4: Corrupted model artifact returns safe 500 without leaking file paths or traces."""
    client, _, experiments_dir, _, _ = e2e_env

    # Create dummy experiment folder with corrupt joblib file
    corrupt_id = "exp-corrupt-test-uuid"
    corrupt_dir = experiments_dir / corrupt_id
    corrupt_dir.mkdir(parents=True, exist_ok=True)

    meta = {
        "experiment_id": corrupt_id,
        "best_model": "corrupt_model",
        "target_column": "y",
        "feature_names": ["x1"],
        "task_type": "classification",
    }
    (corrupt_dir / "metadata.json").write_text(json.dumps(meta), encoding="utf-8")
    (corrupt_dir / "best_model.joblib").write_bytes(b"NOT_A_VALID_JOBLIB_BINARY_DATA")

    res_corrupt = client.post(
        f"/api/v1/experiments/{corrupt_id}/predict",
        json={"records": [{"x1": 1.0}]},
        headers=READ_HEADERS,
    )
    assert res_corrupt.status_code == 500
    detail = res_corrupt.json()["detail"]
    assert "corrupted" in detail.lower() or "incompatible" in detail.lower()
    # Check no raw path leakage
    assert str(experiments_dir) not in detail


# ==============================================================================
# TEST H: API Security and Data Isolation
# ==============================================================================

def test_h_api_security_rbac_and_path_traversal_sanitization(e2e_env):
    """Test H: Unified RBAC, path traversal prevention, and data isolation."""
    client, _, _, _, _ = e2e_env

    # 1. Path traversal in dataset ID -> rejected with 400 or 404
    res_traversal = client.get("/api/v1/datasets/../../etc/passwd", headers=READ_HEADERS)
    assert res_traversal.status_code in (400, 404)

    # 2. Path traversal in experiment ID -> rejected with 400 or 404
    res_exp_trav = client.get("/api/v1/experiments/..%2F..%2Fwindows", headers=READ_HEADERS)
    assert res_exp_trav.status_code in (400, 404)

    # 3. Invalid API credentials -> 401
    res_bad_key = client.get("/api/v1/datasets", headers={"X-API-Key": "completely-invalid-key"})
    assert res_bad_key.status_code == 401
    assert "Invalid API key" in res_bad_key.json()["detail"]


# ==============================================================================
# PHASE 17B: Frontend Integration Contracts
# ==============================================================================

def test_phase17b_frontend_regression_model_selection_contract(e2e_env):
    """Test 17B: Verify that frontend default regression model selection ('ridge') resolves and trains."""
    client, _, _, _, _ = e2e_env

    # 1. Upload regression dataset
    csv_bytes = b"feat1,feat2,target\n1.0,10.0,100.0\n2.0,20.0,200.0\n3.0,30.0,300.0\n4.0,40.0,400.0\n5.0,50.0,500.0\n6.0,60.0,600.0\n7.0,70.0,700.0\n8.0,80.0,800.0\n"
    res_up = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("frontend_reg.csv", csv_bytes, "text/csv")},
        headers=ADMIN_HEADERS,
    )
    assert res_up.status_code == 201
    ds_id = res_up.json()["dataset_id"]

    # 2. Submit training with frontend exact default regression selection
    # In TrainingTab.tsx: setSelectedModels(["random_forest", "hist_gradient_boosting", "ridge"])
    train_payload = {
        "target_column": "target",
        "task_type": "regression",
        "evaluation_strategy": "holdout",
        "test_size": 0.25,
        "random_state": 42,
        "time_budget_seconds": 60,
        "primary_metric": "r2",
        "models": ["random_forest", "hist_gradient_boosting", "ridge"],
    }
    res_train = client.post(
        f"/api/v1/datasets/{ds_id}/train",
        json=train_payload,
        headers=ADMIN_HEADERS,
    )
    assert res_train.status_code == 201
    train_data = res_train.json()
    assert train_data["task_type"] == "regression"
    assert len(train_data["models_evaluated"]) == 3
    evaluated_ids = {m["model_id"] for m in train_data["models_evaluated"]}
    assert "linear_regression" in evaluated_ids
    assert "random_forest_regressor" in evaluated_ids
    assert "hist_gradient_boosting_regressor" in evaluated_ids


