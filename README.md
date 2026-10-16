# AutoNexa (AutoML Research Lab)

An extensible, research-oriented Automated Machine Learning (AutoML) platform designed for tabular datasets. AutoNexa accelerates the workflow from raw tabular data ingestion to model selection, hyperparameter optimization, explainability, experiment tracking, and quantum machine learning benchmarking.

---

## 1. Project Overview

AutoNexa provides an automated, reproducible pipeline for tabular machine learning workflows:
- **Intelligent Ingestion & EDA**: Ingests tabular formats (CSV), infers schemas, profiles data distributions, and catches data quality anomalies and target leakages.
- **Dataset Intelligence & Task Detection**: Automatically audits feature roles, evaluates data quality risks (missingness, constants, class imbalance, leakage), and recommends suitable ML tasks (classification vs. regression) with heuristic rationales.
- **Resource-Aware AutoML**: Dynamically evaluates candidate models (linear baselines, tree-based models, and ensembles) under strict time and resource budgets.
- **Explainable AI (XAI)**: Native SHAP integration to provide global feature importance and individual prediction attributions.
- **Reproducible Experimentation**: Tracks trials, configurations, and artifacts via MLflow.
- **Quantum Machine Learning (QML) Benchmarking**: Benchmarks variational quantum circuits (PennyLane) against classical ML baselines.

---

## 2. Current Development Status

