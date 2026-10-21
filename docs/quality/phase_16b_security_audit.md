# AutoNexa Phase 16B — Uniform API Security & Access Control Independent Audit

**Document ID:** `ANX-AUD-PHASE-16B-2026`  
**Date:** October 2026  
**Audited Phase:** Phase 16B — Uniform API Security & Access Control  
**Repository Path:** `C:\Users\ishit\AutoNexa`  
**Git Remote:** `https://github.com/Ishitadas03/AutoNexa.git`  
**Current Branch:** `main`  
**Audit Environment:** Windows 11 (AMD64), Python 3.11.3 (x64), Scikit-Learn 1.9.1, Next.js 16.4.2 (Turbopack), React 19.3.0  
**Overall Verdict:** **VERIFIED WITH LIMITATIONS**  

---

## 1. Executive Summary & Verification Verdict

An independent security and access control audit was conducted on AutoNexa Phase 16B. The audit verified the elimination of the authorization asymmetry identified during the Phase 16A architecture audit (`docs/research/phase_16_architecture_readiness_audit.md`).

Prior to Phase 16B, unauthenticated callers could trigger compute-intensive AutoML training jobs (`POST /api/v1/datasets/{id}/train`), delete experiment manifests (`DELETE /api/v1/experiments/{id}`), register unverified models (`POST /api/v1/models/register`), transition model stages (`POST /api/v1/models/{name}/versions/{v}/stage`), and launch unbounded benchmark workloads (`POST /api/v1/benchmarks/*`).

Phase 16B establishes uniform backend authentication and Role-Based Access Control (RBAC) across all backend routes using constant-time API key verification, fail-closed production configuration validation, comprehensive security regression testing, and aligned frontend API integration.

### Audit Verdict: `VERIFIED WITH LIMITATIONS`
All required Phase 16B security capabilities are implemented, tested, and empirically verified. The verdict is designated as `WITH LIMITATIONS` due to existing architectural constraints of the platform:
1. **Shared Static API Key Authentication:** Authentication relies on static shared secrets via the `X-API-Key` header rather than cryptographic user sessions, OAuth2/OIDC tokens, or short-lived mTLS client certificates.
2. **Browser Storage for Client Keys:** The frontend provides a convenient settings UI storing keys in browser `localStorage`. While ideal for single-user local workstations, multi-tenant enterprise deployments require server-side BFF (Backend-for-Frontend) token exchange to prevent exposing admin credentials to client-side scripts.
3. **Single-Node Rate Limiting Scope:** In-memory rate limiting and resource throttling are not yet distributed across multiple worker processes; multi-worker coordination requires an external cache/broker.

---

## 2. Endpoint-by-Endpoint Authorization Matrix

Every route registered in the AutoNexa FastAPI application was audited and tested. The final authorization matrix is as follows:

| Route Path | Method | Minimum Role | Unauthenticated Behavior | Read/Inference Key | Admin Key | Purpose & Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `/api/v1/health` | `GET` | **Public** | **200 OK** | **200 OK** | **200 OK** | Public health and liveness probe |
| `/api/v1/datasets/upload` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Uploads raw CSV dataset to server filesystem |
| `/api/v1/datasets/{id}/train` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Triggers CPU-intensive AutoML training |
| `/api/v1/datasets/{id}/analyze` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Computes statistical EDA and column profiles |
| `/api/v1/experiments` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Lists experiment run metadata |
| `/api/v1/experiments/{id}` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Retrieves experiment summary |
| `/api/v1/experiments/{id}/details` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Retrieves detailed metrics, confusion matrix |
| `/api/v1/experiments/compare` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Compares metrics across multiple runs |
| `/api/v1/experiments/{id}/reproducibility-manifest` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Inspects reproducibility parameters |
| `/api/v1/experiments/{id}/reproducibility-manifest/verify` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Checks disk checksums against manifest |
| `/api/v1/experiments/{id}/artifact` | `GET` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Downloads serialized model `.joblib` binary |
| `/api/v1/experiments/{id}` | `DELETE` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Destructive deletion of run files and models |
| `/api/v1/experiments/predict` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Real-time single record model inference |
| `/api/v1/experiments/predict-csv` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Batch tabular model inference |
| `/api/v1/experiments/explainability` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Feature importance and SHAP explanations |
| `/api/v1/experiments/error-analysis` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Error slicing and residual inspection |
| `/api/v1/models` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Lists registered models |
| `/api/v1/models/register` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Promotes experiment into versioned registry |
| `/api/v1/models/{name}` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Lists all versions of a named model |
| `/api/v1/models/{name}/versions/{v}` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Retrieves version record and schema |
| `/api/v1/models/{name}/versions/{v}/stage` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Transitions stage (`Production`, `Archived`) |
| `/api/v1/models/{name}/versions/{v}/download` | `GET` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Downloads registered model artifact |
| `/api/v1/models/{name}/versions/{v}/verify` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Verifies physical disk SHA-256 hash |
| `/api/v1/models/{name}/compare-versions` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Compares version performance metrics |
| `/api/v1/benchmarks/compare` | `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Compares benchmark results |
| `/api/v1/benchmarks/baseline-comparison`| `POST` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Evaluates baseline models (Dummy, Linear) |
| `/api/v1/benchmarks/repeated-runs` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Executes compute-heavy repeated seeds |
| `/api/v1/benchmarks/repeated-runs/{id}` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Queries repeated run statistical results |
| `/api/v1/benchmarks/hpo-experiment` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Runs resource-intensive HPO tuning search |
| `/api/v1/benchmarks/hpo-spaces` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Inspects available HPO search spaces |
| `/api/v1/benchmarks/multi-objective` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Generates multi-objective Pareto frontier |
| `/api/v1/benchmarks/multi-objective/{id}`| `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Queries Pareto candidates |
| `/api/v1/benchmarks/multi-objective/{id}/select` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Selects and materializes Pareto candidate |
| `/api/v1/benchmarks/dataset-catalog` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Reads dataset catalog |
| `/api/v1/benchmarks/robust` | `POST` | **Admin** | **401 Unauthorized** | **403 Forbidden** | **200 OK** | Executes heavy noise/perturbation suites |
| `/api/v1/benchmarks/robust/{id}` | `GET` | **Inference/Read** | **401 Unauthorized** | **200 OK** | **200 OK** | Retrieves robustness evaluation report |
| `/api/v1/serving/*` (7 endpoints) | Mixed | **Inference / Admin** | **401 Unauthorized** | **Enforced** | **Enforced** | Phase 13 serving protections preserved |
| `/api/v1/monitoring/*` (7 endpoints) | Mixed | **Inference / Admin** | **401 Unauthorized** | **Enforced** | **Enforced** | Phase 14 monitoring protections preserved |
| `/api/v1/pipelines/*` (5 endpoints) | Mixed | **Inference / Admin** | **401 Unauthorized** | **Enforced** | **Enforced** | Phase 15 pipeline protections preserved |

