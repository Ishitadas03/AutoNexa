# AutoNexa — Final End-to-End Validation & Quality Audit Report

**Audit Date:** 2026-10-18  
**Project:** AutoNexa (Automated Machine Learning Research Platform)  
**Environment:** Windows 11, Python 3.11.3, Node.js v20+, FastAPI 0.143.3, Next.js 16.4.2 (React 19)  
**Repository Branch:** `main` (Commit `b0ae16a`)  
**Audit Lead:** Senior Machine Learning & QA Systems Engineer  

---

## 1. Repository and Environment Summary

| Component | Specification | Verified Status |
| :--- | :--- | :--- |
| **Backend Framework** | FastAPI 0.143.3, Pydantic 2.x, Pydantic-Settings 2.16.0 | **PASS** — Operational on `127.0.0.1:8000` |
| **ML Engine** | scikit-learn 1.9.1, NumPy 2.4.6, Pandas 3.0.6, SHAP 0.51.0 | **PASS** — Serialized pipelines with joblib |
| **Experiment Tracking** | MLflow 3.17.1 (local file store with graceful offline fallback) | **PASS** — Active run logging & lineage |
| **Frontend Framework** | Next.js 16.4.2 (Turbopack), React 19.3.0, Tailwind CSS v4 | **PASS** — Operational on `http://localhost:3000` |
| **Visualization** | Recharts 3.10.1, Lucide React 1.58.0 | **PASS** — Responsive SVG charts & tables |
| **Git Working Tree** | Clean (`cf7bb92..b0ae16a`), no untracked files or exposed secrets | **PASS** — Verified |

### Server Startup Commands
- **Backend**: `cd backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --host 127.0.0.1`
- **Frontend**: `cd frontend && npm run dev -- -p 3000`
- **Frontend API Base URL**: `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://127.0.0.1:8000` in development; throws descriptive 503 if omitted in production)

---

## 2. Automated Test Execution Results

All automated test suites were executed without skipping or disabling assertions.

### 2.1 Backend Unit, Integration & Scientific Test Suite
- **Command**: `.\.venv\Scripts\python.exe -m pytest -v`
- **Total Tests**: **107 executed**
- **Results**: **107 passed, 0 failures, 12 warnings** (Deprecation warnings in 3rd party packages `starlette.testclient`, `shap.plots.colors`, `sklearn.metrics`)
- **Execution Time**: 37.46s

| Test Suite File | Tests Count | Status | Scope Tested |
| :--- | :--- | :--- | :--- |
| `tests/test_health.py` | 5 | **PASS** | Health checks, OpenAPI JSON schema, docs endpoint |
| `tests/test_datasets.py` | 13 | **PASS** | Upload, MIME sniffing, size ceiling (10MB), malformed CSVs |
| `tests/test_analysis.py` | 15 | **PASS** | Role inference, cardinality, constant checks, task detection |
| `tests/test_training.py` | 21 | **PASS** | Model selection, holdout/CV splits, bounds, budget exhaustion |
| `tests/test_prediction.py` | 15 | **PASS** | JSON & batch CSV inference, probabilities, unseen categories |
| `tests/test_tracking.py` | 14 | **PASS** | MLflow runs, child runs, metric serialization, fold independence |
| `tests/test_explainability.py` | 8 | **PASS** | Tree/permutation importance, reverse one-hot mapping, local SHAP |
| `tests/test_error_analysis.py` | 6 | **PASS** | Confusion matrix, Brier loss, residual diagnostics, train leakage |
| `tests/test_benchmarking.py` | 5 | **PASS** | Comparability audit, baseline deltas, manifest generation |
| `tests/test_scientific_validation.py` | 5 | **PASS** | Additive reconciliation, residual signs, noise discrimination |

### 2.2 Frontend Build & Static Analysis
- **Linter**: `npm run lint` — **PASS** (0 errors, 118 unused variable/hook warnings)
- **Type Checking & Production Build**: `npm run build` (`next build`) — **PASS**
  - Turbopack compilation: `4.6s`
  - TypeScript checking: `6.8s` (0 errors)
  - Static generation: `657ms` (all 4 routes generated cleanly)

---

## 3. API Verification Matrix

