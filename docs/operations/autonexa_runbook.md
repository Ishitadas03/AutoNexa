# AutoNexa Production Operations Runbook

**Document ID:** `ANX-OPS-RUNBOOK-2026`  
**Target Audience:** Site Reliability Engineers, DevOps Engineers, and Platform Administrators  
**System:** AutoNexa Machine Learning Research & Orchestration Platform  
**App Version:** `0.1.0`  

---

## 1. System Overview & Deployment Topology

AutoNexa is deployed as a single-process FastAPI application with an embedded SQLite metadata database, local artifact repository, and Next.js frontend.

### Key Deployment Characteristics:
- **Process Model:** Single Uvicorn worker process.
- **Metadata Storage:** Embedded SQLite in WAL mode (`data/metadata.db`).
- **Artifact Directories:** `uploads/` for raw tabular CSVs, `experiments/` for MLflow runs, model weights, pipeline manifests, and event streams.
- **Authentication Model:** Dual-role RBAC (`Inference` role for reads and predictions; `Admin` role for uploads, training, model promotion, and privileged diagnostics).

---

## 2. Ingress & Probe Configuration

### 2.1 Kubernetes Probes

```yaml
# Liveness Probe (Tests that process event loop is responsive)
livenessProbe:
  httpGet:
    path: /api/v1/health
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3

# Readiness Probe (Tests DB connectivity, storage writeability, and worker lifecycle)
readinessProbe:
  httpGet:
    path: /api/v1/health/readiness
    port: 8000
    httpHeaders:
      - name: X-API-Key
        valueFrom:
          secretKeyRef:
            name: autonexa-secrets
            key: API_KEY_READ
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 5
  failureThreshold: 2
```

### 2.2 Probe Contract Summary

| Endpoint | Auth Required | Expected Code | Purpose |
| :--- | :---: | :---: | :--- |
| `GET /api/v1/health` | **None** | `200 OK` | Process liveness. Never reports internal dependency faults. |
| `GET /api/v1/health/readiness` | **Inference/Admin Key** | `200 OK` / `503 Service Unavailable` | Ingress readiness. Returns 503 if SQLite is unreachable or storage is unwritable. |
| `GET /api/v1/health/diagnostics` | **Admin Key** | `200 OK` | Deep system diagnostics, table counts, and runtime memory. |
| `GET /api/v1/metrics` | **Inference/Admin Key** | `200 OK` | In-memory operational metrics snapshot. |

---

## 3. Log Tracing & Request Correlation

### 3.1 Trace Correlating Workflow
All API endpoints accept caller-specified correlation identifiers via `X-Correlation-ID` or `X-Request-ID` headers.

1. **Supplying a Correlation ID:**
   ```bash
   curl -X GET "http://127.0.0.1:8000/api/v1/datasets" \
     -H "X-API-Key: $API_KEY_READ" \
     -H "X-Correlation-ID: audit-run-20261023-001"
   ```
2. **Response Header Verification:**
   The server returns the identical ID in both `X-Correlation-ID` and `X-Request-ID` response headers:
   ```http
   HTTP/1.1 200 OK
   X-Correlation-ID: audit-run-20261023-001
   X-Request-ID: audit-run-20261023-001
   ```
3. **Log Stream Filtering:**
   Filter your centralized log aggregator by the correlation ID:
   ```bash
   grep "audit-run-20261023-001" /var/log/autonexa/app.log
   ```