---

## 3. Threat Model & Security Posture Analysis

### 3.1 Unauthenticated Caller Prevention
- **Threat:** Unauthenticated network actors submitting arbitrary file uploads, exhausting server memory via model training, or deleting historical experiment data.
- **Mitigation:** Every data-bearing, inference, and mutation endpoint requires a valid `X-API-Key` header validated against configured keys. Requests missing credentials immediately receive HTTP 401 Unauthorized with `WWW-Authenticate: ApiKey`.

### 3.2 Privilege Separation (Least Privilege)
- **Threat:** Callers granted prediction or dashboard inspection credentials abusing those tokens to delete models or initiate expensive training runs.
- **Mitigation:** RBAC role hierarchy strictly differentiates `AppRole.INFERENCE` (read-only queries and predictions) from `AppRole.ADMIN`. Administrative operations (`POST /upload`, `POST /train`, `DELETE /experiments/{id}`, `POST /models/register`, `POST /models/{name}/versions/{v}/stage`, etc.) reject inference tokens with HTTP 403 Forbidden (`Admin role required for this operation`).

### 3.3 Timing Attack Defense
- **Threat:** Adversaries measuring response latency differences on character-by-character string comparisons to infer secret API keys.
- **Mitigation:** Token verification in `backend/app/core/security.py` uses `secrets.compare_digest(token, expected_key)`, ensuring execution time is independent of character match position.

### 3.4 Production Fail-Closed Safety
- **Threat:** Deploying to production with default development credentials (`autonexa-admin-key-secret`) or accidental configuration disabling auth (`API_AUTH_ENABLED=False`).
- **Mitigation:** Pydantic `@model_validator(mode="after")` executes on configuration load. When `ENVIRONMENT=production`:
  1. Setting `api_auth_enabled=False` halts startup with `RuntimeError: Production configuration error: Authentication cannot be disabled when ENVIRONMENT=production`.
  2. Supplying default placeholders (`autonexa-admin-key-secret`, `autonexa-read-key-secret`, `CHANGE_ME`, `SECRET`, `PASSWORD`, `ADMIN`) halts startup.
  3. Setting keys with length < 16 characters halts startup.
  4. Setting identical read and admin keys halts startup (`Admin and Read API keys must be distinct in production`).
  All error messages are completely sanitized to avoid printing any secret values in logs or exception traces.

### 3.5 Information Leakage & Error Sanitization
- **Threat:** Stack traces disclosing server file paths, username directories, or secret values in error responses.
- **Mitigation:** Authentication dependencies emit standardized JSON error bodies: `{"detail": "Invalid or missing API key."}` and `{"detail": "Admin role required for this operation."}`. File paths and credential echoes are excluded.

---

## 4. Files Modified & Inventory of Changes