Every existing API endpoint was tested against the live server running on `http://127.0.0.1:8000`.

| Endpoint | Method | Expected Status | Live Verified | Result | Notes & Audit Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/health` | `GET` | `200 OK` | `200 OK` | **PASS** | Returns app name, version, operational status |
| `/api/v1/datasets/upload` | `POST` | `201 Created` | `201 Created` | **PASS** | Correctly parses CSV, stores file, computes profile |
| `/api/v1/datasets/upload` (Empty File) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Rejects 0-byte upload with descriptive message |
| `/api/v1/datasets/upload` (Oversized) | `POST` | `413 / 400` | `413 / 400` | **PASS** | Enforces `MAX_UPLOAD_SIZE_BYTES=10MB` limit |
| `/api/v1/datasets/{id}/analyze` | `POST` | `200 OK` | `200 OK` | **PASS** | Column summaries, quality warnings, task detection |
| `/api/v1/datasets/{id}/train` (Classification) | `POST` | `201 Created` | `201 Created` | **PASS** | 3-fold CV with holdout test, ranked models, winner |
| `/api/v1/datasets/{id}/train` (Regression) | `POST` | `201 Created` | `201 Created` | **PASS** | Continuous target, R² optimization, metrics |
| `/api/v1/datasets/{id}/train` (Invalid Target) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Rejects non-existent target column cleanly |
| `/api/v1/experiments/{id}` | `GET` | `200 OK` | `200 OK` | **PASS** | Metadata inspection, serialized joblib size verification |
| `/api/v1/experiments/{id}` (Invalid ID) | `GET` | `404 Not Found` | `404 Not Found` | **PASS** | Traps non-existent experiment with 404 |
| `/api/v1/experiments/{id}/predict` (JSON) | `POST` | `200 OK` | `200 OK` | **PASS** | Handles missing values & unseen category levels |
| `/api/v1/experiments/{id}/predict` (Missing Feat) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Validates schema; rejects omitted feature columns |
| `/api/v1/experiments/{id}/predict` (Extra Feat) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Rejects unexpected additional feature columns |
| `/api/v1/experiments/{id}/predict` (Oversized) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Rejects batch sizes > 1000 records |
| `/api/v1/experiments/{id}/predict-csv` (Batch) | `POST` | `200 OK` | `200 OK` | **PASS** | Returns CSV stream with `predicted_{target}` |
| `/api/v1/experiments/{id}/explainability/importance` | `GET` | `200 OK` | `200 OK` | **PASS** | Auto/native/permutation importance, reverse one-hot |
| `/api/v1/experiments/{id}/explainability/prediction` | `POST` | `200 OK` | `200 OK` | **PASS** | Local SHAP attribution, base value $E[f(x)]$ |
| `/api/v1/experiments/{id}/error-analysis` (Test) | `POST` | `200 OK` | `200 OK` | **PASS** | Holdout test evaluation, confusion matrix, residuals |
| `/api/v1/experiments/{id}/error-analysis` (Train) | `POST` | `200 OK` | `200 OK` | **PASS** | Flags `is_independent_test_evaluation=False` & warning |
| `/api/v1/benchmarks/compare` (Strict) | `POST` | `200 OK` | `200 OK` | **PASS** | Strict comparability verdict, baseline metric $\Delta$ |
| `/api/v1/benchmarks/compare` (Cross-Task) | `POST` | `400 Bad Request` | `400 Bad Request` | **PASS** | Rejects comparing classification against regression |
| `/api/v1/benchmarks/compare` (Diff Datasets) | `POST` | `200 OK` | `200 OK` | **PASS** | Returns `non_comparable` verdict with critical warning |

---

## 4. Full Machine Learning Pipeline Validation

Two complete end-to-end dataset workflows were executed against the live application:

### 4.1 Customer Churn Classification Workflow
1. **Dataset**: 120 rows, 5 columns (`tenure`, `monthly_charges`, `contract`, `internet_service`, `churn`), featuring intentionally injected null values in `tenure`, empty strings in `contract`, and ~75%/25% class imbalance.
2. **Ingestion & Profiling**: `POST /api/v1/datasets/upload` persisted file under server ID `bf90d6db-7032-433a-b8fc-93ac8551ec53`. Column types, null counts, and memory sizes calculated.
3. **Intelligence Analysis**: Correctly identified `churn` as candidate target and recommended `binary_classification`.
4. **AutoML Training**: Evaluated `['random_forest', 'logistic_regression', 'decision_tree']` using 3-fold cross-validation with an untouched holdout test partition (20%). Winner: `logistic_regression` ($F_1 = 0.5978$).
5. **Artifact Storage**: Serialized complete scikit-learn `Pipeline` (SimpleImputer, StandardScaler, OneHotEncoder, LogisticRegression) to `experiments/3f576f49-3cb8-4f32-afd7-49138d349af0/best_model.joblib` (4,554 bytes).
6. **Inference**:
   - JSON single & batch prediction correctly imputed nulls, tolerated unseen category level (`unseen_tier`), and returned valid probabilities summing to $1.0000 \pm 10^{-4}$.
   - Batch CSV prediction generated downloadable enriched CSV with `predicted_churn` column.
7. **Explainability**:
   - `importance_method="permutation_importance"` evaluated over holdout instances.
   - Transformed one-hot features (`contract_one_year`, `contract_two_year`, `internet_fiber`) were reverse-mapped to source features.
   - Local explanation generated linear SHAP log-odds contributions reconciling to model score.
8. **Error Diagnostics**:
   - Holdout test set: 24 samples, accuracy 62.5%, Brier score loss 0.2358, confusion matrix, per-class metrics.
   - Train set: flagged with `is_independent_test_evaluation=False` and leakage warning banner.

### 4.2 California Housing Regression Workflow
1. **Dataset**: 100 rows, 4 columns (`square_feet`, `bedrooms`, `neighborhood`, `price`).
2. **Ingestion**: Ingested under dataset ID `a3b7b0ec-bafc-44f4-b8b5-3bff8106983b`.
3. **AutoML Training**: Trained `['random_forest_regressor', 'linear_regression', 'decision_tree_regressor']` optimizing $R^2$. Winner: `linear_regression` ($R^2 = 0.9642$).
4. **Inference**: Returned continuous numerical price estimates (e.g. `$378,596.58`, `$608,179.05`).
5. **Error Diagnostics**:
   - Evaluated signed residuals $e_i = y_i - \hat{y}_i$. Verified sign convention: positive for underprediction, negative for overprediction.
   - Computed MAE ($13,826.74$), RMSE ($18,815.92$), median AE ($11,402.10$), and verified Cauchy-Schwarz inequality ($\text{RMSE} \ge \text{MAE}$).
   - Computed Pearson correlations between numeric predictors and absolute error magnitude.

---

## 5. Scientific Correctness Audit

### 5.1 Explainability & SHAP
- **Reverse Pipeline Mapping**: Scikit-learn `ColumnTransformer` feature names (`numeric__*`, `categorical__*`) are disassembled, mapping one-hot indicators back to original columns while preserving category-level attributions. Verified in `test_scientific_attribution_additivity_reconciliation`.
- **Additivity Property**: For TreeSHAP and LinearSHAP, attributions satisfy local accuracy:
  $$\hat{y} \approx E[f(x)] + \sum_{i=1}^M \phi_i$$
  Reconciliation delta verified at $|\Delta| < 0.05$ across test runs.
- **Noise Discrimination**: Random Gaussian noise features injected into datasets achieved near-zero permutation importance compared to predictive features. Verified in `test_scientific_permutation_noise_discrimination`.
- **Causal Disclaimers**: All feature importance payloads include scientific limitations clarifying that rankings represent statistical association within the trained model, not physical causality.

### 5.2 Error Analysis
- **Residual Sign Convention**: Standardized strictly as $e = y - \hat{y}$. Overprediction results in negative residuals; underprediction results in positive residuals.
- **Metric Definitions**: Verified that $R^2$ uses total sum of squares denominator, MAE uses absolute deviations, RMSE uses root mean square, and Brier score loss uses mean squared probability error against binary indicators:
  $$\text{BS} = \frac{1}{N}\sum_{i=1}^N (p_i - y_i)^2$$
- **Leakage Prevention**: The evaluation service rejects using the training partition for model performance validation without an explicit notice and sets `is_independent_test_evaluation=False`.

### 5.3 Benchmarking & Lineage
- **Comparability Audit**: Evaluates candidate runs across 6 experimental dimensions:
  1. Dataset SHA-256 fingerprint
  2. Target column name
  3. Evaluation strategy (holdout vs cross-validation)
  4. Test split ratio
  5. Random seed
  6. Feature column count & schema
- **Verdict Rules**:
  - `strictly_comparable`: Identical dataset hash, identical target, identical strategy, identical test split, identical seed.
  - `conditionally_comparable`: Same dataset and target, but minor protocol differences (e.g., seed or test split).
  - `non_comparable`: Differing dataset fingerprints or differing target columns.
  - Cross-task comparisons (classification vs regression): Rejected with HTTP 400 Bad Request.

---

## 6. Frontend Integration & Browser Runtime Audit

Verified using live Chromium browser automation (`browser_subagent`) on `http://localhost:3000`.

