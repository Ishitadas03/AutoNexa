# AutoNexa (AutoML Research Lab)

An extensible, research-oriented Automated Machine Learning (AutoML) platform designed for tabular datasets. AutoNexa accelerates the workflow from raw tabular data ingestion to model selection, hyperparameter optimization, explainability, experiment tracking, and quantum machine learning benchmarking.

---

## 1. Project Overview

AutoNexa provides an automated, reproducible pipeline for tabular machine learning workflows:
- **Intelligent Ingestion & EDA**: Ingests tabular formats (CSV, Parquet), infers schemas, profiles data distributions, and catches data quality anomalies and target leakages.
- **Resource-Aware AutoML**: Dynamically evaluates candidate models (linear baselines, tree-based models, and ensembles) under strict time and resource budgets.
- **Explainable AI (XAI)**: Native SHAP integration to provide global feature importance and individual prediction attributions.
- **Reproducible Experimentation**: Tracks trials, configurations, and artifacts via MLflow.
- **Quantum Machine Learning (QML) Benchmarking**: Benchmarks variational quantum circuits (PennyLane) against classical ML baselines.

---

## 2. Current Development Status

- **Status**: **Phase 2 — Backend Foundation & Health-Check API (Complete)**
- **Scope Implemented**:
  - Modular FastAPI application entry point initialized ([`backend/app/main.py`](file:///c:/Users/ishit/AutoNexa/backend/app/main.py)).
  - Centralized type-safe settings management powered by `pydantic-settings` ([`backend/app/core/config.py`](file:///c:/Users/ishit/AutoNexa/backend/app/core/config.py)).
  - System health-check endpoint ([`GET /api/v1/health`](http://127.0.0.1:8000/api/v1/health)) with strict Pydantic response contract ([`backend/app/schemas/health.py`](file:///c:/Users/ishit/AutoNexa/backend/app/schemas/health.py)).
  - Interactive Swagger UI documentation at [`/docs`](http://127.0.0.1:8000/docs) and OpenAPI specification at [`/openapi.json`](http://127.0.0.1:8000/openapi.json).
  - Comprehensive automated test suite ([`backend/tests/test_health.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_health.py)) validating status codes, response schemas, configuration reflection, and documentation routes.
- **Upcoming Phases**:
  - Phase 3: Core Data Ingestion & Quality Analysis Service.
  - Phase 4: AutoML Model Selection & Resource-Aware Training Pipeline.
  - Phase 5: Model Explainability (SHAP) & MLflow Tracking.
  - Phase 6: Next.js Frontend UI Dashboard & Visualizations.
  - Phase 7: PennyLane Classical vs. Quantum Benchmarking Module.

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
│   │   │       └── health.py    # Health-check route definition
│   │   ├── core/
│   │   │   ├── __init__.py      # Core package exports
│   │   │   └── config.py        # Centralized Pydantic settings
│   │   ├── schemas/
│   │   │   ├── __init__.py      # Schema exports
│   │   │   └── health.py        # Health response Pydantic model
│   │   └── services/
│   │       └── __init__.py      # Service layer package
│   ├── tests/
│   │   ├── __init__.py          # Test suite package
│   │   └── test_health.py       # Health endpoint & OpenAPI automated tests
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
- **Interactive Swagger UI Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **OpenAPI JSON Specification**: [http://127.0.0.1:8000/openapi.json](http://127.0.0.1:8000/openapi.json)

---

## 8. Health-Check API Specification

### Endpoint: `GET /api/v1/health`

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

## 9. Running Automated Tests

Run the test suite from the `backend/` directory:

```bash
python -m pytest -q
```

Or for detailed test execution output:

```bash
python -m pytest -v
```

All 5 core endpoint and schema tests will execute using FastAPI's `TestClient`.

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
| `BACKEND_CORS_ORIGINS` | `["http://localhost:3000","http://127.0.0.1:3000"]` | Allowed frontend origins |

---

## 11. License

This project is licensed under the Apache 2.0 License.
