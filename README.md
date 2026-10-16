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

- **Status**: **Phase 4 — Dataset Intelligence, Data Quality & ML Task Detection (Complete)**
- **Scope Implemented**:
  - Modular FastAPI application entry point initialized ([`backend/app/main.py`](file:///c:/Users/ishit/AutoNexa/backend/app/main.py)).
  - Centralized type-safe settings management powered by `pydantic-settings` ([`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py)).
  - System health-check endpoint ([`GET /api/v1/health`](http://127.0.0.1:8000/api/v1/health)) with strict Pydantic response contract ([`backend/app/schemas/health.py`](file:///c:/Users/ishit/AutoNexa/backend/app/schemas/health.py)).
  - Secure chunked CSV ingestion endpoint ([`POST /api/v1/datasets/upload`](http://127.0.0.1:8000/docs#/Datasets/upload_dataset_api_v1_datasets_upload_post)) with path-traversal protection and dynamic streaming size ceiling enforcement ([`backend/app/services/dataset_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/dataset_service.py)).
  - Comprehensive Dataset Intelligence & Task Detection endpoint ([`POST /api/v1/datasets/{dataset_id}/analyze`](http://127.0.0.1:8000/docs#/Datasets/analyze_dataset_api_v1_datasets__dataset_id__analyze_post)) providing feature role classification, quality warnings (missingness, constants, high cardinality, class imbalance, potential leakage), candidate target detection, and heuristic ML task recommendations with override support ([`backend/app/services/analysis_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/analysis_service.py)).
  - Interactive Swagger UI documentation at [`/docs`](http://127.0.0.1:8000/docs) and OpenAPI specification at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).
  - 33 automated tests across [`backend/tests/test_health.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_health.py), [`backend/tests/test_datasets.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_datasets.py), and [`backend/tests/test_analysis.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_analysis.py) covering all functional requirements, security guards, and edge cases.
- **Upcoming Phases**:
  - Phase 5: AutoML Model Selection & Resource-Aware Training Pipeline.
  - Phase 6: Model Explainability (SHAP) & MLflow Tracking.
  - Phase 7: Next.js Frontend UI Dashboard & Visualizations.
  - Phase 8: PennyLane Classical vs. Quantum Benchmarking Module.

---

## 3. Planned Features

- **Automatic Task Detection**: Automatically infers whether a problem is Binary Classification, Multi-class Classification, or Regression.
- **Data Quality & Leakage Audit**: Identifies identifier columns, high-cardinality leakage, duplicate rows, missingness patterns, and class imbalances.
- **Hyperparameter Optimization (HPO)**: Efficient Bayesian hyperparameter search.
- **Resource Constraints**: Respects user-specified CPU limits and training time budgets to prevent out-of-memory errors and runaway processes.
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
│   │   │       └── datasets.py    # Dataset upload, profiling & analysis routes
│   │   ├── core/
│   │   │   ├── __init__.py        # Core package exports
│   │   │   └── config.py          # Centralized Pydantic settings
│   │   ├── schemas/
│   │   │   ├── __init__.py        # Schema exports
│   │   │   ├── health.py          # Health response Pydantic model
│   │   │   ├── dataset.py         # Dataset profile Pydantic model
│   │   │   └── analysis.py        # Dataset intelligence & task detection schemas
│   │   └── services/
│   │       ├── __init__.py        # Service layer package exports
│   │       ├── dataset_service.py # Ingestion, validation & profiling service
│   │       └── analysis_service.py # Dataset intelligence, diagnostics & task detection
│   ├── tests/
│   │   ├── __init__.py            # Test suite package
│   │   ├── test_health.py         # Health endpoint automated tests
│   │   ├── test_datasets.py       # Dataset upload and validation tests
│   │   └── test_analysis.py       # Dataset intelligence & task detection tests
│   ├── uploads/
│   │   └── .gitkeep               # Local dataset upload directory (ignored in git)
│   ├── requirements.txt           # Pinned backend dependencies
│   ├── .env.example               # Safe environment configuration template
│   └── .venv/                     # Python 3.11 virtual environment (ignored in git)
├── frontend/
│   └── .gitkeep                   # Placeholder for Next.js frontend application
├── docs/
│   └── architecture.md            # Planned high-level system architecture
├── experiments/
│   └── .gitkeep                   # Experiment logs and tracking artifacts
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
*Note: If no body or an empty object `{}` is supplied, the endpoint computes full dataset diagnostics and lists candidate targets without enforcing a specific prediction task.*

#### Sample `curl` Command:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a/analyze \
  -H "Content-Type: application/json" \
  -d '{"target_column": "churn"}'
```

#### Illustrative Response (HTTP 200 OK):
```json
{
  "dataset_id": "7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a",
  "rows": 1000,
  "columns": 5,
  "column_summaries": [
    {
      "name": "user_id",
      "inferred_type": "int64",
      "role": "identifier",
      "missing_count": 0,
      "missing_percentage": 0.0,
      "unique_count": 1000,
      "is_constant": false,
      "is_near_constant": false,
      "is_high_cardinality": false
    },
    {
      "name": "age",
      "inferred_type": "float64",
      "role": "numeric",
      "missing_count": 15,
      "missing_percentage": 1.5,
      "unique_count": 65,
      "is_constant": false,
      "is_near_constant": false,
      "is_high_cardinality": false
    },
    {
      "name": "churn",
      "inferred_type": "int64",
      "role": "numeric",
      "missing_count": 0,
      "missing_percentage": 0.0,
      "unique_count": 2,
      "is_constant": false,
      "is_near_constant": false,
      "is_high_cardinality": false
    }
  ],
  "numeric_columns": ["user_id", "age", "churn"],
  "categorical_columns": [],
  "duplicate_rows_count": 0,
  "duplicate_rows_percentage": 0.0,
  "candidate_targets": [
    {
      "column_name": "churn",
      "reason": "Column name 'churn' matches common target naming conventions.",
      "suggested_task": "binary_classification"
    }
  ],
  "quality_warnings": [],
  "task_recommendation": {
    "target_column": "churn",
    "task_type": "binary_classification",
    "confidence": "medium",
    "rationale": "Target is numeric with exactly 2 distinct values ([0, 1]). Recommending binary classification. If continuous bounded modeling is desired, set task_override='regression'.",
    "class_distribution": {
      "0": 850,
      "1": 150
    },
    "is_class_imbalanced": false,
    "minority_class_percentage": 15.0,
    "heuristic_disclaimer": "Heuristic task detection provides an automated recommendation based on data types and cardinality. It does not guarantee task suitability for all research or business objectives. Use task_override if domain requirements differ."
  }
}
```

---

## 9. Task Detection Heuristics & Data Quality Audits

### 9.1 ML Task Detection Rules
1. **Categorical / Text Targets**:
   - Distinct values == 2 $\rightarrow$ `binary_classification` (High confidence).
   - Distinct values > 2 $\rightarrow$ `multiclass_classification` (High confidence).
2. **Numeric Targets**:
   - Exactly 2 distinct numeric values (e.g., `0` and `1`) $\rightarrow$ `binary_classification` (Medium confidence, with explicit note on continuous modeling option).
   - Discrete integer with $\le 10$ unique values $\rightarrow$ `multiclass_classification` (Medium confidence).
   - Continuous float or $\ge 11$ unique values $\rightarrow$ `regression` (High confidence).
3. **Task Overrides**:
   - `task_override='regression'` is verified against target type; rejected if target is non-numeric text.
   - `task_override='classification'` is verified against target type; rejected if target is continuous float with $> 100$ unique values.
4. **Safety & Disclaimers**:
   - Heuristics are explicitly disclaimed as automated guidance rather than definitive ground truth. Users retain full control via `task_override`.

### 9.2 Data Quality & Risk Diagnostics
- **Critical Missingness**: Flags columns with $> 50\%$ missing values (`CRITICAL_MISSINGNESS`) or $> 20\%$ missing values (`HIGH_MISSINGNESS`).
- **Constant & Near-Constant Features**: Identifies columns with 1 unique value (`CONSTANT_COLUMN`) or dominant value $\ge 95\%$ frequency (`NEAR_CONSTANT_COLUMN`).
- **High Cardinality**: Flags categorical features with $> 50$ distinct categories or ratio $> 30\%$ of total rows (`HIGH_CARDINALITY`).
- **Class Imbalance**: Warns when minority class comprises $< 10\%$ of samples or majority-to-minority ratio exceeds $4:1$ (`CLASS_IMBALANCE`).
- **Target Leakage**: Evaluates linear correlation ($|r| \ge 0.98$) between candidate numeric features and the target (`POTENTIAL_TARGET_LEAKAGE`).

---

## 10. Running Automated Tests

Run the full automated test suite (33 tests) from the `backend/` directory:

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
- Missingness statistics, constant features, high cardinality, class imbalance, and leakage warnings.
- Verification that no raw rows or absolute server paths leak into responses.

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
| `MAX_UPLOAD_SIZE_BYTES` | `10485760` (10 MB) | Maximum permitted upload size in bytes |
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | Allowed frontend origins |

---

## 12. Current Limitations (Step 4)

- **Diagnostic Only**: Analysis identifies quality issues, class imbalance, and candidate targets, but does not mutate, drop, or transform the underlying dataset file.
- **Leakage Detection**: Leakage detection currently evaluates high linear correlation ($|r| \ge 0.98$); non-linear mutual information leakage checks will be integrated into feature engineering in Phase 5.
- **Model Training**: No machine learning models are trained in this phase. Candidate model generation and hyperparameter search occur in Phase 5.

---

## 13. License

This project is licensed under the Apache 2.0 License.
