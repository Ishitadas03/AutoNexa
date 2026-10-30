# AutoNexa — Deployment Engineering, CI/CD & Release Safety Guide

**Document ID:** `ANX-OPS-DEPLOY-16F`  
**Phase:** 16F — Deployment Engineering, CI/CD & Release Safety  
**Application Version:** `0.1.0`  
**Scope:** Production Deployment, Containerization, Backup/Recovery, Rollback, and Operational Runbooks

---

## 1. Supported Deployment Architecture & Constraints

AutoNexa is designed as a high-performance machine learning automation platform optimized for single-node containerized deployment.

### 1.1 Mandatory Single-Worker Operational Constraint

> [!CAUTION]
> **CRITICAL OPERATIONAL DIRECTIVE:**
> The AutoNexa backend MUST run with exactly ONE Uvicorn worker process (`--workers 1`).
> Never configure multiple worker processes or horizontal replicas on a shared filesystem without an external distributed coordination layer.

**Technical Rationale:**
1. **In-Process Thread Locks:** Active pipeline queues, dataset registry operations, and model promotion locks rely on Python's in-process `threading.RLock`. Multiple worker processes would bypass these locks, leading to race conditions during pipeline submission and model registry updates.
2. **In-Memory Operational Metrics:** `MetricsCollector` aggregates HTTP latency histograms, pipeline active gauges, and error counts in memory. Running multiple workers would fragment metric counters across independent worker heaps.
3. **SQLite WAL Architecture:** AutoNexa uses embedded SQLite in Write-Ahead Logging (`PRAGMA journal_mode=WAL`) with bounded busy timeouts (`busy_timeout=5000ms`). While WAL allows concurrent readers, write transactions are serialized at the file lock level. A single ASGI worker with non-blocking threadpool offloading maximizes SQLite throughput without thread lock thrashing.

### 1.2 Persistent Volume Architecture

Ephemeral container filesystems are strictly temporary and are destroyed upon container restart, rescheduling, or image upgrade. The following paths **MUST** be mounted to high-performance, durable storage:

| Directory | Container Path | Purpose | Required Backup Policy |
| :--- | :--- | :--- | :--- |
| **Metadata Database** | `/app/data` (`/app/data/metadata.db`) | SQLite database storing datasets, experiments, pipelines, and schema versions | Point-in-time snapshot before every release; daily automated backup |
| **Uploaded Datasets** | `/app/uploads` | Raw uploaded tabular CSV datasets | Snapshot before releases; weekly backup |
| **Experiments & Artifacts** | `/app/experiments` | Trained scikit-learn models, MLflow tracking runs, pipeline manifests, and monitoring logs | Snapshot before releases; daily backup |

---

## 2. Containerization Architecture

AutoNexa provides production-hardened container specifications for both backend and frontend services.

### 2.1 Backend Container (`backend/Dockerfile`)
- **Base Image:** `python:3.11-slim-bookworm` for minimal CVE exposure and reproducible builds.
- **Security:** Runs as non-root user `autonexa` (UID `10001`, GID `10001`).
- **Secrets Hygiene:** Secrets and `.env` files are excluded from image layers via `backend/.dockerignore`.
- **Health Probing:** Embedded Docker `HEALTHCHECK` testing `GET /api/v1/health` with 30s interval, 5s timeout, 15s start period, and 3 retries.
- **Persistent Volumes:** Declares `VOLUME ["/app/data", "/app/uploads", "/app/experiments"]`.
- **Execution Command:** Explicitly enforces `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`.

### 2.2 Frontend Container (`frontend/Dockerfile`)
- **Architecture:** Multi-stage build (deps, builder, runner) utilizing `node:20-alpine`.
- **Security:** Non-root user `nextjs` (UID `10001`).
- **Telemetry:** `NEXT_TELEMETRY_DISABLED=1` enabled.
- **Public Cloud Hosting Alternative:** For public cloud environments, Vercel is the primary recommended target for Next.js 16 with Turbopack and Edge CDN caching.

---

## 3. Environment & Configuration Security

AutoNexa enforces fail-closed configuration validation when `ENVIRONMENT=production`.

### 3.1 Security Matrix

| Variable | Requirement (Dev) | Requirement (Production) | Description |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | `production` | Enables strict startup validation and fail-closed security. |
| `API_AUTH_ENABLED` | `true` | `true` (**Mandatory**) | Cannot be disabled in production; application refuses to start if `false`. |
| `API_KEY_READ` | `autonexa-read-key-secret` | Strong secret (min 16 chars) | Read-only API key for metrics, readiness probes, and inference. |
| `API_KEY_ADMIN` | `autonexa-admin-key-secret` | Strong secret (min 16 chars) | Privileged API key for training, dataset upload, and model promotion. |
| Role Separation | N/A | `API_KEY_ADMIN != API_KEY_READ` | Keys must be distinct; sharing keys across roles fails startup. |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Full HTTPS backend URL | Frontend client route. Never expose admin keys via `NEXT_PUBLIC_*`. |
| `BACKEND_CORS_ORIGINS` | Localhost origins | Explicit frontend origin | JSON array of permitted client origins. |

### 3.2 Secret Generation Command
To generate cryptographically secure 256-bit keys for production:
```bash
# Generate read/inference key
openssl rand -hex 24

# Generate admin key (must be different)
openssl rand -hex 24
```

---

## 4. Release Checklist & Deployment Procedure

Follow this strict step-by-step checklist for every production deployment.

