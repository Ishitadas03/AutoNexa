# AutoML Research Lab (AutoNexa)

An extensible, research-oriented Automated Machine Learning (AutoML) platform designed for tabular datasets. AutoML Research Lab accelerates the workflow from raw tabular data ingestion to model selection, hyperparameter optimization, explainability, experiment tracking, and quantum machine learning benchmarking.

---

## 1. Project Overview

AutoML Research Lab provides an automated, reproducible pipeline for tabular machine learning workflows:
- **Intelligent Ingestion & EDA**: Ingests tabular formats (CSV, Parquet), infers schemas, profiles data distributions, and catches data quality anomalies and target leakages.
- **Resource-Aware AutoML**: Dynamically evaluates candidate models (linear baselines, tree-based models, and ensembles) under strict time and resource budgets.
- **Explainable AI (XAI)**: Native SHAP integration to provide global feature importance and individual prediction attributions.
- **Reproducible Experimentation**: Tracks trials, configurations, and artifacts via MLflow.
- **Quantum Machine Learning (QML) Benchmarking**: Benchmarks variational quantum circuits (PennyLane) against classical ML baselines.

---

## 2. Current Development Status

- **Status**: **Phase 1 — Project Foundation (Complete)**
- **Scope Implemented**:
  - Research repository architecture established.
  - Backend package hierarchy structured (`app/api`, `app/core`, `app/schemas`, `app/services`, `tests`, `uploads`).
  - Isolated Python 3.11 virtual environment initialized.
  - Core web and machine learning foundation dependencies installed and verified.
  - Safe environment configuration templates (`.env.example`) and comprehensive `.gitignore` configured.
  - High-level system architecture documented in [`docs/architecture.md`](docs/architecture.md).
- **Upcoming Phases**:
  - Phase 2: Core Data Ingestion & Quality Analysis Service.
  - Phase 3: AutoML Model Selection & Resource-Aware Training Pipeline.
  - Phase 4: Model Explainability (SHAP) & MLflow Tracking.
  - Phase 5: Next.js Frontend UI Dashboard & Visualizations.
  - Phase 6: PennyLane Classical vs. Quantum Benchmarking Module.

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

> [!NOTE]
> Python 3.11 is strictly recommended for optimal compatibility across core scientific and machine learning libraries (e.g., NumPy, Scikit-Learn, PyTorch/PennyLane).

---

## 5. Project Directory Structure

```text
AutoNexa/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # Main application package
│   │   ├── api/
│   │   │   └── __init__.py      # API routers and endpoints
│   │   ├── core/
│   │   │   └── __init__.py      # Application configuration and settings
│   │   ├── schemas/
│   │   │   └── __init__.py      # Pydantic schemas and data contracts
│   │   └── services/
│   │       └── __init__.py      # Business logic and ML services
│   ├── tests/
│   │   └── __init__.py          # Unit and integration test suite
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

Choose the command matching your shell:

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

- **Fish Shell**:
  ```fish
  source .venv/bin/activate.fish
  ```

### Step 6.4: Install Dependencies

With the virtual environment activated:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

---

## 7. Verifying the Setup

To verify that the Python environment and all required dependencies are correctly installed, run the following verification checks inside `backend/`:

### 1. Verify Python Interpreter & Version
```bash
python --version
```
*Expected output:* `Python 3.11.x`

### 2. Verify Dependency Integrity
```bash
python -m pip check
```
*Expected output:* `No broken requirements found.`

### 3. Verify Package Imports
Run the automated import test:
```bash
python -c "import fastapi, uvicorn, pandas, numpy, sklearn, multipart, pydantic_settings, pytest, httpx; print('All core modules imported successfully!')"
```
*Expected output:* `All core modules imported successfully!`

---

## 8. Configuration

Copy the template environment file to `.env`:

```bash
# On Windows PowerShell
Copy-Item .env.example .env

# On Unix / macOS / Git Bash
cp .env.example .env
```

The default values in `.env.example` are pre-configured for safe local development and do not require external credentials or API keys.

---

## 9. License

This project is licensed under the Apache 2.0 License.
