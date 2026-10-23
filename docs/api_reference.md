# AutoNexa REST API Reference

This document provides a comprehensive endpoint reference for the AutoNexa FastAPI backend (`api_v1_prefix = /api/v1`).

---

## 1. Authentication & Role-Based Access Control (RBAC)

AutoNexa enforces API-key authentication using constant-time string comparisons (`secrets.compare_digest`) to prevent timing side-channel attacks.

### Header Authentication

Requests must include the API key in one of two formats:
```http
X-API-Key: <your-api-key>
```
or
```http
Authorization: Bearer <your-api-key>
```

### Access Roles

| Role | Scope | Authorized Actions |
| :--- | :--- | :--- |
| **Public** | Unauthenticated | Liveness health check (`/api/v1/health`) and OpenAPI specs (`/docs`, `/openapi.json`). |
| **Inference / Read** | Read-Only | Read cataloged datasets, inspect experiments, export manifests, query metrics, run tabular predictions, compute SHAP feature importance, and perform error analysis. |
| **Admin** | Read & Write | Upload datasets, trigger AutoML training, execute pipeline jobs, promote model registry stages, delete artifacts, run HPO search, and inspect system diagnostics. |

---

## 2. System Health, Readiness & Diagnostics

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | **Public** | Public liveness probe. Returns process status, app name, and version without internal paths. |
| `GET` | `/api/v1/health/readiness` | `Inference` | Evaluates SQLite DB connectivity, storage directory writeability, and worker lifecycle. Returns `503` if degraded. |
| `GET` | `/api/v1/health/diagnostics` | `Admin` | Detailed diagnostic report: table row counts, Python runtime version, PID, uptime, and storage counts. |
| `GET` | `/api/v1/metrics` | `Inference` | Returns in-memory operational metrics (HTTP request counters, latencies, database operations, error rates). |

---

## 3. Dataset Management & Schema Intelligence

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/datasets` | `Inference` | Lists persistent datasets from the relational catalog with pagination, search, and sorting. |
| `GET` | `/api/v1/datasets/{dataset_id}` | `Inference` | Retrieves structural metadata, column types, row/column counts, and SHA-256 fingerprint for a dataset. |
| `POST` | `/api/v1/datasets/upload` | `Admin` | Streams multipart `.csv` upload in 64 KB chunks, enforces size limit (default 10 MB), and computes summary profile. |
| `POST` | `/api/v1/datasets/{dataset_id}/analyze` | `Inference` | Performs data quality audit (missingness, constants, class imbalance, leakage risks) and recommends ML task. |
| `POST` | `/api/v1/datasets/{dataset_id}/train` | `Admin` | Launches resource-aware AutoML model selection and training under bounded time and memory constraints. |

---

## 4. Experiments, Explainability & Predictions

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/experiments` | `Inference` | Paginated listing of completed AutoML experiments with task and status filters. |
| `GET` | `/api/v1/experiments/{id}` | `Inference` | Sanitized experiment inspection: winning estimator, metric leaderboard, feature schema, and artifact hash. |
| `GET` | `/api/v1/experiments/{id}/details` | `Inference` | Detailed fold evaluations, cross-validation metrics, software versions, and diagnostic failure info. |
| `GET` | `/api/v1/experiments/{id}/metrics` | `Inference` | Extracts validation, cross-validation, and holdout test metric summaries. |
| `GET` | `/api/v1/experiments/{id}/reproducibility-manifest` | `Inference` | Exports machine-readable cryptographic JSON manifest with seeds, preprocessing steps, and dependency versions. |
| `GET` | `/api/v1/experiments/{id}/reproducibility-manifest/verify` | `Inference` | Cryptographically verifies physical model binary on disk against the recorded SHA-256 manifest hash. |
| `GET` | `/api/v1/experiments/{id}/artifact` | `Admin` | Downloads the serialized `.joblib` model binary with integrity checksum headers. |
| `DELETE` | `/api/v1/experiments/{id}` | `Admin` | Permanently deletes an experiment directory, metadata record, and associated model binaries. |
| `POST` | `/api/v1/experiments/{id}/predict` | `Inference` | Runs tabular prediction on bounded JSON records using the winning pipeline. Returns class probabilities when supported. |
| `POST` | `/api/v1/experiments/{id}/predict-csv` | `Inference` | Streams batch CSV file, validates expected features, runs inference, and returns downloadable enriched CSV. |
| `GET` | `/api/v1/experiments/{id}/explainability/importance` | `Inference` | Computes global feature importance (native tree importance or model-agnostic permutation importance on holdout data). |
| `POST` | `/api/v1/experiments/{id}/explainability/prediction` | `Inference` | Instance-level local feature attributions via SHAP (`TreeExplainer` / `LinearExplainer`) or perturbation fallback. |
| `POST` | `/api/v1/experiments/{id}/error-analysis` | `Inference` | Computes confusion matrices, calibration curves, or residual error distributions on independent holdout samples. |