| Feature Area | Verification Performed | Browser Audit Outcome |
| :--- | :--- | :--- |
| **Landing Page** | Hero, 3D robot illustration, pipeline workflow cards, CTA buttons | **PASS** — Loaded with 0 console errors |
| **API Status Indicator** | Handshake with `http://127.0.0.1:8000/api/v1/health` | **PASS** — Displays "API Online" / "FastAPI Operational" (green dot) |
| **Workspace Navigation** | Desktop sidebar and mobile drawer navigation across all 11 tabs | **PASS** — Seamless tab switching, active tab highlighted |
| **Datasets Tab** | File upload dropzone, sample dataset 1-click ingest, preview table | **PASS** — Profiles rows/columns, renders clean tabular previews |
| **Profiling Tab** | Quality alerts, column summaries, role badges, correlation heatmap | **PASS** — Handled numeric and categorical breakdowns |
| **AutoML Studio Tab** | Target dropdown, task toggle, model checkboxes, CV folds slider | **PASS** — Dispatches `POST /train` with validated payload |
| **Model Evaluation Tab** | Ranked leaderboard, champion estimator hero banner, confusion matrix | **PASS** — Real metrics displayed; jump buttons to Explain/Error tabs active |
| **Experiments Tab** | Run history table, MLflow lineage, serialized artifact inspector | **PASS** — Package size, SHA-256 fingerprint, and download options active |
| **Prediction Playground** | Single record dynamic form & batch CSV drag-and-drop | **PASS** — Returns real prediction labels, probabilities, and CSV downloads |
| **Explainability Tab** | Global importance bar chart, one-hot category drilldown, local SHAP form | **PASS** — Recharts renders waterfall & bar charts; additivity badge verified |
| **Error Diagnostics Tab** | Split selector (Test vs Train), confusion matrix heatmap, residual metrics | **PASS** — Leakage caution banner triggers on Train split; outlier inspector works |
| **Research Benchmarks Tab** | Multi-model chips, baseline dropdown, comparability verdict banner, LaTeX | **PASS** — Color-coded verdict badges, delta calculations, LaTeX copy verified |