| File | Nature of Change | Rationale |
| :--- | :--- | :--- |
| `backend/app/core/config.py` | Core Configuration | Added canonical `api_auth_enabled`, `api_key_read`, `api_key_admin` settings with backward-compatible aliases and properties; implemented fail-closed production validator. |
| `backend/app/core/security.py` | Security Module | Standardized `AppRole` enum and `require_inference_role`, `require_read_role`, `require_admin_role` dependencies with constant-time comparison. |
| `backend/app/api/routes/datasets.py` | API Route | Enforced `require_admin_role` on `upload` and `train`; enforced `require_inference_role` on `analyze`. |
| `backend/app/api/routes/experiments.py` | API Route | Enforced `require_admin_role` on `delete_experiment` and `artifact`; enforced `require_inference_role` on all read/predict routes. |
| `backend/app/api/routes/model_registry.py` | API Route | Enforced `require_admin_role` on `register`, `stage`, and `download`; enforced `require_inference_role` on query/verify routes. |
| `backend/app/api/routes/benchmarks.py` | API Route | Enforced `require_admin_role` on `repeated-runs`, `hpo-experiment`, `multi-objective`, and `robust`; enforced `require_inference_role` on query routes. |
| `frontend/src/lib/api.ts` | Frontend API Client | Updated `getAuthHeaders()` to inject `X-API-Key` from `localStorage` across all endpoints; added storage helper functions. |
| `frontend/src/components/workspace/SettingsTab.tsx` | Frontend Settings UI | Added dedicated API Key & RBAC configuration card with masked input, eye visibility toggle, active status pill, and security guidance. |
| `backend/tests/test_phase16b_security_audit.py` | Test Suite | Created 12 new comprehensive security regression tests verifying unauthenticated rejections, role boundaries, fail-closed production config, and error sanitization. |
| `backend/tests/test_*.py` (16 test files) | Test Suite Client Fixtures | Updated test client fixtures to provide authorized admin headers, ensuring zero regressions across all 227 pre-existing tests. |

---

## 5. Actual Validation Results

### 5.1 Backend Test Results
- **Command:** `powershell -Command "backend\.venv\Scripts\python -m pytest backend/tests"`
- **Result:** **239 passed**, 0 failed, 12 warnings in 65.28s.
- **Exit Code:** 0.

### 5.2 Frontend Production Build Results
- **Command:** `npm run build` (within `frontend/`)
- **Result:** Next.js 16.4.2 (Turbopack) compiled cleanly in 6.0s; 0 TypeScript errors; all static routes prerendered.
- **Exit Code:** 0.

---

## 6. Production Configuration Requirements

For production deployments, the following environment variables must be configured in your secrets manager or hosting platform (e.g., Cloud Run, Kubernetes Secret, AWS Secrets Manager, Vercel):

```bash
# AutoNexa Production Security Configuration
ENVIRONMENT=production
API_AUTH_ENABLED=true

# High-entropy random strings (minimum 16 characters each, must be distinct)
API_KEY_READ=anx_read_8f3b2a9e1c7d4f5082e6a1c89dbf7324
API_KEY_ADMIN=anx_admin_99c4e207b14d8f1e63a5d80b27fe6491
```

### Sanitized Startup Diagnostics
If an operator accidentally starts the application with insecure values in production, AutoNexa halts immediately with clear diagnostics:
- Missing/disabled auth: `"Authentication cannot be disabled when ENVIRONMENT=production."`
- Short keys: `"Production API_KEY_ADMIN must be at least 16 characters long."`
- Insecure defaults: `"Production API_KEY_ADMIN must not use default or placeholder keys."`
- Identical keys: `"Admin and Read API keys must be distinct in production."`

---

## 7. Remaining Risks and Unverified Behavior

1. **Static Shared Secret Architecture:** In high-concurrency multi-user enterprise settings, shared API keys do not provide individual user identity tracing or fine-grained per-user auditing. Transitioning to JWT/OIDC authentication should be considered for a future release.
2. **Client-Side Secret Storage:** The AutoNexa frontend allows storing API keys in browser `localStorage`. In shared-computer environments, browser local storage can be accessed via malicious browser extensions or XSS attacks. For public multi-tenant environments, a server-side session pattern or BFF proxy is strongly recommended.
3. **Transport Security (HTTPS):** Backend authentication guarantees authorization at the application layer, but relies on reverse proxies (Nginx, Traefik, Caddy, Cloudflare) to terminate TLS and enforce HTTPS in transit.

---

## 8. Confirmation of Credential Safety

- **Zero Committed Credentials:** A full scan of Git staged and uncommitted files confirms no production secrets, tokens, or private credentials exist in source code or `.env` files.
- **Zero Bundled Credentials:** The Next.js production build bundle was inspected; no `NEXT_PUBLIC_` environment variables or default admin secrets are exposed in JavaScript chunks.
- **Git State:** Working tree changes are strictly confined to `frontend/src/components/workspace/SettingsTab.tsx`, `frontend/src/lib/api.ts`, and quality audit reports. All user modifications and Phase 16A audit reports remain intact.

---

## 9. Final Verdict

**VERIFIED WITH LIMITATIONS**

The backend authorization asymmetry has been eliminated. Role-based access control is uniformly enforced across all sensitive endpoints, fail-closed production safety is verified, the full test suite (239 tests) passes with zero failures, and the frontend build succeeds without errors.