### Stage 1: Pre-Release Quality Gate
- [ ] Ensure all automated tests pass in CI: `pytest backend/tests -v`.
- [ ] Ensure frontend builds cleanly with zero TypeScript errors: `npm run build` in `frontend/`.
- [ ] Confirm image build version tag (e.g. `autonexa-backend:v0.1.0-commit-${GITHUB_SHA::7}`).
- [ ] Verify non-root execution and healthcheck in CI smoke test.

### Stage 2: Pre-Deployment Backup
Before modifying container instances or running schema updates:
```bash
# Execute automated online backup of database, uploads, and model artifacts
python backend/scripts/backup_restore.py backup \
  --base-dir . \
  --output-dir /var/backups/autonexa
```
- [ ] Verify backup archive creation: `ls -lh /var/backups/autonexa/`
- [ ] Verify backup checksums:
```bash
python backend/scripts/backup_restore.py verify \
  --archive /var/backups/autonexa/autonexa_backup_<TIMESTAMP>.tar.gz
```

### Stage 3: Persistent Volume Verification
- [ ] Confirm storage volumes are mounted and writable:
```bash
# Verify volume permissions inside container or host mountpoint
test -w /app/data && test -w /app/uploads && test -w /app/experiments && echo "Volumes OK"
```

### Stage 4: Deploy Container
```bash
# Example Docker Compose deployment with zero downtime handoff
docker compose up -d --build
```

### Stage 5: Post-Deployment Verification
Verify application health via HTTP endpoints:
1. **Liveness Probe (Public):**
```bash
curl -f http://127.0.0.1:8000/api/v1/health
# Expected: {"status": "healthy", "app_name": "AutoNexa", "version": "0.1.0"}
```
2. **Readiness Probe (Authenticated):**
```bash
curl -f -H "X-API-Key: <PROD_READ_KEY>" http://127.0.0.1:8000/api/v1/health/readiness
# Expected: HTTP 200 OK with {"status": "ready", "ready": true, "checks": {...}}
```
3. **Privileged Diagnostics (Admin Role):**
```bash
curl -f -H "X-API-Key: <PROD_ADMIN_KEY>" http://127.0.0.1:8000/api/v1/health/diagnostics
# Verify database row counts and schema version are reported accurately
```

---

## 5. Rollback & Disaster Recovery Procedures

If a deployment fails post-deployment verification or encounters runtime regressions:

### 5.1 Immediate Container Rollback
1. Re-tag or revert container image reference to the previous known good version:
```bash
docker tag autonexa-backend:previous-good autonexa-backend:latest
docker compose up -d backend
```
2. Check readiness probe:
```bash
curl -f -H "X-API-Key: <PROD_READ_KEY>" http://127.0.0.1:8000/api/v1/health/readiness
```

### 5.2 Database & Storage Recovery
If the SQLite metadata database or artifact store was corrupted during deployment:
1. Stop backend service to prevent write conflicts:
```bash
docker compose stop backend
```
2. Restore verified pre-deployment snapshot:
```bash
python backend/scripts/backup_restore.py restore \
  --archive /var/backups/autonexa/autonexa_backup_<TIMESTAMP>.tar.gz \
  --target-base-dir .
```
3. Start backend service:
```bash
docker compose start backend
```
4. Confirm database table counts in diagnostics endpoint:
```bash
curl -s -H "X-API-Key: <PROD_ADMIN_KEY>" http://127.0.0.1:8000/api/v1/health/diagnostics | jq .database
```

---

## 6. Log Correlation & Incident Troubleshooting

### 6.1 Structured Log Anatomy
AutoNexa logs in structured format with automatic correlation ID injection and credential redaction:
```
2026-10-23 22:45:00 | INFO    | [corr-9b3f4e12] | app.api.routes.health | Readiness check completed successfully
2026-10-23 22:45:01 | ERROR   | [corr-9b3f4e12] | app.db.session        | Database connectivity failed: [REDACTED]
```

### 6.2 Troubleshooting Runbook

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **Readiness probe returns 503 (`unhealthy`)** | SQLite database file is locked or missing | Inspect `/app/data/metadata.db`. Check `dmesg` or filesystem locks. Check logs for `corr-*` correlation IDs. |
| **Readiness probe returns 503 (`degraded`)** | `/app/uploads` or `/app/experiments` volume unwritable | Check volume disk space (`df -h`) and file ownership (`chown -R 10001:10001 /app/uploads`). |
| **Backend crashes on startup with `ValueError`** | Insecure production configuration | Ensure `ENVIRONMENT=production` has non-default `API_KEY_ADMIN` and `API_KEY_READ` of 16+ chars. |
| **Pipeline queue stalls** | Worker process crashed during training | Check diagnostics `GET /api/v1/health/diagnostics`. Active pipelines will auto-recover during lifecycle startup reconciliation. |
| **CORS errors in browser** | Origin mismatch | Update `BACKEND_CORS_ORIGINS` in backend environment with frontend URL. |

---

## 7. Safe Shutdown and Restart Procedures

When performing host maintenance or restarting containers:
1. **Initiate Graceful Drain:** Send `SIGTERM` to the Uvicorn process. AutoNexa intercepts `SIGTERM`, transitions the pipeline executor into `shutting_down` state, and drains inflight requests.
2. **Grace Period:** Configure container runtime with `stop_grace_period: 30s` to allow running inference and lightweight tasks to finalize cleanly before `SIGKILL`.
3. **Database Flush:** SQLite automatically flushes active WAL logs to disk when connections are closed cleanly.