- **Status**: **Phase 6 — Reliable Model Evaluation & Experiment Tracking (Complete)**
- **Scope Implemented**:
  - Modular FastAPI application entry point initialized ([`backend/app/main.py`](file:///c:/Users/ishit/AutoNexa/backend/app/main.py)).
  - Centralized type-safe settings management powered by `pydantic-settings` ([`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py)).
  - System health-check endpoint ([`GET /api/v1/health`](http://127.0.0.1:8000/api/v1/health)) with strict Pydantic response contract ([`backend/app/schemas/health.py`](file:///c:/Users/ishit/AutoNexa/backend/app/schemas/health.py)).
  - Secure chunked CSV ingestion endpoint ([`POST /api/v1/datasets/upload`](http://127.0.0.1:8000/docs#/Datasets/upload_dataset_api_v1_datasets_upload_post)) with path-traversal protection and dynamic streaming size ceiling enforcement ([`backend/app/services/dataset_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/dataset_service.py)).
  - Comprehensive Dataset Intelligence & Task Detection endpoint ([`POST /api/v1/datasets/{dataset_id}/analyze`](http://127.0.0.1:8000/docs#/Datasets/analyze_dataset_api_v1_datasets__dataset_id__analyze_post)) providing feature role classification, quality warnings, candidate target detection, and heuristic ML task recommendations with override support ([`backend/app/services/analysis_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/analysis_service.py)).
  - Reliable AutoML Model Selection & Training endpoint ([`POST /api/v1/datasets/{dataset_id}/train`](http://127.0.0.1:8000/docs#/Datasets/train_models_api_v1_datasets__dataset_id__train_post)) with configurable evaluation strategies (`holdout` and `cross_validation`), sample standard deviation calculation (`ddof=1`), untouched final holdout evaluation, SHA-256 dataset fingerprinting, and hierarchical MLflow tracking ([`backend/app/services/automl/`](file:///c:/Users/ishit/AutoNexa/backend/app/services/automl/)).
  - Interactive Swagger UI documentation at [`/docs`](http://127.0.0.1:8000/docs) and OpenAPI specification at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).
  - 68 automated tests across [`backend/tests/test_health.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_health.py), [`backend/tests/test_datasets.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_datasets.py), [`backend/tests/test_analysis.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_analysis.py), [`backend/tests/test_training.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_training.py), and [`backend/tests/test_tracking.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_tracking.py) covering all functional requirements, security guards, leakage-free pipelines, and edge cases.
- **Upcoming Phases**:
  - Phase 7: Next.js Frontend UI Dashboard & Visualizations.
  - Phase 8: PennyLane Classical vs. Quantum Benchmarking Module.

---

## 3. Planned Features

- **Automatic Task Detection**: Automatically infers whether a problem is Binary Classification, Multi-class Classification, or Regression.
- **Data Quality & Leakage Audit**: Identifies identifier columns, high-cardinality leakage, duplicate rows, missingness patterns, and class imbalances.
- **Resource-Aware AutoML Engine**: Trains and compares diverse candidate models with leakage-free preprocessing, atomic metadata/model persistence, and bounded runtime budgets.
- **Reliable Evaluation & Statistical Reporting**: Configurable holdout and cross-validation strategies, StratifiedKFold with rare-class fallbacks, sample standard deviations, and untouched final test sets.
- **Experiment Tracking**: Automatic parameter logging, per-fold metrics, nested model runs, and artifact tracking via MLflow.
- **Explainability (Upcoming)**: Integrated SHAP summary plots, waterfall plots, and feature attribution reports.
- **Classical vs. Quantum ML Benchmark (Upcoming)**: Variational quantum circuits using PennyLane for research-grade comparative performance studies.

---

## 4. Prerequisites

Ensure the following tools are installed on your host system:

| Tool | Recommended Version | Purpose |
| :--- | :--- | :--- |
| **Python** | 3.11.x (Required) | Backend runtime & ML libraries |
| **Git** | 2.x+ | Version control |
| **Node.js** | 18.x or 20.x+ | Future Next.js frontend |

---

## 5. Project Directory Structure

```text
AutoNexa/
├── backend/
│   ├── app/
│   │   ├── __init__.py            # Main application package
│   │   ├── main.py                # FastAPI application entry point & factory
│   │   ├── api/
│   │   │   ├── __init__.py        # Aggregated API router
│   │   │   └── routes/
│   │   │       ├── __init__.py    # Route package initialization
│   │   │       ├── health.py      # Health-check route definition
│   │   │       └── datasets.py    # Dataset upload, profiling, analysis & training routes
│   │   ├── core/
│   │   │   ├── __init__.py        # Core package exports
│   │   │   └── config.py          # Centralized Pydantic settings & resource limits
│   │   ├── schemas/
│   │   │   ├── __init__.py        # Schema exports
│   │   │   ├── health.py          # Health response Pydantic model
│   │   │   ├── dataset.py         # Dataset profile Pydantic model
│   │   │   ├── analysis.py        # Dataset intelligence & task detection schemas
│   │   │   └── training.py        # AutoML training request & response schemas
│   │   └── services/
│   │       ├── __init__.py        # Service layer package exports
│   │       ├── dataset_service.py # Ingestion, validation & profiling service
│   │       ├── analysis_service.py # Dataset intelligence, diagnostics & task detection
│   │       └── automl/            # Modular AutoML training & evaluation engine
│   │           ├── __init__.py    # AutoML package exports
│   │           ├── preprocessor.py# Memory-aware leakage-free ColumnTransformer builder
│   │           ├── registry.py    # Extensible scikit-learn model candidate registry
│   │           ├── evaluator.py   # Statistical aggregation, fold metrics, & ranking
│   │           ├── tracker.py     # Modular MLflow experiment tracking & fingerprinting
│   │           └── training_service.py # Training orchestrator & atomic persistence
│   ├── tests/
│   │   ├── __init__.py            # Test suite package
│   │   ├── test_health.py         # Health endpoint automated tests
│   │   ├── test_datasets.py       # Dataset upload and validation tests
│   │   ├── test_analysis.py       # Dataset intelligence & task detection tests
│   │   ├── test_training.py       # AutoML holdout training engine tests
│   │   └── test_tracking.py       # CV evaluation, statistical aggregation & MLflow tests
│   ├── uploads/
│   │   └── .gitkeep               # Local dataset upload directory (ignored in git)
│   ├── experiments/
│   │   └── .gitkeep               # Experiment metadata & model binaries (ignored in git)
│   ├── requirements.txt           # Pinned backend dependencies
│   ├── .env.example               # Safe environment configuration template
│   └── .venv/                     # Python 3.11 virtual environment (ignored in git)
├── frontend/
│   └── .gitkeep                   # Placeholder for Next.js frontend application
├── docs/
│   └── architecture.md            # Planned high-level system architecture
├── experiments/
│   └── .gitkeep                   # Root experiment tracking directory
├── .gitignore                     # Comprehensive git ignore rules
└── README.md                      # Project documentation
```

---

## 6. Python Environment Setup & Activation

### Step 6.1: Navigate to Backend Directory

```bash
cd backend
```

### Step 6.2: Create the Virtual Environment (If not already created)

Using Python 3.11:

- **Windows (Python Launcher)**:
  ```powershell
  py -3.11 -m venv .venv
  ```
- **macOS / Linux**:
  ```bash
  python3.11 -m venv .venv
  ```

### Step 6.3: Activate the Virtual Environment

- **Windows PowerShell**:
  ```powershell
  .\.venv\Scripts\Activate.ps1
  ```
  *(Note: If script execution is restricted, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first).*

- **Windows Command Prompt (cmd.exe)**:
  ```cmd
  .\.venv\Scripts\activate.bat
  ```

- **Unix-like Shells (Bash / Zsh on macOS / Linux)**:
  ```bash
  source .venv/bin/activate
  ```

### Step 6.4: Install Dependencies

With the virtual environment activated:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

---

## 7. Starting the Development Server

To launch the AutoNexa backend development server with auto-reload:

```bash
# Ensure you are inside the backend directory with .venv active
python -m uvicorn app.main:app --reload
```

Once running, the server is accessible at:
- **Health Check Endpoint**: [http://127.0.0.1:8000/api/v1/health](http://127.0.0.1:8000/api/v1/health)
- **Dataset Upload Endpoint**: [http://127.0.0.1:8000/api/v1/datasets/upload](http://127.0.0.1:8000/api/v1/datasets/upload)
- **Dataset Analysis Endpoint**: [http://127.0.0.1:8000/api/v1/datasets/{dataset_id}/analyze](http://127.0.0.1:8000/api/v1/datasets/{dataset_id}/analyze)
- **AutoML Training Endpoint**: [http://127.0.0.1:8000/api/v1/datasets/{dataset_id}/train](http://127.0.0.1:8000/api/v1/datasets/{dataset_id}/train)
- **Interactive Swagger UI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI JSON Specification**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 8. API Specifications & Endpoints

### 8.1 Health-Check: `GET /api/v1/health`

Validates that the AutoNexa application server is online and operational. Decoupled from external databases and ML training.

```bash
curl -X GET http://127.0.0.1:8000/api/v1/health
```

---

### 8.2 Dataset Upload & Profiling: `POST /api/v1/datasets/upload`

Uploads, validates, stores, and profiles a tabular CSV dataset.

#### Minimal `curl` Example:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/upload \
  -H "Accept: application/json" \
  -F "file=@california_housing.csv;type=text/csv"
```

---

### 8.3 Dataset Intelligence & ML Task Detection: `POST /api/v1/datasets/{dataset_id}/analyze`

Performs deep structural diagnostics, data quality auditing, candidate target detection, and ML task inference on an uploaded dataset.

#### Request Payload Model (Optional):
```json
{
  "target_column": "purchased",
  "task_override": "classification"
}
```

#### Sample `curl` Command:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a/analyze \
  -H "Content-Type: application/json" \
  -d '{"target_column": "churn"}'
```

---

### 8.4 AutoML Model Selection & Training: `POST /api/v1/datasets/{dataset_id}/train`

Executes a resource-aware AutoML training experiment comparing task-compatible candidate estimators using either single holdout evaluation or K-fold cross-validation with untouched test evaluation and MLflow tracking.

#### Request Payload Model:
| Field | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `target_column` | `string` | **Yes** | — | Name of target column to predict (must exist, non-constant, non-empty) |
| `task_type` | `string` | No | Inferred | `"classification"` or `"regression"`. If omitted, inferred from target diagnostics. |
| `evaluation_strategy` | `string` | No | `"holdout"` | `"holdout"` (single train/test split) or `"cross_validation"` (K-fold CV on train partition) |
| `cv_folds` | `integer` | No | `5` | Number of folds for cross-validation ($2 \le \text{cv\_folds} \le 10$) |
| `cv_rare_class_fallback` | `boolean` | No | `true` | When true, permits classification CV fallback from StratifiedKFold to KFold if rare classes have fewer samples than cv_folds |
| `holdout_test` | `boolean` | No | `true` | When true in CV mode, reserves an untouched test set for an independent final evaluation of the winning model |
| `test_size` | `float` | No | `0.2` | Fraction of dataset reserved for evaluation or final holdout ($0.05 \le \text{test\_size} \le 0.5$) |
| `random_state` | `integer` | No | `42` | Seed for reproducible split and stochastic estimators |
| `time_budget_seconds` | `integer` | No | `60` | Wall-clock training limit ($5 \le \text{time\_budget} \le 300$ seconds) |
| `models` | `list[string]` | No | All task models | Candidate model identifiers to evaluate (subset of registry) |
| `primary_metric` | `string` | No | Task default | Primary ranking metric (e.g. `"f1_weighted"`, `"accuracy"`, `"rmse"`) |

#### Sample `curl` Command (Cross-Validation with Untouched Test Set):
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a/train \
  -H "Content-Type: application/json" \
  -d '{
    "target_column": "churn",
    "task_type": "classification",
    "evaluation_strategy": "cross_validation",
    "cv_folds": 5,
    "holdout_test": true,
    "test_size": 0.2,
    "random_state": 42,
    "time_budget_seconds": 60,
    "primary_metric": "f1_weighted"
  }'
```

#### Illustrative Response (HTTP 201 Created):
```json
{
  "experiment_id": "90e2da90-67bc-470c-a496-e2a0f8bfdfcb",
  "dataset_id": "7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a",
  "dataset_fingerprint": "a4f810c9d93b3e2182098b671e...",
  "target_column": "churn",
  "task_type": "classification",
  "evaluation_strategy": "cross_validation",
  "cv_folds": 5,
  "primary_metric": "f1_weighted",
  "primary_metric_greater_is_better": true,
  "random_state": 42,
  "test_size": 0.2,
  "train_rows": 800,
  "test_rows": 200,
  "features_count": 4,
  "best_model": "random_forest",
  "ranked_models": [
    "random_forest",
    "hist_gradient_boosting",
    "logistic_regression",
    "decision_tree",
    "dummy"
  ],
  "models_evaluated": [
    {
      "model_id": "random_forest",
      "model_name": "Random Forest",
      "status": "successful",
      "metrics": {
        "accuracy": 0.935,
        "f1_weighted": 0.9348,
        "precision_weighted": 0.936,
        "recall_weighted": 0.935
      },
      "cv_scores": [0.932, 0.941, 0.929, 0.938, 0.934],
      "cv_mean": 0.9348,
      "cv_std": 0.0047,
      "valid_folds_count": 5,
      "duration_seconds": 0.425,
      "error_message": null
    }
  ],
  "test_metrics": {
    "accuracy": 0.94,
    "f1_weighted": 0.9412,
    "precision_weighted": 0.942,
    "recall_weighted": 0.94
  },
  "total_duration_seconds": 1.25,
  "artifacts_saved": true,
  "mlflow_run_id": "89b71a2e4...",
  "mlflow_experiment_id": "0",
  "tracking_status": "completed",
  "tracking_warning": null,
  "evaluation_protocol": "Cross-validation (StratifiedKFold(5 folds)) on training partition (800 samples) was used for candidate selection. The selected model was evaluated once on an independent holdout test set (200 samples) that was completely untouched during candidate selection.",
  "disclaimer": "Evaluation metrics reflect empirical performance on the specified validation protocol."
}
```

---

## 9. AutoML Engine Architecture & Mechanics

### 9.1 Evaluation Strategies & Strict Leakage Prevention

AutoNexa provides two distinct evaluation modes to prevent overfitting and evaluation leakage:

1. **Holdout Evaluation (`evaluation_strategy="holdout"`)**:
   - Features and target are partitioned into a training split and a holdout test split.
   - Preprocessing (`ColumnTransformer`) and estimators are fitted strictly on the training partition.
   - Holdout metrics are reported on the test split.
2. **Cross-Validation with Untouched Test Set (`evaluation_strategy="cross_validation"`)**:
   - **Candidate Selection**: Models are trained and compared using K-fold cross-validation **strictly within the training partition**. In every fold, a fresh pipeline fits imputers, scalers, and encoders exclusively on that fold's training indices.
   - **Sample Standard Deviation**: Reports valid fold counts and sample standard deviation (`ddof=1`) only when at least 2 valid scores exist (returning `null` otherwise). Undefined metrics are never replaced with zero.
   - **Independent Final Assessment**: When `holdout_test=true`, the final test set remains completely untouched during candidate ranking. Once the winner is chosen, it is refitted on all training samples and evaluated **once** on the untouched test set to provide unbiased generalization metrics (`test_metrics`).
   - **Stratified Folds & Rare Class Fallback**: Classification CV uses `StratifiedKFold` when all classes have $\ge \text{cv\_folds}$ samples. If a minority class has fewer samples than the requested folds, it gracefully falls back to `KFold(shuffle=True)` with an explicit audit note, or raises a clear HTTP 400 validation error if `cv_rare_class_fallback=false`.

### 9.2 Cryptographic Dataset Fingerprinting

AutoNexa computes a cryptographic **SHA-256 hash** of the stored dataset file. This provides:
- Exact content verification and change detection across experiment runs.
- Complete privacy protection: raw data rows, column values, and PII are never logged or exposed.

### 9.3 Hierarchical MLflow Experiment Tracking

AutoNexa integrates a modular `MLflowTracker` layer:
- **Parent Run**: Represents the overall experiment run. Logs high-level parameters (`dataset_id`, `dataset_fingerprint`, `target_column`, `task_type`, `evaluation_strategy`, `cv_folds`, `test_size`, `random_state`, `primary_metric`), software version tags (`scikit-learn`, `pandas`, `numpy`, `mlflow`), overall duration, winning model ID, and registers `metadata.json` as an artifact.
- **Nested Child Runs**: One run per candidate estimator. Logs candidate parameters, execution status, per-fold metrics, `cv_mean`, `cv_std`, and holdout scores.
- **Fault-Tolerant Resilience**: If tracking fails or the tracking backend is unreachable, the experiment logs a sanitized warning and records `tracking_status="failed"` without disrupting model training or API responses.

### 9.4 Memory & Resource Guards

- **Memory-Bounded Preprocessing**: `OneHotEncoder` is configured with `max_categories=25` to guard against memory explosion and dense matrix bloat on high-cardinality categorical features.
- **Best-Effort Time Budget**: Evaluated before each candidate model and before each CV fold. Budget exhaustion produces `skipped_timeout` status, distinguishing timeouts from estimator fit failures.
- **Row/Column Ceilings**: Enforces `MAX_DATASET_ROWS` (default: 100,000) and `MAX_DATASET_COLUMNS` (default: 500).
- **Controlled Parallelism**: Estimators are configured with `n_jobs=1` to prevent CPU oversubscription.

---

## 10. Running Automated Tests

Run the full automated test suite (68 tests) from the `backend/` directory:

```bash
python -m pytest -q
```

Or for verbose test output:

```bash
python -m pytest -v
```

The test suite covers:
- System health and configuration integrity.
- Dataset upload, streaming size bounds, path traversal guards, and partial file cleanup.
- Dataset intelligence analysis, role classification, and diagnostics.
- Target selection validation (constant, all-null, non-existent).
- Heuristic task detection (binary classification, multiclass classification, regression).
- Explicit task overrides and type-compatibility guards.
- AutoML classification and regression training pipelines (holdout mode).
- Cross-validation for classification and regression with fold-level metric aggregation.
- Sample standard deviation calculation (`ddof=1`) and `null` handling when valid folds $< 2$.
- Rare-class stratification fallback and strict error validation.
- Preprocessing leakage prevention across CV folds.
- Unbiased final holdout evaluation of winning models.
- Cryptographic SHA-256 dataset fingerprinting.
- Hierarchical MLflow parent runs and nested candidate runs.
- MLflow tracking disabled behavior and exception resilience.
- Atomic experiment metadata and model artifact persistence.

---

## 11. Configuration Management

Configuration is handled centrally using `pydantic-settings` in [`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py). Variables can be overridden via environment variables or a local `.env` file.

To customize settings, copy the example environment file:

```bash
# On Windows PowerShell
Copy-Item .env.example .env

# On Unix / macOS / Git Bash
cp .env.example .env
```

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `APP_NAME` | `"AutoNexa"` | Name of the application |
| `APP_VERSION` | `"0.1.0"` | Current semantic version |
| `APP_DESCRIPTION` | `"An automated machine-learning research platform..."` | OpenAPI description |
| `API_V1_PREFIX` | `"/api/v1"` | URL prefix for version 1 API routes |
| `ENVIRONMENT` | `"development"` | Environment runtime mode |
| `DEBUG` | `false` | Enable/disable debug diagnostics |
| `SERVER_HOST` | `"127.0.0.1"` | Host address for server binding |
| `SERVER_PORT` | `8000` | Port for server binding |
| `UPLOAD_DIR` | `"uploads"` | Relative or absolute path for storing uploaded datasets |
| `EXPERIMENTS_DIR` | `"experiments"` | Relative or absolute path for persisting experiment artifacts |
| `ENABLE_MLFLOW_TRACKING` | `true` | Toggle for logging experiments and candidate runs to MLflow |
| `MLFLOW_TRACKING_URI` | `null` | Custom tracking URI (defaults to local file-store under `experiments/mlruns`) |
| `MAX_UPLOAD_SIZE_BYTES` | `10485760` (10 MB) | Maximum permitted upload size in bytes |
| `MAX_DATASET_ROWS` | `100000` | Maximum allowable rows for AutoML training |
| `MAX_DATASET_COLUMNS` | `500` | Maximum allowable columns for AutoML training |
| `MAX_TRAINING_BUDGET_SECONDS` | `300` | Maximum allowable time budget in seconds |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | Allowed frontend origins |

---

## 12. Current Limitations (Step 6)

- **Synchronous Training Execution**: Training runs synchronously within the HTTP request cycle under bounded time budgets (max 300s). Asynchronous background job queues (e.g. Celery / Redis) are intentionally deferred to future iterations.
- **Tabular Data Only**: The current pipeline exclusively supports tabular CSV inputs. Image, audio, text, and time-series modalities are not supported.
- **Best-Effort Budget Enforcement**: Wall-clock training budgets are checked before launching each candidate estimator and fold; individual fitting algorithms in scikit-learn cannot be interrupted mid-fit without external process termination.
- **Model Explainability & Quantum Benchmarking**: SHAP global/local attributions and PennyLane quantum benchmarking are planned for subsequent phases.

---

## 13. License

This project is licensed under the Apache 2.0 License.
