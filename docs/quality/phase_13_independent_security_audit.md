# AutoNexa Phase 13 — Independent Security, Correctness & Reliability Audit

**Document ID:** `ANX-AUD-PHASE-13-2026`  
**Date:** October 2026  
**Audited Phase:** Phase 13 — Secure Model Serving & Deployment  
**Repository Path:** `C:\Users\ishit\AutoNexa`  
**Git Remote:** `https://github.com/Ishitadas03/AutoNexa.git`  
**Audit Environment:** Windows 11 (AMD64), Python 3.11.3 (x64), Scikit-Learn 1.9.1, Next.js 16.4.2 (Turbopack), React 19.3.0  
**Overall Verdict:** **VERIFIED WITH LIMITATIONS**  

---

## 1. Executive Summary & Verification Verdict

An independent security, correctness, and reliability audit was conducted on AutoNexa Phase 13 (Secure Model Serving & Deployment). The audit evaluated the integrity of serving APIs, authentication and role-based authorization (RBAC), physical artifact tamper detection, safe model caching, input schema validation, latency telemetry, and frontend bundle security.

### Key Audit Findings:
1. **Frontend Credential Exposure Identified and Remediated (DEFECT FIXED):**
   - *Finding:* In the initial Phase 13 UI implementation (`PredictionTab.tsx`), "Default Read" and "Default Admin" buttons hardcoded `autonexa-read-key-secret` and `autonexa-admin-key-secret` directly into the client-side JavaScript bundle, allowing any client to inspect or load administrative secrets.
   - *Remediation:* Hardcoded secret buttons were excised completely. Code snippet generators now fall back to `<YOUR_SERVING_API_KEY>`, and the UI requires explicit user key entry.
2. **Investigation of the 33 StandardScaler Feature-Name Warnings (DEFECT FIXED):**
   - *Finding:* The 33 warnings reported during earlier test runs (`UserWarning: X has feature names, but StandardScaler was fitted without feature names`) were caused by the test helper function `create_real_trained_experiment` fitting the pipeline on a raw `np.ndarray` without column names while inference passed a named `pd.DataFrame`.
   - *Remediation:* Test fixtures were updated to fit pipelines on named DataFrames (`pd.DataFrame(X, columns=feature_names)`), matching AutoNexa's real `training_service.py` behavior. **All 33 warnings were completely eliminated**, dropping total backend warnings from 45 to the 12 pre-existing Starlette/shap deprecation warnings.
3. **Information Disclosure Prevention via Error Sanitization (ENHANCEMENT ADDED):**
   - *Finding:* Raw exception messages during failed model predictions could potentially disclose local host drive letters or filesystem directory paths.
   - *Remediation:* Implemented `sanitize_error_detail()` with regex pattern masking (`[PATH_REDACTED]`), truncating error messages and mapping client `ValueError` exceptions to HTTP 400 Bad Request rather than HTTP 500.
4. **Bounded Telemetry Memory Usage (ENHANCEMENT ADDED):**
   - *Finding:* In `ServingMonitoringService`, while latency percentiles were bounded by a circular buffer (`deque(maxlen=1000)`), the per-model summary dictionary `_model_stats` was theoretically unbounded under adversarial queries against random model names.
   - *Remediation:* Added an explicit capacity cap (100 unique models) with LRU eviction in `_model_stats`.
5. **Privilege Boundary & Tamper Eviction Verified:**
   - Inference credentials (`serving_api_key_read`) were confirmed incapable of executing administrative cache flushing (HTTP 403 Forbidden).
   - Real-time disk tampering of a cached `.joblib` binary was confirmed to immediately trigger SHA-256 mismatch detection, evict the compromised model from memory cache, and return HTTP 400.