### 3.2 Log Message Sanitization
AutoNexa scrubs credentials before formatting:
- Bearer tokens are masked as `Bearer [REDACTED_TOKEN]`.
- API keys matching `ak_*` or `autonexa_*` are masked as `[REDACTED_API_KEY]`.
- Password / key parameters in strings are masked as `password=[REDACTED]`.
- Absolute filesystem paths (`C:\Users\username\` or `/home/username/`) are masked as `[HOME]\` or `[HOME]/`.

---

## 4. Operational Metrics Monitoring

Metrics are available at `GET /api/v1/metrics` in JSON format.

### Key Metric Fields & Thresholds:

| Metric Section | Field | Recommended Alert Threshold | Diagnostic Meaning |
| :--- | :--- | :--- | :--- |
| `http.duration_ms` | `avg` | `> 500ms` sustained | API processing bottleneck or slow SQLite queries |
| `http.by_status_family` | `5xx` | `> 1` within 5m window | Internal server error; investigate exception logs |
| `pipelines` | `active_gauge` | `== pipeline_max_concurrency` | Pipeline execution pool saturated |
| `metadata_db` | `errors_total` | `> 0` | SQLite locking or disk corruption |
| `governance` | `retraining_triggers_by_outcome` | `skipped_busy` spikes | Backlogged retraining jobs; check worker pool |

---

## 5. Troubleshooting & Safe Recovery Procedures

### 5.1 Scenario: Readiness Probe Fails (HTTP 503 — Database Unhealthy)

**Symptom:**
Readiness returns `503 Service Unavailable` with `checks.database.status: "unhealthy"`.

**Root Causes:**
1. Database file permissions issue (`data/metadata.db`).
2. SQLite database locked by another process or dangling lock from unexpected kill.
3. Disk out of space or read-only filesystem mount.

**Resolution Steps:**
1. Check disk utilization:
   ```bash
   df -h (Linux) or Get-PSDrive C (Windows PowerShell)
   ```
2. Inspect SQLite file locks:
   Ensure no stray Python or SQLite processes hold the lock:
   ```powershell
   Get-Process python* | Select-Object Id, ProcessName, Path
   ```
3. Test SQLite connectivity directly:
   ```bash
   sqlite3 data/metadata.db "PRAGMA quick_check;"
   ```
4. If corruption is indicated, AutoNexa will automatically rebuild indices from filesystem manifests via:
   ```bash
   python -c "from app.core.config import get_settings; from app.db.reconciliation import MetadataReconciliationService; MetadataReconciliationService(get_settings()).reconcile_all()"
   ```

---

### 5.2 Scenario: Storage Degraded (HTTP 503 — Storage Unwritable)

**Symptom:**
Readiness returns `503 Service Unavailable` with `checks.storage.status: "degraded"`.

**Resolution Steps:**
1. Verify directory write permissions on `uploads/` and `experiments/`:
   ```powershell
   Test-Path -Path "experiments\" -PathType Container
   ```
2. Ensure directory permissions allow write access to the service account user.
3. Remove any dangling `.readiness_test_*` files in the artifacts directory.

---

### 5.3 Scenario: Active Pipeline Cancellation & Orphan Recovery

**Symptom:**
A pipeline was interrupted due to a server restart or process crash.

**Behavior:**
During FastAPI lifespan startup, AutoNexa executes `PipelineService.reconcile_orphaned_pipelines()`. Any jobs recorded as `RUNNING` or `PENDING` from a prior process are deterministically marked as `FAILED` with failure reason:
`"Process interrupted or restarted while pipeline was running."`

**Manual Operator Cancellation:**
If an active job needs immediate cancellation without restarting the server:
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/pipelines/{pipeline_id}/cancel" \
  -H "X-API-Key: $API_KEY_ADMIN"
```

**Retry Pipeline:**
To resume the cancelled or failed pipeline:
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/pipelines/{pipeline_id}/retry" \
  -H "X-API-Key: $API_KEY_ADMIN"
```

---

## 6. Safe Restart & Graceful Shutdown

To restart AutoNexa cleanly without corrupting active pipelines or SQLite write-ahead logs:

1. **Send SIGTERM / Graceful Shutdown Signal:**
   Uvicorn lifespan will intercept the shutdown signal and execute:
   - `pipeline_service.shutdown(wait=True, timeout=10.0)`
   - Cancels pending jobs, waits for running workers to drain within 10 seconds.
   - `close_db()` disposes SQLAlchemy connection pools and WAL locks.
2. **Restart Process:**
   ```powershell
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```
3. **Verify Readiness:**
   ```bash
   curl -i http://127.0.0.1:8000/api/v1/health/readiness -H "X-API-Key: $API_KEY_READ"
   ```
   Expect HTTP `200 OK` with `"ready": true`.
