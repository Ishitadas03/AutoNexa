# AutoNexa Phase 16D — Migration & Disaster Recovery Guide

**Document ID:** `ANX-OPS-PHASE-16D-2026`  
**Date:** October 2026  
**Audience:** Platform Engineers, SREs, System Administrators  
**Repository Path:** `C:\Users\ishit\AutoNexa`  
**Authoritative Storage Root:** `data/metadata.db`  
**Operational Status:** **ACTIVE & IDEMPOTENT**

---

## 1. Overview & Migration Philosophy

Phase 16D introduces SQLite-backed metadata storage and indexing while adhering to a strict safety philosophy:

> **Dual-Durability Rule:** The filesystem remains the ultimate source of truth for raw assets (CSV data and model binaries). The SQLite metadata database serves as the high-speed index and catalog layer. Under no circumstances does a metadata failure or database corruption result in raw dataset or model binary data loss.

Migration from legacy unindexed storage to SQLite is fully **automatic, non-destructive, and idempotent**.

---

## 2. Automated Legacy Metadata Reconciliation

### 2.1 Reconciled Asset Classes

The `MetadataReconciliationService` (`backend/app/db/reconciliation.py`) scans three distinct asset domains:

| Asset Domain | Filesystem Source | Target Relational Model | Ingestion Behavior |
| :--- | :--- | :--- | :--- |
| **Datasets** | `uploads/*.csv` | `DatasetModel` (`datasets`) | Checks if `dataset_id` (filename stem) exists. If missing, computes SHA-256 fingerprint, profiles dimensions and column types, and inserts catalog record with `validation_status="validated"`. |
| **Experiments** | `experiments/*/metadata.json` | `ExperimentModel` (`experiments`) | Ignores reserved directories (`mlruns`, `pipelines`, etc.). Reads `metadata.json`, parses evaluation metrics and artifact SHA-256, and indexes run in `experiments`. |
| **Pipelines** | `experiments/pipelines/manifests/*.json` | `PipelineModel` (`pipelines`) | Reads manifest JSON, validates payload against `PipelineResponse` schema, and upserts execution record with stage counts and terminal status. |

### 2.2 Execution Triggers
Reconciliation executes automatically in two scenarios:
1. **Application Boot:** In `backend/app/main.py` (`lifespan`), `reconcile_all()` runs on startup, logging the count of discovered assets.
2. **On-Demand Hot Path Fallback:** If `list_experiments` queries return 0 results and unindexed experiment directories exist on disk, reconciliation is triggered automatically to backfill the database before responding.

---

## 3. Disaster Recovery Procedures

### 3.1 Procedure 1: Total SQLite Database Reconstruction (Re-indexing)

If `data/metadata.db` is accidentally deleted, corrupted, or locked:

1. **Stop the Application Server:**
   ```powershell
   # Terminate Uvicorn process
   Get-Process -Name "python" | Where-Object { $_.CommandLine -like "*uvicorn*" } | Stop-Process
   ```

2. **Remove Damaged Database Files (if any):**
   ```powershell
   Remove-Item -Force -Path "C:\Users\ishit\AutoNexa\data\metadata.db*"
   ```

3. **Start the Application Server (or Run Manual Reconciliation):**
   When the server boots, the lifespan manager automatically recreates `data/metadata.db`, executes schema migration Version 1, and backfills all datasets, experiments, and pipelines from disk manifests:
   ```powershell
   .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

4. **Verify Catalog Integrity:**
   Query the dataset catalog endpoint using an inference or admin token:
   ```powershell
   curl.exe -H "Authorization: Bearer <API_KEY_READ>" http://127.0.0.1:8000/api/v1/datasets
   ```
   **Expected Result:** All uploaded datasets appear with verified SHA-256 fingerprints and row counts.

---

### 3.2 Procedure 2: Safe Database Backup

Because SQLite is running in Write-Ahead Logging (`WAL`) mode, creating a backup requires capturing both the main `.db` file and its active WAL logs (`.db-wal`, `.db-shm`), or using SQLite's online backup API:

```powershell
# Recommended online backup command via sqlite3 CLI
sqlite3 data/metadata.db ".backup 'data/backup_metadata.db'"
```

Alternatively, copy during maintenance or server shutdown:
```powershell
Copy-Item "data/metadata.db" "data/metadata.db.bak"
```

---

### 3.3 Procedure 3: Rollback & Emergency Fallback to Legacy File Scans

If SQLite persistence must be disabled during an emergency:
1. Both `ExperimentTrackerService.list_experiments` and `PipelineService.list_pipelines` feature built-in `try...except` blocks that catch database errors and fall back automatically to filesystem scanning (`_legacy_list_experiments`, `_legacy_list_pipelines`).
2. Raw JSON manifests and `.csv` files remain untouched on disk, guaranteeing zero broken downstream predictions or artifact loss.

---

## 4. Idempotency & Safety Guarantees

1. **No Duplicate Inserts:** Primary key checks (`repo.get_by_id(id) is not None`) prevent re-inserting already cataloged assets.
2. **Transaction Rollbacks:** Every repository operation executes within a scoped database session. Any unexpected exception triggers `session.rollback()`, leaving no partial or corrupt records.
3. **No Traversal Exposure:** File resolution strictly enforces regex validation (`^[a-zA-Z0-9_\-\.]+$`) and verifies that resolved paths reside inside the configured root directory (`path.is_relative_to(root)`).
4. **Sanitized Logging:** All reconciliation and persistence logs omit sensitive file contents, dataset row contents, or API credentials.