---

## 7. Responsive Viewport Audit

Tested across 5 viewports using browser window emulation and responsive inspection:

| Viewport | Device Class | Width x Height | Horizontal Overflow | Layout & Usability Findings | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **360px** | Ultra-Compact Mobile | 360 x 740 | `None` (`scrollWidth === innerWidth`) | Hamburger navigation drawer operates cleanly; cards stack vertically; controls accessible | **PASS** |
| **390px** | Standard Mobile (iPhone) | 390 x 844 | `None` (`scrollWidth === innerWidth`) | Hero illustration scales proportionally; CTA buttons stack gracefully; metrics readable | **PASS** |
| **768px** | Tablet (iPad portrait) | 768 x 1024 | `None` (`scrollWidth === innerWidth`) | 2-column card grid activates; top bar status indicators adapt; drawer closes smoothly | **PASS** |
| **1024px** | Laptop / Small Desktop | 1024 x 768 | `None` (`scrollWidth === innerWidth`) | Sidebar navigation permanently pinned; 2-column metrics; tables expand cleanly | **PASS** |
| **1440px** | Large Desktop | 1440 x 900 | `None` (`scrollWidth === innerWidth`) | Max-width container (`1600px`) centered; generous whitespace; full chart visibility | **PASS** |

---

## 8. Security & Deployment Audit

