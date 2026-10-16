# AutoNexa (AutoML Research Lab)

An extensible, research-oriented Automated Machine Learning (AutoML) platform designed for tabular datasets. AutoNexa accelerates the workflow from raw tabular data ingestion to model selection, hyperparameter optimization, explainability, experiment tracking, and quantum machine learning benchmarking.

---

## 1. Project Overview

AutoNexa provides an automated, reproducible pipeline for tabular machine learning workflows:
- **Intelligent Ingestion & EDA**: Ingests tabular formats (CSV), infers schemas, profiles data distributions, and catches data quality anomalies and target leakages.
- **Resource-Aware AutoML**: Dynamically evaluates candidate models (linear baselines, tree-based models, and ensembles) under strict time and resource budgets.
- **Explainable AI (XAI)**: Native SHAP integration to provide global feature importance and individual prediction attributions.
- **Reproducible Experimentation**: Tracks trials, configurations, and artifacts via MLflow.
- **Quantum Machine Learning (QML) Benchmarking**: Benchmarks variational quantum circuits (PennyLane) against classical ML baselines.

---

## 2. Current Development Status

- **Status**: **Phase 3 — Secure CSV Dataset Ingestion, Validation & Profiling (Complete)**
- **Scope Implemented**:
  - Modular FastAPI application entry point initialized ([`backend/app/main.py`](file:///c:/Users/ishit/AutoNexa/backend/app/main.py)).
  - Centralized type-safe settings management powered by `pydantic-settings` ([`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py)).
  - System health-check endpoint ([`GET /api/v1/health`](http://127.0.0.1:8000/api/v1/health)) with strict Pydantic response contract ([`backend/app/schemas/health.py`](file:///c:/Users/ishit/AutoNexa/backend/app/schemas/health.py)).
  - Secure chunked CSV ingestion endpoint ([`POST /api/v1/datasets/upload`](http://127.0.0.1:8000/docs#/Datasets/upload_dataset_api_v1_datasets_upload_post)) with path-traversal protection and dynamic streaming size ceiling enforcement.
  - Tabular structural validation (enforcing non-empty, non-whitespace, parseable delimited structure with headers and data rows) and statistical profiling service ([`backend/app/services/dataset_service.py`](file:///c:/Users/ishit/AutoNexa/backend/app/services/dataset_service.py)).
  - Interactive Swagger UI documentation at [`/docs`](http://127.0.0.1:8000/docs) and OpenAPI specification at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).
  - 18 automated tests ([`backend/tests/test_health.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_health.py) and [`backend/tests/test_datasets.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_datasets.py)) covering all edge cases, malformed payloads, size bounds, and cleanup mechanisms.
- **Upcoming Phases**:
  - Phase 4: Automated Task Detection & Data Quality / Leakage Audit Service.
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
│   │   ├── __init__.py          # Main application package
│   │   ├── main.py              # FastAPI application entry point & factory
│   │   ├── api/
│   │   │   ├── __init__.py      # Aggregated API router
│   │   │   └── routes/
│   │   │       ├── __init__.py  # Route package initialization
│   │   │       ├── health.py    # Health-check route definition
│   │   │       └── datasets.py  # Dataset upload & profiling route definition
│   │   ├── core/
│   │   │   ├── __init__.py      # Core package exports
│   │   │   └── config.py        # Centralized Pydantic settings
│   │   ├── schemas/
│   │   │   ├── __init__.py      # Schema exports
│   │   │   ├── health.py        # Health response Pydantic model
│   │   │   └── dataset.py       # Dataset profile Pydantic model
│   │   └── services/
│   │       ├── __init__.py      # Service layer package exports
│   │       └── dataset_service.py # Dataset ingestion, validation & profiling service
│   ├── tests/
│   │   ├── __init__.py          # Test suite package
│   │   ├── test_health.py       # Health endpoint & OpenAPI automated tests
│   │   └── test_datasets.py     # Dataset ingestion, validation & profile tests
│   ├── uploads/
│   │   └── .gitkeep             # Local dataset upload directory (ignored in git)
│   ├── requirements.txt         # Pinned backend dependencies
│   ├── .env.example             # Safe environment configuration template
│   └── .venv/                   # Python 3.11 virtual environment (ignored in git)
├── frontend/
│   └── .gitkeep                 # Placeholder for Next.js frontend application
├── docs/
│   └── architecture.md          # Planned high-level system architecture
├── experiments/
│   └── .gitkeep                 # Experiment logs and tracking artifacts
├── .gitignore                   # Comprehensive git ignore rules
└── README.md                    # Project documentation
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
- **Interactive Swagger UI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI JSON Specification**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 8. API Specification & Endpoints

### 8.1 Health-Check Endpoint: `GET /api/v1/health`

Validates that the AutoNexa application server is online and operational. This endpoint is purposefully decoupled from external databases, ML engines, and caches.

#### Sample Request:
```bash
curl -X GET http://127.0.0.1:8000/api/v1/health
```

#### Sample Response (HTTP 200 OK):
```json
{
  "status": "healthy",
  "app_name": "AutoNexa",
  "version": "0.1.0"
}
```

---

### 8.2 Dataset Upload & Profiling Endpoint: `POST /api/v1/datasets/upload`

Uploads, validates, stores, and profiles a tabular CSV dataset.

#### Security & Validation Rules:
1. **Extension & Content Validation**: Requires a valid `.csv` filename extension.
2. **Streaming Size Limit Enforcement**: Streams files in 64 KB chunks, rejecting payloads exceeding `MAX_UPLOAD_SIZE_BYTES` (default 10 MB) with HTTP 413 without loading entire files into memory.
3. **Empty & Whitespace-Only Rejection**: Rejects 0-byte files and whitespace-only files with HTTP 400.
4. **Delimited Structure Validation**: Requires valid CSV headers and at least one data row. Rejects malformed rows with inconsistent column counts.
5. **Path Traversal Protection**: Client filenames are strictly sanitized and retained solely as display metadata. Files are saved on disk as `{dataset_id}.csv` using random UUIDs inside the verified `upload_dir`.
6. **Zero Orphan Files**: Any validation failure, size breach, or abort automatically cleans up partial and temporary files on disk.
7. **Privacy Preservation**: Raw dataset rows and absolute filesystem paths are never returned in responses.

#### Minimal `curl` Example:
```bash
curl -X POST http://127.0.0.1:8000/api/v1/datasets/upload \
  -H "Accept: application/json" \
  -F "file=@california_housing.csv;type=text/csv"
```

#### Sample Response (HTTP 201 Created):
```json
{
  "dataset_id": "7e4a1c5d-2b99-4d6b-9c71-2f738a901e4a",
  "filename": "california_housing.csv",
  "rows": 1000,
  "columns": 6,
  "column_names": ["id", "square_feet", "bedrooms", "bathrooms", "price", "neighborhood"],
  "data_types": {
    "id": "int64",
    "square_feet": "float64",
    "bedrooms": "int64",
    "bathrooms": "float64",
    "price": "float64",
    "neighborhood": "object"
  },
  "missing_values": {
    "id": 0,
    "square_feet": 15,
    "bedrooms": 0,
    "bathrooms": 2,
    "price": 0,
    "neighborhood": 4
  },
  "duplicate_rows": 0,
  "memory_usage_bytes": 48216,
  "file_size_bytes": 24580
}
```

---

## 9. Running Automated Tests

Run the full automated test suite (18 tests) from the `backend/` directory:

```bash
python -m pytest -q
```

Or for detailed test execution output:

```bash
python -m pytest -v
```

The test suite validates:
- Endpoint health and configuration reflection.
- Valid CSV upload, schema generation, and summary metrics.
- Rejection of non-CSV extensions, empty files, whitespace-only files, malformed rows, and header-only files.
- Chunked streaming upload size limits (HTTP 413).
- Path traversal immunity in client filenames.
- Complete cleanup of orphan/partial files upon validation errors.
- Prevention of raw data row or server filesystem path leakage in responses.

---

## 10. Configuration Management

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

## 11. Current Limitations (Step 3)

- **File Format**: Only comma-delimited tabular CSV files are currently supported. Parquet, TSV, and Excel ingestion will be introduced in subsequent iterations.
- **Storage Tier**: Ingested datasets are securely stored on local disk within the configured `upload_dir`. Cloud object stores (e.g. S3/GCS) are planned for distributed deployments.
- **Profiling Scope**: Profiling computes foundational tabular metrics (row/column counts, missingness, duplicates, memory footprint, and data types). Advanced statistical profiling, multicollinearity detection, and target leakage audits are reserved for Step 4.

---

## 12. License

This project is licensed under the Apache 2.0 License.