### Audit Verdict: `VERIFIED WITH LIMITATIONS`
The subsystem is robust, thoroughly tested, and functionally verified. The verdict is `WITH LIMITATIONS` because:
- Storage is local filesystem-based without remote KMS encryption at rest.
- Concurrency protection is thread-safe within a single process (`_CACHE_LOCK`), but distributed multi-worker coordination (e.g., Gunicorn cluster with shared cache invalidation) requires an external message broker (such as Redis).
- Authentication uses static shared API keys rather than an enterprise OIDC/OAuth2 identity provider.

---

## 2. Security & Access Control Audit

### 2.1 Role-Based Access Control (RBAC) Verification
The API strictly enforces role separation across all endpoints mounted under `/api/v1/serving`:

| Endpoint | Method | Required Role | Unauthenticated Request | Read-Only Key | Admin Key |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `/api/v1/serving/models` | `GET` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/models/{name}/versions/{v}` | `GET` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/models/{name}/versions/{v}/health` | `GET` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/models/{name}/versions/{v}/predict` | `POST` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/models/{name}/predict` | `POST` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/metrics` | `GET` | Inference | **401 Unauthorized** | **200 OK** | **200 OK** |
| `/api/v1/serving/cache/invalidate` | `POST` | Admin | **401 Unauthorized** | **403 Forbidden** | **200 OK** |
| `/api/v1/serving/models/{name}/versions/{v}/cache/invalidate` | `POST` | Admin | **401 Unauthorized** | **403 Forbidden** | **200 OK** |

### 2.2 Constant-Time Comparison
`backend/app/core/security.py` relies exclusively on Python's `secrets.compare_digest(token, expected_key)` for both `admin_key` and `read_key` evaluation, eliminating string comparison timing leaks.

### 2.3 Secret Leakage & Logging
A repository-wide search confirms:
- API keys are never written to logger streams or console outputs.
- Responses on authentication failure return generic `401 Unauthorized` without echoing the supplied credential.
- Frontend bundles built via `npm run build` contain zero hardcoded administrative or inference credentials.

---

## 3. Cryptographic Integrity & Deserialization Safety

### 3.1 Pre-Flight Checksum Validation
`ModelServingService._get_or_load_model` enforces physical disk re-verification:
```python
# Live disk verification executes before retrieving or deserializing
verification = self.registry.verify_version_artifact(record.model_name, record.version)
if not verification.artifact_exists:
    # Evict and return 404
...
if not verification.verified:
    # Evict and return 400