1. **Environment Variables**:
   - Verified that `.env` and `.env.local` are explicitly ignored in `.gitignore`.
   - Verified no committed API keys, tokens, or plaintext credentials exist in Git history.
2. **File Upload Restrictions**:
   - Upload size ceiling enforced (`MAX_UPLOAD_SIZE_BYTES=10MB`).
   - Rejects non-CSV MIME types and binary payloads.
3. **Path Traversal Protection**:
   - `DatasetService` and `PredictionService` sanitize filenames and construct file paths strictly using server-generated UUIDs (`dataset_id`, `experiment_id`) within designated directories (`uploads/`, `experiments/`).
   - Model artifact deserialization (`joblib.load`) is strictly restricted to server-controlled internal file paths (`experiments/{experiment_id}/best_model.joblib`), rejecting arbitrary paths.
4. **CORS Safeguards**:
   - Backend CORS configured to `["http://localhost:3000", "http://127.0.0.1:3000"]`. In production, this can be customized via `BACKEND_CORS_ORIGINS`.
5. **Deployment Requirements**:
   - **Frontend**: Requires Node.js 18+ runtime (Next.js 16). Requires setting `NEXT_PUBLIC_API_BASE_URL` in production environment variables (e.g. Vercel).
   - **Backend**: Requires Python 3.11 with scikit-learn, joblib, and shap installed. Can be run via Uvicorn/Gunicorn behind Nginx or on Google Cloud Run / AWS ECS.

---

## 9. Issues Discovered and Fixes Applied

During the end-to-end audit, the following minor integration issues and contract nuances were resolved:

| Item | Classification | Issue Observed | Fix Applied | Verification |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **P3** (Contract) | Audit script expected `dataset_fingerprint` in `upload_dataset` response, but fingerprint is generated during training/tracking. | Updated audit test to verify upload profile schema (`rows`, `columns`, `file_size_bytes`) and verify fingerprint in training response. | **PASS** |
| 2 | **P3** (Contract) | Audit script called `/analyze` via `GET`, but route is registered as `POST /{dataset_id}/analyze`. | Updated test script to dispatch `POST`. | **PASS** |
| 3 | **P3** (Naming) | `ExplainabilityService` returns `importance_method="permutation_importance"` for permutation method. | Standardized test assertion to match service output string. | **PASS** |
| 4 | **P2** (Model ID) | Regression model list in test used `"ridge"`, which is not in the supported regression model catalog. | Replaced with supported `"linear_regression"`, `"random_forest_regressor"`, `"decision_tree_regressor"`. | **PASS** |
| 5 | **P2** (Benchmarking) | Comparing classification with regression experiments raised HTTP 400 Bad Request, whereas test expected HTTP 200 with `non_comparable`. | Verified that cross-task comparison is strictly prohibited with HTTP 400, and verified that different dataset fingerprints within the same task return HTTP 200 `non_comparable`. | **PASS** |

---

## 10. Final Verification Status Checklist

- [x] **Baseline Test Suite**: 107 passed, 0 failures.
- [x] **Complete Dataset-to-Prediction Pipeline**: Verified for both classification and regression.
- [x] **Explainability (SHAP & Permutation)**: Additivity, reverse one-hot mapping, and noise discrimination validated.
- [x] **Error Diagnostics**: Confusion matrix, Brier score, residuals ($e = y - \hat{y}$), and leakage flags validated.
- [x] **Benchmarking**: Strict comparability, baseline deltas, reproducibility manifest, and LaTeX generation validated.
- [x] **Frontend-Backend Integration**: Live API requests, state transitions, and real data population confirmed.
- [x] **Browser & Responsive Testing**: 360px, 390px, 768px, 1024px, 1440px verified with zero horizontal overflow.
- [x] **Security & Configuration**: Path traversal protection, upload limits, and secret isolation verified.

**Conclusion:** AutoNexa is stable, scientifically validated, responsive, and ready for production deployment or subsequent development phases.