---

## 5. Model Registry & Serving

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/models/register` | `Admin` | Registers winning model from experiment into registry with monotonic versioning (`v1`, `v2`, ...). |
| `GET` | `/api/v1/models` | `Inference` | Lists all registered model families, active lifecycle stages, and version counts. |
| `GET` | `/api/v1/models/{name}` | `Inference` | Retrieves all version records and audit history logs for a model family. |
| `GET` | `/api/v1/models/{name}/versions/{v}` | `Inference` | Detailed specification, validation metrics, and audit trail for a specific model version. |
| `POST` | `/api/v1/models/{name}/versions/{v}/stage` | `Admin` | Transitions lifecycle stage (`Development`, `Staging`, `Production`, `Archived`) with single-production exclusivity. |
| `GET` | `/api/v1/serving/models` | `Inference` | Lists registered model families with active serving version, stage, and serving eligibility. |
| `GET` | `/api/v1/serving/models/{name}/versions/{v}` | `Inference` | Inspects served model input schema, numeric/categorical split, probability support, and memory cache state. |
| `GET` | `/api/v1/serving/models/{name}/versions/{v}/health` | `Inference` | Real-time cryptographic integrity check and memory cache verification for a served model version. |
| `POST` | `/api/v1/serving/models/{name}/predict` | `Inference` | Low-latency inference using the active `Production` (or `Staging`) model version. |

---

## 6. Research Benchmarking & Optimization

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/benchmarks/compare` | `Inference` | Side-by-side comparison across experiments with comparability audit (fingerprint, split, seed checks). |
| `POST` | `/api/v1/benchmarks/repeated-runs` | `Inference` | Executes repeated-seed series (2–10 seeds) with Student-t and non-parametric bootstrap confidence intervals. |
| `GET` | `/api/v1/benchmarks/dataset-catalog` | `Inference` | Lists curated research benchmark fixtures (`wine_multiclass`, `diabetes_regression`, `breast_cancer_binary`). |
| `POST` | `/api/v1/benchmarks/robust` | `Inference` | Multi-seed matched benchmarking with Wilcoxon signed-rank, paired t-tests, and memory RSS profiling. |
| `GET` | `/api/v1/benchmarks/hpo/spaces` | `Inference` | Lists default hyperparameter search spaces for classification and regression estimators. |
| `POST` | `/api/v1/benchmarks/hpo` | `Admin` | Executes Optuna Bayesian TPE or Random search across specified hyperparameter bounds. |
| `POST` | `/api/v1/benchmarks/multi-objective` | `Inference` | Computes Pareto frontier (accuracy vs. latency vs. model size) and selects candidates via Utopia distance. |

---

## 7. Pipeline Orchestration & Model Monitoring

| Method | Endpoint | Required Role | Summary & Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/pipelines` | `Admin` | Validates configuration and launches an asynchronous end-to-end AutoML pipeline run. |
| `GET` | `/api/v1/pipelines` | `Inference` | Queries paginated pipeline runs with status (`pending`, `running`, `succeeded`, `failed`, `cancelled`) filters. |
| `GET` | `/api/v1/pipelines/{id}` | `Inference` | Retrieves execution timeline, stage progression, and provenance metrics for a pipeline run. |
| `GET` | `/api/v1/pipelines/{id}/events` | `Inference` | Chronological execution event stream for real-time tracking and post-mortem analysis. |
| `POST` | `/api/v1/pipelines/{id}/cancel` | `Admin` | Cooperatively cancels an in-flight pipeline execution worker job. |
| `POST` | `/api/v1/pipelines/{id}/retry` | `Admin` | Re-executes a failed or cancelled pipeline job. |
| `GET` | `/api/v1/monitoring/overview` | `Inference` | Consolidated monitoring overview: active telemetry counts, baseline profiles, and drift alerts. |
| `POST` | `/api/v1/monitoring/reference-profiles` | `Admin` | Generates statistical reference baseline profile from a dataset for continuous drift monitoring. |
| `POST` | `/api/v1/monitoring/drift/analyze` | `Inference` | Analyzes inference telemetry against reference baseline via Kolmogorov-Smirnov (KS-test) and PSI. |
| `POST` | `/api/v1/monitoring/retraining/trigger` | `Admin` | Triggers retraining candidate pipeline run gated against incumbent production performance. |
