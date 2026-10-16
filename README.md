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

- **Status**: **Phase 5 — AutoML Model Selection & Resource-Aware Training Engine (Complete)**
- **Scope Implemented**:
  - Modular FastAPI application entry point initialized ([`backend/app/main.py`](file:///c:/Users/ishit/AutoNexa/backend/app/main.py)).
  - Centralized type-safe settings management powered by `pydantic-settings` ([`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py)).
  - System health-check endpoint ([`GET /api/v1/health`](http://127.0.0.1:8000/api/v1/health)) with strict Pydantic response contract ([`backend/app/schemas/health.py`](file:///c:/Users/ishit/AutoNexa/backend/app/schemas/health.py)).
  - Secure chunked CSV ingestion endpoint ([`POST /api/v1/datasets/upload`](http://127.0.0.1:8000/docs#/Datasets/upload_dataset_api_v1_datasets_upload_post)) with path-traversal protection and dynamic streaming size ceiling enforcement ([`backend/app/services/dataset_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/dataset_service.py)).
  - Comprehensive Dataset Intelligence & Task Detection endpoint ([`POST /api/v1/datasets/{dataset_id}/analyze`](http://127.0.0.1:8000/docs#/Datasets/analyze_dataset_api_v1_datasets__dataset_id__analyze_post)) providing feature role classification, quality warnings, candidate target detection, and heuristic ML task recommendations with override support ([`backend/app/services/analysis_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/analysis_service.py)).
  - Resource-Aware AutoML Model Selection & Training endpoint ([`POST /api/v1/datasets/{dataset_id}/train`](http://127.0.0.1:8000/docs#/Datasets/train_models_api_v1_datasets__dataset_id__train_post)) with modular preprocessors, model registry, multi-metric evaluation, atomic local persistence, and resource bounds ([`backend/app/services/automl/`](file:///c:/Users/ishit/AutoNexa/backend/app/services/automl/)).
  - Interactive Swagger UI documentation at [`/docs`](http://127.0.0.1:8000/docs) and OpenAPI specification at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).
  - 54 automated tests across [`backend/tests/test_health.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_health.py), [`backend/tests/test_datasets.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_datasets.py), [`backend/tests/test_analysis.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_analysis.py), and [`backend/tests/test_training.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_training.py) covering all functional requirements, security guards, leakage-free pipelines, and edge cases.
- **Upcoming Phases**:
  - Phase 6: Model Explainability (SHAP) & MLflow Tracking.
  - Phase 7: Next.js Frontend UI Dashboard & Visualizations.
  - Phase 8: PennyLane Classical vs. Quantum Benchmarking Module.

---

## 3. Planned Features

- **Automatic Task Detection**: Automatically infers whether a problem is Binary Classification, Multi-class Classification, or Regression.
- **Data Quality & Leakage Audit**: Identifies identifier columns, high-cardinality leakage, duplicate rows, missingness patterns, and class imbalances.
- **Resource-Aware AutoML Engine**: Trains and compares diverse candidate models with leakage-free preprocessing, atomic metadata/model persistence, and bounded runtime budgets.
- **Hyperparameter Optimization (HPO)**: Efficient Bayesian hyperparameter search.
- **Explainability**: Integrated SHAP summary plots, waterfall plots, and feature attribution reports.
- **Experiment Tracking**: Automatic metrics logging, hyperparameter recording, and artifact tracking via MLflow.
- **Classical vs. Quantum ML Benchmark**: Variational quantum circuits using PennyLane for research-grade comparative performance studies.

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
│   │       └── automl/            # Modular AutoML training engine
│   │           ├── __init__.py    # AutoML package exports
│   │           ├── preprocessor.py# Leakage-free ColumnTransformer pipeline builder
│   │           ├── registry.py    # Extensible scikit-learn model candidate registry
│   │           ├── evaluator.py   # Task metrics computation, ranking & sanitization
│   │           └── training_service.py # Training orchestrator & atomic persistence
│   ├── tests/
│   │   ├── __init__.py            # Test suite package
│   │   ├── test_health.py         # Health endpoint automated tests
│   │   ├── test_datasets.py       # Dataset upload and validation tests
│   │   ├── test_analysis.py       # Dataset intelligence & task detection tests
│   │   └── test_training.py       # AutoML training engine & pipeline tests
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

Executes a synchronous, resource-aware AutoML training experiment comparing task-compatible candidate estimators on a holdout split with leakage-free preprocessing.

#### Request Payload Model:
| Field | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `target_column` | `string` | **Yes** | — | Name of target column to predict (must exist, non-constant, non-empty) |
| `task_type` | `string` | No | Inferred | `"classification"` or `"regression"`. If omitted, inferred from target diagnostics. |
| `test_size` | `float` | No | `0.2` | Fraction of dataset reserved for evaluation ($0.05 \le \text{test\_size} \le 0.5$) |
| `random_state` | `integer` | No | `42` | Seed for reproducible holdout split and stochastic model fits |
| `time_budget_seconds` | `integer` | No | `60` | Wall-clock training limit ($5 \le \text{time\_budget} \le 300$ seconds) |
| `models` | `list[string]` | No | All task models | Candidate model identifiers to evaluate (subset of registry) |
| `primary_metric` | `string` | No | Task default | Primary ranking metric (e.g. `"f1_weighted"`, `"accuracy"`, `"rmse"`) |

#### Sample `curl` Command:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a/train \
  -H "Content-Type: application/json" \
  -d '{
    "target_column": "churn",
    "task_type": "classification",
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
  "target_column": "churn",
  "task_type": "classification",
  "primary_metric": "f1_weighted",
  "ranking_direction": "higher_is_better",
  "random_state": 42,
  "test_size": 0.2,
  "train_samples": 800,
  "test_samples": 200,
  "feature_columns": ["age", "income", "credit_score", "geography"],
  "numeric_columns": ["age", "income", "credit_score"],
  "categorical_columns": ["geography"],
  "best_model_id": "random_forest",
  "best_score": 0.9412,
  "ranked_models": [
    "random_forest",
    "hist_gradient_boosting",
    "logistic_regression",
    "decision_tree",
    "dummy"
  ],
  "models": [
    {
      "model_id": "random_forest",
      "model_name": "Random Forest",
      "status": "success",
      "duration_seconds": 0.1245,
      "metrics": {
        "accuracy": 0.94,
        "precision_weighted": 0.942,
        "recall_weighted": 0.94,
        "f1_weighted": 0.9412,
        "f1_macro": 0.9231,
        "roc_auc": 0.965
      },
      "error_message": null
    }
  ],
  "total_duration_seconds": 0.452,
  "time_budget_seconds": 60,
  "budget_exhausted": false,
  "holdout_disclaimer": "Holdout evaluation metrics are empirical estimates computed on the test split. Performance may vary on unobserved production distributions."
}
```

---

## 9. AutoML Engine Architecture & Mechanics

### 9.1 Model Registry Candidates

The engine integrates an extensible `ModelRegistry` exposing established scikit-learn estimators with bounded computational complexity and reproducible seeds:

| Task | Model ID | Estimator Class | Default Complexity / Guards |
| :--- | :--- | :--- | :--- |
| **Classification** | `dummy` | `DummyClassifier` | `strategy="most_frequent"` baseline |
| | `logistic_regression` | `LogisticRegression` | `max_iter=1000`, `n_jobs=1` |
| | `decision_tree` | `DecisionTreeClassifier` | `max_depth=10`, `min_samples_leaf=2` |
| | `random_forest` | `RandomForestClassifier` | `n_estimators=50`, `max_depth=12`, `n_jobs=1` |
| | `hist_gradient_boosting` | `HistGradientBoostingClassifier` | `max_iter=50`, `early_stopping=True` |
| **Regression** | `dummy_regressor` | `DummyRegressor` | `strategy="mean"` baseline |
| | `linear_regression` | `Ridge` | L2-regularized linear baseline (`alpha=1.0`) |
| | `decision_tree_regressor` | `DecisionTreeRegressor` | `max_depth=10`, `min_samples_leaf=2` |
| | `random_forest_regressor` | `RandomForestRegressor` | `n_estimators=50`, `max_depth=12`, `n_jobs=1` |
| | `hist_gradient_boosting_regressor` | `HistGradientBoostingRegressor` | `max_iter=50`, `early_stopping=True` |

### 9.2 Leakage-Free Preprocessing Pipeline

- **Strict Split Order**: Dataset features and target are separated, and the holdout split (`train_test_split`) is created **before** fitting any preprocessor.
- **Scikit-Learn `ColumnTransformer`**:
  - **Numeric Features**: Imputed using `SimpleImputer(strategy="median")` and standardized with `StandardScaler()`. Imputer medians and standardizer scales are computed exclusively on the training split.
  - **Categorical Features**: Imputed using `SimpleImputer(strategy="most_frequent")` and encoded with `OneHotEncoder(handle_unknown="ignore", sparse_output=False)`. Unseen categories in test data are gracefully zero-vectored rather than triggering runtime errors.
- **Stratification & Fallback**: Classification targets undergo stratified splitting when every class contains at least 2 instances. If a target contains rare singleton classes, the engine automatically falls back to an unstratified split.
- **Pipeline Packaging**: The fitted preprocessor and best estimator are bundled into an end-to-end `sklearn.pipeline.Pipeline`, ensuring portable inference without manual feature transformation.

### 9.3 Evaluation Metrics & Ranking

All metrics are sanitized to prevent `NaN` or `Infinity` from appearing in API responses:
- **Classification**:
  - `accuracy`: Overall proportion of correct predictions.
  - `precision_weighted` & `precision_macro`: Multi-class precision with zero-division handling.
  - `recall_weighted` & `recall_macro`: Multi-class recall with zero-division handling.
  - `f1_weighted` & `f1_macro`: Multi-class harmonic mean of precision and recall.
  - `roc_auc`: Area under the ROC curve (binary or multi-class OvR when predicted probabilities are available).
  - `confusion_matrix`: Tabular breakdown of true vs. predicted class counts.
  - Default primary metric: `"f1_weighted"`. Ranking direction: `higher_is_better = true`.
- **Regression**:
  - `rmse`: Root Mean Squared Error.
  - `mae`: Mean Absolute Error.
  - `r2`: Coefficient of determination ($R^2$).
  - Default primary metric: `"rmse"`. Ranking direction: `greater_is_better = false` (lower is better).

### 9.4 Resource Controls & Limits

- **Row and Column Ceilings**: Datasets exceeding `MAX_DATASET_ROWS` (default: 100,000) or `MAX_DATASET_COLUMNS` (default: 500) are rejected prior to fitting.
- **Bounded Wall-Clock Budget**: User-configurable from 5s to 300s (default: 60s). Training loop checks elapsed time before each candidate fit and gracefully halts if budget is exhausted.
- **Controlled Parallelism**: Estimators are configured with `n_jobs=1` to prevent uncontrolled CPU consumption and threading contention.
- **Atomic Experiment Persistence**:
  - Experiment runs are saved under `experiments/{experiment_id}/`.
  - `metadata.json` is written atomically using a temporary file and atomic replace.
  - The winning model pipeline is persisted via `joblib.dump` to `best_model.joblib`.
  - No internal server filesystem paths are exposed in the API response.

---

## 10. Running Automated Tests

Run the full automated test suite (54 tests) from the `backend/` directory:

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
- AutoML classification and regression training pipelines.
- Invalid dataset IDs, invalid target columns, and constant targets.
- Missing and categorical values handling (including unseen test categories).
- Imbalanced classification and rare class stratification fallback.
- Metric ranking direction correctness (higher vs. lower is better).
- Fault isolation: a single failing estimator does not crash the experiment.
- Deterministic reproducibility given a fixed seed and dataset.
- Resource ceiling validation (rows, columns, time budgets).
- Verification that no target leakage occurs during preprocessing fit.
- Verification that no raw dataset rows or server paths leak into responses.
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
| `MAX_UPLOAD_SIZE_BYTES` | `10485760` (10 MB) | Maximum permitted upload size in bytes |
| `MAX_DATASET_ROWS` | `100000` | Maximum allowable rows for AutoML training |
| `MAX_DATASET_COLUMNS` | `500` | Maximum allowable columns for AutoML training |
| `MAX_TRAINING_BUDGET_SECONDS` | `300` | Maximum allowable time budget in seconds |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | Allowed frontend origins |

---

## 12. Current Limitations (Step 5)

- **Synchronous Training Execution**: Training runs synchronously within the HTTP request cycle under bounded time budgets (max 300s). Asynchronous background job queues (e.g. Celery / Redis) are intentionally deferred to future iterations.
- **Tabular Data Only**: The current pipeline exclusively supports tabular CSV inputs. Image, audio, text, and time-series modalities are not supported.
- **Single Holdout Evaluation**: Initial model ranking uses a train/test split. Repeated evaluation on the test set is an initial model comparison; final generalization reporting will incorporate outer cross-validation in future phases.
- **Local Artifact Persistence**: Experiment artifacts and models are persisted locally on the host filesystem under `experiments/`. Distributed storage or cloud registries (e.g. S3 / GCS / MLflow) are scheduled for Phase 6.

---

## 13. License

This project is licensed under the Apache 2.0 License.

---

## 13. License

This project is licensed under the Apache 2.0 License.
