# AutoNexa Phase 16D — Metadata Architecture Review

**Document ID:** `ANX-ARCH-PHASE-16D-2026`  
**Date:** October 2026  
**Audited Subsystem:** Relational Metadata Persistence, Catalog API & Indexing  
**Repository Path:** `C:\Users\ishit\AutoNexa`  
**Authoritative Location:** `data/metadata.db` (configurable via `METADATA_DB_PATH`)  
**Architecture Verdict:** **PRODUCTION-READY**

---

## 1. Context & Architectural Motivation

In Phases 1 through 15, AutoNexa stored experiment metadata, training profiles, and pipeline orchestrations primarily as discrete JSON manifests scattered throughout the filesystem (`experiments/{experiment_id}/metadata.json` and `experiments/pipelines/manifests/{pipeline_id}.json`). Datasets were stored purely as flat CSV files in `uploads/` with profile metadata cached in browser `localStorage`.

While simple and self-contained, the Phase 16A Architecture Readiness Audit (`docs/research/phase_16_architecture_readiness_audit.md`) established that this architecture suffered from three key bottlenecks:
1. **$O(N)$ Disk I/O Bottleneck:** Listing runs required iterating through every directory on disk and reading/parsing hundreds of JSON files sequentially. Under growing workloads, listing latency grew linearly with the number of runs.
2. **Lack of Relational Aggregation:** Operations such as computing "how many experiments were trained on dataset X" required reading every single experiment directory on disk.
3. **No Centralized Dataset Catalog:** Without a persistent server-side catalog, clients could not view previously uploaded datasets across sessions without re-uploading or relying on browser storage.

Phase 16D introduces a relational metadata and indexing subsystem built on embedded SQLite and SQLAlchemy 2.0, providing $O(\log N)$ indexed lookups, bounded pagination, deterministic ordering, and cryptographic integrity verification without introducing heavy distributed dependencies (e.g., PostgreSQL, Redis).

---

## 2. SQLite Engine Architecture & Pragmas

SQLite is configured via connection event listeners in `backend/app/db/session.py` to ensure durability, high-throughput concurrent reads, and low write contention.

```python
@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Enforce SQLite WAL mode, foreign keys, and bounded busy timeout."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA foreign_keys=ON;")
        finally:
            cursor.close()
```

### Technical Rationale for Pragmas:
- **`PRAGMA journal_mode=WAL;`**: Write-Ahead Logging replaces rollback journaling. Readers do not block writers, and writers do not block readers. Reads execute concurrently with background training writes.
- **`PRAGMA busy_timeout=5000;`**: If another thread holds the write lock, incoming transactions wait up to 5,000 milliseconds before raising `OperationalError: database is locked`, absorbing write spikes without request drops.
- **`PRAGMA synchronous=NORMAL;`**: In WAL mode, `NORMAL` synchronization provides full durability against application crashes while eliminating redundant fsync operations per write.
- **`PRAGMA foreign_keys=ON;`**: Enforces relational integrity across tables.

---

## 3. Relational Schema & Indexing Topology

The relational schema is managed in `backend/app/db/models.py`.

### 3.1 `schema_versions` Table
Tracks applied migration revisions.
- `version` (`Integer`, PK): Monotonically increasing revision integer (currently `1`).
- `applied_at` (`DateTime(timezone=True)`): UTC timestamp when schema was initialized.
- `description` (`String(255)`): Human-readable migration description.

### 3.2 `datasets` Table
Persistent catalog of all ingested tabular assets.
- `dataset_id` (`String(64)`, PK, Index): Unique dataset slug or UUID.
- `filename` (`String(255)`, Index): Original uploaded filename.
- `rows` (`Integer`), `columns` (`Integer`): Dimensional shape.
- `column_names` (`JSON`), `data_types` (`JSON`), `missing_values` (`JSON`): Profile metadata.
- `duplicate_rows` (`Integer`), `memory_usage_bytes` (`BigInteger`), `file_size_bytes` (`BigInteger`).
- `fingerprint_sha256` (`String(64)`, Index): Cryptographic digest computed during streaming ingestion.
- `validation_status` (`String(32)`, Index): Status flag (`validated`, `flagged`, `corrupted`).
- `created_at` (`DateTime(timezone=True)`, Index), `updated_at` (`DateTime(timezone=True)`).
- **Compound Index:** `ix_datasets_created_at_desc(created_at DESC, dataset_id DESC)` for deterministic pagination.