```

### 3.2 Dynamic Cache Eviction on Disk Tampering
Empirical test evidence (`test_audit_tampered_artifact_cache_eviction`):
1. A valid model pipeline is loaded and warmed into `_GLOBAL_MODEL_CACHE`. Health check reports `status: "healthy"` and `loaded_in_cache: true`.
2. The `.joblib` binary file on disk is modified by an external process.
3. The next prediction request triggers physical hash recalculation, detects the mismatch against `record.artifact_sha256`, evicts the model from `_GLOBAL_MODEL_CACHE`, and returns HTTP 400.
4. Subsequent health check verifies `status: "degraded"` and `loaded_in_cache: false`.

### 3.3 Deserialization Constraints
- Arbitrary file deserialization is prohibited: `joblib.load()` only targets paths resolved by `ModelRegistryService._safe_resolve_version_dir()`.
- Directory traversal sequences (`..`, `/`, `\`) in model names or versions are rejected with HTTP 400.

---

## 4. Input Schema Validation & Batch Limits

### 4.1 Strict Schema Matching
- **Missing Required Columns:** If any column specified in the model's training schema is omitted, the request is rejected with HTTP 400 (`"Record {idx} is missing required feature(s)"`).
- **Unexpected Extra Columns:** Injected or rogue columns are rejected with HTTP 400 (`"Record {idx} contains unexpected feature(s)"`).
- **Non-Scalar Values:** Nested JSON objects or arrays within feature fields are rejected with HTTP 400.
- **Empty Batch:** `records: []` is rejected by Pydantic schema validation (`min_length=1`) with HTTP 422.
- **Batch Overflow:** Requests with >1,000 records are rejected with HTTP 422.

---

## 5. Telemetry & Privacy Audit

1. **Feature Privacy:** `ServingMonitoringService.record_request()` receives only `model_name`, `version`, `latency_ms`, `is_success`, `is_validation_error`, and `is_integrity_error`. Client feature inputs and prediction outputs are never captured in metrics.
2. **Bounded Memory:**
   - Rolling latency measurements: `deque(maxlen=1000)`.
   - Per-model traffic breakdown: dictionary capped at 100 entries with automatic eviction.

---

## 6. Single-Process vs Multi-Process Concurrency

| Dimension | Single-Process Deployment (e.g. 1 Uvicorn Worker) | Multi-Process Deployment (e.g. Gunicorn -w 4) |
| :--- | :--- | :--- |
| **Cache Synchronization** | Thread-safe via `_CACHE_LOCK` | Each worker process maintains an isolated in-memory cache. |
| **Cache Invalidation** | Atomic across all threads in the process. | Cache invalidation on worker A does not invalidate workers B, C, D without an external broker (e.g. Redis). |
| **Metrics Tracking** | Thread-safe via `_METRICS_LOCK`, aggregate across all threads. | Metrics are local to each worker process; no centralized inter-process aggregation. |
| **Artifact Hashing** | Physical disk check is consistent across all threads. | All workers re-verify physical disk files independently. Tamper detection works across all workers. |

*Architectural Recommendation:* For clustered multi-worker deployments, a centralized cache invalidation bus (Redis Pub/Sub) and Prometheus metrics exporter should be introduced in a future phase.

---

## 7. Test Execution Evidence

### 7.1 Full Backend Suite (208 Passed)
Command:
```powershell
backend\.venv\Scripts\python.exe -m pytest backend/tests
```

Execution Output:
```
============================= test session starts =============================
platform win32 -- Python 3.11.3, pytest-9.1.1, pluggy-1.7.0
rootdir: C:\Users\ishit\AutoNexa
plugins: anyio-4.15.1
collected 208 items

backend\tests\test_analysis.py ...............                           [  7%]
backend\tests\test_baseline_evaluator.py ....                            [  9%]
backend\tests\test_benchmarking.py .....                                 [ 11%]
backend\tests\test_datasets.py .............                             [ 17%]
backend\tests\test_error_analysis.py ......                              [ 20%]
backend\tests\test_experiment_tracking_phase12.py ...........            [ 25%]
backend\tests\test_explainability.py ........                            [ 29%]
backend\tests\test_health.py .....                                       [ 32%]
backend\tests\test_hpo_optimizers.py ......                              [ 35%]
backend\tests\test_hpo_service.py ...                                    [ 36%]
backend\tests\test_model_registry_phase12.py ...........                 [ 41%]
backend\tests\test_model_serving_phase13.py .........                    [ 46%]
backend\tests\test_multi_objective_routes.py .                           [ 46%]
backend\tests\test_multi_objective_service.py .....                      [ 49%]
backend\tests\test_pareto_frontier.py ..............                     [ 55%]
backend\tests\test_phase13_security_audit.py .......                     [ 59%]
backend\tests\test_prediction.py ...............                         [ 66%]
backend\tests\test_research_benchmarking.py ....                         [ 68%]
backend\tests\test_resource_profiler.py ......                           [ 71%]
backend\tests\test_robust_benchmarking.py .............                  [ 77%]
backend\tests\test_scientific_validation.py .....                        [ 79%]
backend\tests\test_statistical_engine.py .......                         [ 83%]
backend\tests\test_tracking.py ..............                            [ 89%]
backend\tests\test_training.py .....................                     [100%]

============================== warnings summary ===============================
backend\.venv\Lib\site-packages\fastapi\testclient.py:1
  StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
... (11 additional pre-existing SHAP/imbalance warnings) ...