### 3.3 `experiments` Table
Indexed metadata for AutoML training executions.
- `experiment_id` (`String(64)`, PK, Index): Unique experiment identifier.
- `name` (`String(255)`, Index): Display name.
- `dataset_id` (`String(64)`, Index): Source dataset reference.
- `dataset_fingerprint` (`String(64)`, Index): Snapshot of dataset SHA-256 at training time.
- `task_type` (`String(64)`, Index): `classification` or `regression`.
- `target_column` (`String(255)`): Target feature.
- `status` (`String(32)`, Index): `completed`, `failed`, `running`.
- `best_model` (`String(128)`, Index): Top-performing algorithm name.
- `best_score` (`Float`), `primary_metric` (`String(64)`).
- `models_count` (`Integer`), `has_artifact` (`Boolean`).
- `created_at` (`DateTime(timezone=True)`, Index), `updated_at` (`DateTime(timezone=True)`).
- `artifacts_manifest` (`JSON`): Pointer to trained model joblib and artifact SHA-256.
- **Compound Indexes:**
  - `ix_experiments_created_at_desc(created_at DESC, experiment_id DESC)`
  - `ix_experiments_status_created_at(status, created_at DESC)`

### 3.4 `pipelines` Table
State tracking for end-to-end pipeline orchestrations.
- `pipeline_id` (`String(64)`, PK, Index): Unique pipeline run identifier.
- `name` (`String(255)`), `model_name` (`String(128)`, Index).
- `dataset_id` (`String(64)`, Index), `target_column` (`String(255)`).
- `status` (`String(32)`, Index): `pending`, `running`, `succeeded`, `failed`, `cancelled`.
- `current_stage` (`String(64)`), `total_stages` (`Integer`), `completed_stages` (`Integer`).
- `retry_count` (`Integer`), `failure_reason` (`Text`), `duration_seconds` (`Float`).
- `created_at` (`DateTime(timezone=True)`, Index), `updated_at` (`DateTime(timezone=True)`).
- `manifest_json` (`JSON`): Complete execution manifest payload.
- **Compound Indexes:**
  - `ix_pipelines_created_at_desc(created_at DESC, pipeline_id DESC)`
  - `ix_pipelines_status_created_at(status, created_at DESC)`

---

## 4. Query Performance Comparison

| Endpoint / Operation | Legacy Implementation | Phase 16D Indexed Implementation | Scaling Complexity |
| :--- | :--- | :--- | :---: |
| `GET /api/v1/datasets` | Not available (Client `localStorage`) | Bounded SQL query with deterministic offset | $O(\log N)$ |
| `GET /api/v1/experiments` | Full directory scan (`Path.iterdir()`), read every `metadata.json` | Index scan on `ix_experiments_created_at_desc` | $O(\log N)$ |
| `GET /api/v1/pipelines` | Directory scan (`glob("*.json")`), parse every manifest file | Index scan on `ix_pipelines_created_at_desc` | $O(\log N)$ |
| Dataset Experiment Count | Read and parse every experiment directory on disk | `SELECT count() FROM experiments WHERE dataset_id = :id` | $O(\log N)$ |

---

## 5. Concurrency Guarantees & Operational Deployment Model

### 5.1 Supported Deployment Model
AutoNexa is architected and tested for a **single-process, multi-threaded worker model**:
```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### 5.2 Rationale
1. **Windows File Locking:** SQLite and Windows file semantics enforce mandatory file locking. Multi-process deployments on Windows can experience intermittent `OperationalError: unable to open database file` or WAL shared memory locking contention.
2. **Thread Safety:** Within a single process, SQLite with `check_same_thread=False` and SQLAlchemy connection pooling seamlessly coordinates concurrent reads across FastAPI request worker threads and thread pool background tasks.
3. **Engine Teardown:** During application shutdown or test teardown, `close_db()` safely disposes all active engines and connection pools, ensuring file handles are closed cleanly.

---

## 6. Frontend Client Integration Architecture

1. **Client API Methods:**
   - `api.listDatasets({ page, pageSize, search, status })`: Fetches paginated dataset catalog.
   - `api.getDataset(datasetId)`: Fetches individual dataset profile and metadata.
2. **Automatic Catalog Sync:**
   - On application load, `frontend/src/app/page.tsx` checks `/api/v1/health`.
   - Upon healthy connection, it queries `api.listDatasets()` and invokes `syncDatasets()` in `frontend/src/lib/store.ts`.
   - Local preview rows (`preview_rows`) cached in browser memory are preserved while updating server metadata.
3. **Zero Visual Identity Disruption:**
   - The UI adheres strictly to AutoNexa's blue/white enterprise theme, robot illustration, and workflow tabs.