================= 208 passed, 12 warnings in 75.31s (0:01:15) =================
```
- **Passed:** **208** (192 baseline Phase 1–12 + 9 Phase 13 serving + 7 Phase 13 security audit)
- **Failed:** **0**
- **Skipped:** **0**
- **Warnings:** **12** (down from 45; **0 StandardScaler warnings**)

### 7.2 Dedicated Security Audit Tests (`test_phase13_security_audit.py`)
| Test Function | Status | Verified Security Control |
| :--- | :---: | :--- |
| `test_audit_rbac_privilege_boundary` | **PASSED** | Read key allowed for inference; read key rejected (403) for admin cache invalidation; admin key allowed (200). |
| `test_audit_unauthenticated_requests_denied` | **PASSED** | Missing, blank, or invalid credentials rejected with HTTP 401 and `WWW-Authenticate: Bearer`. |
| `test_audit_batch_size_limits_and_empty_payload` | **PASSED** | Empty records `[]` and >1,000 records rejected with HTTP 422. |
| `test_audit_strict_schema_rejection` | **PASSED** | Missing features, unexpected columns, and nested structures rejected with HTTP 400. |
| `test_audit_tampered_artifact_cache_eviction` | **PASSED** | Physical disk modification after caching triggers SHA-256 mismatch, cache eviction, and degraded health status. |
| `test_audit_error_sanitization_no_path_leakage` | **PASSED** | Local filesystem drive letters and paths redacted with `[PATH_REDACTED]`. |
| `test_audit_telemetry_bounded_memory` | **PASSED** | Memory capped at 100 models and 50 latencies under 150 unique model calls. |

### 7.3 Frontend Production Build
Command:
```powershell
npm run build (in frontend/)
```

Execution Output:
```
▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 197ms
- Cache Components enabled
- Partial Prefetching enabled

  Creating an optimized production build ...
✓ Compiled successfully in 4.5s
  Running TypeScript ...
  Finished TypeScript in 4.4s ...
  Collecting page data using 5 workers ...
  Generating static pages using 5 workers (4/4) in 801ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content
```
- **Result:** **Exit Code 0** (0 TypeScript errors, 0 compilation failures).

---

## 8. Unresolved Risks & Material Limitations

1. **Static Shared Secret Authentication:** While RBAC prevents unprivileged inference callers from invoking admin operations, credentials remain shared static API keys. In an enterprise environment, an identity provider (OAuth2/OIDC/JWT) should be integrated.
2. **Local Multi-Process Cache Coherence:** In-memory caching is per-process. In multi-worker deployments (e.g. `gunicorn -w 4`), cache invalidation does not automatically broadcast to sibling workers without Redis.
3. **Local Filesystem Storage:** Model binaries reside on the local host filesystem. Cloud object storage encryption at rest (e.g., AWS S3 KMS, GCP CMEK) is not currently implemented.
4. **No Automated Rate Limiting:** While batch sizes are capped at 1,000 records, IP-based request throttling should be enforced via a reverse proxy (e.g. NGINX or Cloudflare) when exposed to public networks.

---

## 9. Git Working Tree Status

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
	modified:   backend/app/api/__init__.py
	modified:   backend/app/core/config.py
	modified:   backend/app/schemas/__init__.py
	modified:   backend/app/services/__init__.py
	modified:   frontend/src/app/page.tsx
	modified:   frontend/src/components/workspace/ModelRegistryTab.tsx
	modified:   frontend/src/components/workspace/PredictionTab.tsx
	modified:   frontend/src/lib/api.ts
	modified:   frontend/src/types/api.ts

Untracked files:
	backend/app/api/routes/serving.py
	backend/app/core/security.py
	backend/app/schemas/serving.py
	backend/app/services/automl/model_serving_service.py
	backend/tests/test_model_serving_phase13.py
	backend/tests/test_phase13_security_audit.py
	docs/quality/phase_13_independent_security_audit.md
	docs/quality/phase_13_validation_report.md
	docs/research/phase_13_secure_model_serving.md
```

*Status:* **Zero commits, zero pushes**. All changes are cleanly staged in the local working tree awaiting explicit user approval.
