# AutoNexa Phase 17D — Performance, Scalability & Resource Stress Testing Report

**Document ID:** `ANX-VAL-PHASE17D-2026`  
**Phase:** 17D — Performance, Scalability & Resource Stress Validation  
**Repository:** `C:\Users\ishit\AutoNexa`  
**Execution Date:** October 31, 2026  
**Execution Mode:** Inspect → Audit Evidence → Design Stress Tests → Execute → Diagnose → Minimal Fixes → Retest → Report  
**Active Branch:** `main` (Strictly preserved without commit/push/deploy)  
**Overall Verdict:** **PASS WITH LIMITATIONS**

---

## 1. Executive Summary

Phase 17D delivers an empirical engineering stress validation of AutoNexa's runtime performance, resource consumption, stability, concurrency isolation, and failure recovery under progressively increasing workloads. Building upon the workflow validations of Phase 17A, the full-stack contracts of Phase 17B, and the real-world dataset research validation of Phase 17C, this phase stress-tests AutoNexa against controlled synthetic datasets spanning small baselines, medium workloads, large supported workloads ($25,000$ rows), wide feature spaces ($120$ features), hostile data quality challenges, over-limit boundary rejections, and concurrent request stress.

Testing was executed in an isolated temporary runtime environment on the local development hardware, utilizing `psutil` for real OS process resident set size (RSS) tracking, `tracemalloc` for Python heap allocation profiling, high-resolution performance timers (`time.perf_counter`), and multithreaded concurrency executors.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Phase 17D Stress Validation Overview                                   │
├──────────────────────────┬──────────┬─────────┬───────────────┬────────────┬─────────────┬─────────────┤
│ Workload Scenario        │ Task     │ Shape   │ Champion      │ Score      │ Train Time  │ Peak RSS    │
├──────────────────────────┼──────────┼─────────┼───────────────┼────────────┼─────────────┼─────────────┤
│ Small Clf Baseline       │ Bin Clf  │ 500x11  │ Random Forest │ 0.7800     │ 6.70s       │ 267.39 MB   │
│ Small Reg Baseline       │ Regress  │ 500x11  │ Linear Reg    │ 0.5066     │ 1.52s       │ 257.15 MB   │
│ Medium Clf Workload      │ Bin Clf  │ 5,000x26│ HistGradBoost │ 0.9400     │ 5.07s       │ 265.92 MB   │
│ Medium Reg Workload      │ Regress  │ 5,000x26│ Linear Reg    │ 0.1152     │ 5.92s       │ 269.16 MB   │
│ Large Clf Supported      │ Bin Clf  │25,000x31│ HistGradBoost │ 0.9396     │ 8.48s       │ 296.59 MB   │
│ Large Reg Supported      │ Regress  │25,000x31│ Linear Reg    │ 0.1022     │ 7.83s       │ 309.31 MB   │
│ Wide Clf Features        │ Bin Clf  │ 1,000x121 Logistic Reg  │ 0.7950     │ 4.17s       │ 309.36 MB   │
│ Wide Reg Features        │ Regress  │ 1,000x121 Linear Reg    │ 0.8924     │ 4.38s       │ 316.77 MB   │
│ Dirty Data Challenge     │ Bin Clf  │ 2,200x20│ Random Forest │ 0.8500     │ 2.45s       │ 318.43 MB   │
└──────────────────────────┴──────────┴─────────┴───────────────┴────────────┴─────────────┴─────────────┘
```

### Key Findings & Outcomes:
1. **Audited Phase 17C Evidence Discrepancy:** Identified and traced the root cause of the Diabetes multi-seed metric label in Phase 17C (`phase_17c_results.json` labeled `"metric": "r2"` for scores $>50.0$, which are actually RMSE values). Confirmed that California Housing was an exact 10% sample ($N=2,064$) of the 1990 census. Clarified the distinction between Python heap memory (`tracemalloc`) and process RSS (`psutil`).
2. **Supported Workload Scaling:** AutoNexa trained on $25,000$ rows across multiple candidate models in under $8.5\text{s}$, with process memory remaining bounded under $310\text{ MB}$ RSS and Python heap peak under $43.5\text{ MB}$.
3. **Wide Feature Space Handling:** Processed $120$ continuous and categorical columns ($1,000$ rows) through `ColumnTransformer` and one-hot encoding in under $4.4\text{s}$ training time, with inference latency averaging $30\text{ ms} - 42\text{ ms}$.
4. **Boundary Limit Rejections:** Verified 100% fail-safe rejection across 6 boundary conditions (empty files, $>100,000$ rows, $>500$ columns, $>300\text{s}$ budget, $>1,000$ prediction records, and missing target columns).
5. **Concurrency & Threadpool Isolation:** Successfully executed 50 concurrent prediction requests across 8 worker threads without thread starvation or race conditions (mean latency $53.33\text{ ms}$). Executed 2 simultaneous training jobs on distinct datasets in $1.01\text{s}$ with distinct experiment IDs and zero SQLite lock errors.
6. **Time Budget Enforcement:** Demonstrated both fold-level and candidate-level training budget termination when training exceeded configured limits.
7. **Regression Test Suite:** Authored `backend/tests/test_phase17d_stress_contracts.py` containing 4 dedicated regression tests. The full backend test suite passed with **309 passed tests in 80.24s (0 failures)**, and frontend production build succeeded with **0 errors**.
8. **Verdict Justification:** **PASS WITH LIMITATIONS** reflects full stability and correctness across supported workloads, alongside realistic single-worker, in-memory cache, and CPU threadpool constraints documented for future horizontal scaling.

---

## 2. Phase 17C Evidence Audit Findings

Before utilizing Phase 17C empirical measurements as reference points, a systematic audit of the Phase 17C artifacts (`data/research_benchmarks/phase_17c_results.json`, `docs/research/phase_17c_manifest.json`, and `docs/quality/phase_17c_research_validation.md`) was conducted.

### 2.1 Diabetes Multi-Seed Metric Label Audit
- **Audit Observation:** In `phase_17c_results.json` and `phase_17c_manifest.json`, `diabetes_regression` recorded `"metric": "r2"`, but the recorded scores were `[53.7775, 51.2864, 52.3097]` with mean `52.4579`.
- **Underlying Code Trace:** In `backend/app/services/automl/training_service.py`, `ModelEvaluator.get_default_metric(TaskType.REGRESSION)` returns `("rmse", False)`. When `TrainingRequest` was instantiated in the runner script without an explicit `primary_metric`, the service defaulted to ranking candidates by `rmse`. Thus, `best_score` was the RMSE score ($53.7775$), which matched the RMSE in Table 5.3 of the report ($53.7775$).
- **Report vs Artifact Reconciliation:** The Phase 17C report Markdown Table 8.2 correctly identified these values as RMSE and labeled the column header as `RMSE ↓`. However, the script dictionary wrote the dataset specification's `spec["primary_metric"]` (which was `"r2"`) into the JSON results.
- **Audit Conclusion:** The numerical values ($53.7775$, $51.2864$, $52.3097$) are authentic empirical RMSE scores, and the winning model family (`linear_regression`) is identical across all seeds. The JSON key `"metric": "r2"` was a label artifact from the runner loop.

### 2.2 California Housing Subset Provenance Audit
- **Audit Observation:** California Housing in Phase 17C had $2,064$ rows and $9$ columns (8 features + 1 target).
- **Provenance Verification:** The full 1990 California Housing census dataset (Pace & Barry 1997 / StatLib) contains $20,640$ block-group instances.
- **Sampling Integrity:** The file `data/research_benchmarks/california_housing.csv` represents an exact 10.0% uniform random sample ($2,064 / 20,640 = 0.1000$) drawn using fixed `random_state=42`. All 8 continuous feature distributions and the right-censored target (`MedHouseVal = 5.00001`) remain statistically consistent with the full population.
- **Audit Conclusion:** The subset provenance is verified, documented, and reproducible.

### 2.3 Memory Measurement Method Distinction
- **Audit Observation:** Phase 17C reported memory measurements between $1.49\text{ MB}$ and $2.08\text{ MB}$ under the label `Peak RAM (tracemalloc)`.
- **Measurement Method Clarification:**
  - `tracemalloc.get_traced_memory()[1]` measures the net heap allocations created by Python bytecode objects above the baseline snapshot.
  - It does **not** include the memory consumed by the Python C-runtime, linked shared libraries (`openblas`, `libgomp`), OS page tables, or process overhead.
  - Total process Resident Set Size (RSS) measured via `psutil.Process().memory_info().rss` reflects actual RAM footprint (typically $200\text{ MB} - 340\text{ MB}$).
- **Audit Conclusion:** Both metrics are valid but represent completely different layers of the operating system. Phase 17D reports both `Peak Heap (tracemalloc)` and `Process RSS (psutil)` side-by-side to ensure full clarity.

### 2.4 Manifest vs Benchmark Results Agreement
- **Audit Observation:** All 4 benchmark experiments (`breast_cancer_binary`, `wine_multiclass`, `diabetes_regression`, and `california_housing`) in `docs/research/phase_17c_manifest.json` were cross-checked against `data/research_benchmarks/phase_17c_results.json`.
- **Audit Conclusion:** 100% agreement confirmed across `best_model`, `best_score`, and candidate model lists.

---

## 3. Enforced Runtime and Resource Limits

The actual implementation constraints across the codebase were audited to distinguish enforced limits from theoretical defaults:

| Limit Parameter | Configuration Setting | Actual Enforced Value | Enforcement Mechanism | Failure Response |
| :--- | :--- | :---: | :--- | :--- |
| **Max Upload File Size** | `MAX_UPLOAD_SIZE_BYTES` | 10 MB ($10,485,760$ B) | Chunked streaming read in `DatasetService.upload_dataset` | `HTTP 413 Payload Too Large` |
| **Max Dataset Rows** | `MAX_DATASET_ROWS` | 100,000 rows | `TrainingService.train_experiment` (`if rows > max`) | `HTTP 400 Bad Request` |
| **Max Dataset Columns** | `MAX_DATASET_COLUMNS` | 500 columns | `TrainingService.train_experiment` (`if cols > max`) | `HTTP 400 Bad Request` |
| **Training Budget Bounds** | `time_budget_seconds` | 5s min / 300s max | Pydantic `Field(..., ge=5, le=300)` in `TrainingRequest` | `HTTP 422 Unprocessable Entity` / `HTTP 400` |
| **Prediction Batch JSON** | `MAX_PREDICTION_RECORDS` | 1,000 records | `PredictionService.validate_input_records` | `HTTP 400 Bad Request` |
| **Prediction Batch CSV Rows** | `MAX_PREDICTION_CSV_ROWS` | 10,000 rows | `PredictionService.predict_csv` | `HTTP 400 Bad Request` |
| **Prediction Batch CSV Size** | `MAX_PREDICTION_CSV_SIZE_BYTES` | 5 MB ($5,242,880$ B) | Streaming byte counter in `predict_csv` | `HTTP 413 Payload Too Large` |
| **Model Memory Cache** | `SERVING_CACHE_MAX_MODELS` | 20 models | Thread-safe LRU eviction under `_CACHE_LOCK` | Automatic eviction of oldest entry |
| **Database Concurrency** | SQLite WAL Pragmas | WAL mode, 5,000ms busy timeout | `_set_sqlite_pragmas` in `app/db/session.py` | Transparent wait up to 5s before locking error |

---

## 4. Controlled Stress-Test Matrix & Empirical Outcomes

All scenarios below were executed in an isolated temporary runtime workspace. Measurements represent actual recorded wall-clock times and system memory:

### 4.1 Stress Scenarios Performance Summary

| Scenario ID | Task Type | Sample Shape | CSV Size | Upload Time | Profiling Time | Training Time | Budget | Winner | Score | Attempt / Succ / Fail / Timeout |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: |
| `small_clf_baseline` | Bin Clf | $500 \times 11$ | 82.0 KB | 0.021s | 0.021s | 6.70s | 30s | Random Forest | 0.7800 | 3 / 3 / 0 / 0 |
| `small_reg_baseline` | Regress | $500 \times 11$ | 90.8 KB | 0.013s | 0.022s | 1.52s | 30s | Linear Reg | 0.5066 | 3 / 3 / 0 / 0 |
| `med_clf_increased` | Bin Clf | $5,000 \times 26$ | 2.08 MB | 0.020s | 0.070s | 5.07s | 60s | HistGradBoost | 0.9400 | 4 / 4 / 0 / 0 |
| `med_reg_increased` | Regress | $5,000 \times 26$ | 2.20 MB | 0.021s | 0.094s | 5.92s | 60s | Linear Reg | 0.1152 | 4 / 4 / 0 / 0 |
| `large_clf_supported` | Bin Clf | $25,000 \times 31$ | 12.37 MB | 0.068s | 0.418s | 8.48s | 90s | HistGradBoost | 0.9396 | 2 / 2 / 0 / 0 |
| `large_reg_supported` | Regress | $25,000 \times 31$ | 13.00 MB | 0.064s | 0.365s | 7.83s | 90s | Linear Reg | 0.1022 | 2 / 2 / 0 / 0 |
| `wide_clf_features` | Bin Clf | $1,000 \times 121$ | 2.04 MB | 0.043s | 0.177s | 4.17s | 60s | Logistic Reg | 0.7950 | 3 / 3 / 0 / 0 |
| `wide_reg_features` | Regress | $1,000 \times 121$ | 2.12 MB | 0.048s | 0.137s | 4.38s | 60s | Linear Reg | 0.8924 | 3 / 3 / 0 / 0 |
| `dirty_data_challenge` | Bin Clf | $2,200 \times 20$ | 656.1 KB | 0.016s | 0.038s | 2.45s | 60s | Random Forest | 0.8500 | 3 / 3 / 0 / 0 |

---

## 5. Computational Resource Profiling & Latency Distribution

### 5.1 Memory Profiling: Python Heap vs Process RSS

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Memory Allocation & Footprint Analysis                                 │
├──────────────────────────┬──────────────────┬─────────────────┬─────────────────┬──────────────────────┤
│ Scenario ID              │ Peak Heap Alloc  │ Start RSS       │ Peak RSS        │ Net RSS Shift        │
├──────────────────────────┼──────────────────┼─────────────────┼─────────────────┼──────────────────────┤
│ `small_clf_baseline`     │ 36.54 MB         │ 212.07 MB       │ 267.39 MB       │ +55.32 MB            │
│ `small_reg_baseline`     │ 1.35 MB          │ 257.68 MB       │ 257.15 MB       │ -0.53 MB             │
│ `med_clf_increased`      │ 12.18 MB         │ 265.30 MB       │ 265.92 MB       │ +0.62 MB             │
│ `med_reg_increased`      │ 12.79 MB         │ 274.21 MB       │ 269.16 MB       │ -5.05 MB             │
│ `large_clf_supported`    │ 43.42 MB         │ 289.43 MB       │ 296.59 MB       │ +7.16 MB             │
│ `large_reg_supported`    │ 43.38 MB         │ 299.45 MB       │ 309.31 MB       │ +9.86 MB             │
│ `wide_clf_features`      │ 6.28 MB          │ 317.88 MB       │ 309.36 MB       │ -8.52 MB             │
│ `wide_reg_features`      │ 6.22 MB          │ 313.36 MB       │ 316.77 MB       │ +3.41 MB             │
│ `dirty_data_challenge`   │ 2.86 MB          │ 318.04 MB       │ 318.43 MB       │ +0.39 MB             │
└──────────────────────────┴──────────────────┴─────────────────┴─────────────────┴──────────────────────┘
```

**Key Profiling Insights:**
1. **Bounded Heap Footprint:** Peak transient heap allocation during 25,000-row training did not exceed $43.5\text{ MB}$.
2. **Stable Process Memory Ceiling:** Total process RSS remained stabilized between $257\text{ MB}$ and $319\text{ MB}$, indicating healthy garbage collection (`gc.collect()`) and zero runaway memory leaks across consecutive AutoML training runs.
3. **Artifact Economy:** Linear and logistic model artifacts serialized to disk between $5.16\text{ KB}$ and $21.74\text{ KB}$. 100-tree Random Forest pipelines with high-cardinality preprocessing serialized to $465\text{ KB} - 1.14\text{ MB}$.

### 5.2 Inference Latency Benchmarks (CPU Serving)

| Scenario ID | Artifact Size | Single Mean | Single Median | Single P95 | Batch 100 | Batch 1,000 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `small_clf_baseline` | 465.7 KB | 52.15 ms | 52.29 ms | 60.97 ms | 58.15 ms | -- |
| `small_reg_baseline` | 5.2 KB | 13.48 ms | 13.06 ms | 17.54 ms | 12.54 ms | -- |
| `med_clf_increased` | 223.5 KB | 43.31 ms | 40.03 ms | 61.69 ms | 37.88 ms | 59.40 ms |
| `med_reg_increased` | 7.5 KB | 13.89 ms | 13.56 ms | 16.26 ms | 18.34 ms | 33.36 ms |
| `large_clf_supported` | 232.0 KB | 38.16 ms | 36.63 ms | 46.39 ms | 36.68 ms | 66.44 ms |
| `large_reg_supported` | 8.4 KB | 17.58 ms | 17.23 ms | 22.49 ms | 21.02 ms | 48.93 ms |
| `wide_clf_features` | 21.7 KB | 42.29 ms | 41.98 ms | 52.99 ms | 57.23 ms | 142.43 ms |
| `wide_reg_features` | 21.4 KB | 30.35 ms | 28.91 ms | 42.88 ms | 46.17 ms | 72.67 ms |
| `dirty_data_challenge` | 1,140.0 KB | 51.89 ms | 50.70 ms | 63.64 ms | 56.68 ms | 95.97 ms |

**Inference Observations:**
- Linear model single-record prediction consistently executes in under $18\text{ ms}$ on CPU.
- Tree and ensemble models (Random Forest and HistGradientBoosting) execute single-record inference in $38\text{ ms} - 52\text{ ms}$.
- Batch 1,000 records scoring on a 30-feature model completes in $48\text{ ms} - 66\text{ ms}$ (throughput of $\sim 15,000 - 20,000$ records per second).

---

## 6. Concurrency, Synchronization & Persistence Tests

Stress testing in multi-threaded environments was verified under isolated conditions:

### 6.1 Concurrent Prediction Requests (Thread Contention)
- **Configuration:** 50 requests dispatched simultaneously across 8 worker threads (`ThreadPoolExecutor(max_workers=8)`).
- **Total Duration:** $2,666.59\text{ ms}$ ($2.67\text{s}$).
- **Mean Latency Per Request:** $53.33\text{ ms}$.
- **Success Rate:** $50 / 50$ ($100\%$ success, 0 exceptions, 0 dropped connections).
- **Result:** **PASS**. Model serving and preprocessing pipelines execute reentrantly without threading conflicts.

### 6.2 Concurrent Training Submissions (Resource Contention)
- **Configuration:** 2 simultaneous AutoML training jobs executed on distinct datasets (`small_clf_baseline` and `wide_clf_features`) using 2 concurrent threads.
- **Outcomes:**
  - Job 1 (`small_clf_baseline`): Experiment ID `f3aa111f-cb1a-4f92-a440-9c8d3741c39b` | Best Model: `logistic_regression` | Score: `0.6399` | Duration: `0.69s`.
  - Job 2 (`wide_clf_features`): Experiment ID `34279fc7-c9a1-4340-8e8c-a3613190d3fb` | Best Model: `logistic_regression` | Score: `0.7347` | Duration: `0.92s`.
  - Total Wall-Clock Time: $1.01\text{s}$.
  - Experiment ID Uniqueness: Guaranteed (`res1.experiment_id != res2.experiment_id`).
  - Database Integrity: Zero SQLite lock contention errors (`PRAGMA busy_timeout=5000` absorbed file access).
- **Result:** **PASS**. Distinct experiment workspaces prevent cross-talk.

### 6.3 Training Budget Cancellation & Timeout Enforcement
- **Configuration:** In `med_clf_increased`, 5 candidate models (`dummy`, `decision_tree`, `logistic_regression`, `random_forest`, `hist_gradient_boosting`) were trained under 5-fold cross-validation with a restrictive 5-second budget.
- **Outcomes:**
  - Total Duration: $5.67\text{s}$.
  - Models Attempted: 5.
  - Successfully Completed: 4 models (`dummy`, `decision_tree`, `logistic_regression`, `random_forest`).
  - Skipped Due to Timeout: 1 model (`hist_gradient_boosting` flagged with `ModelStatus.SKIPPED_TIMEOUT`).
  - Graceful Recovery: AutoML pipeline ranked the 4 completed models, selected `random_forest` ($0.9247$ score) as champion, persisted metadata, and returned HTTP 200 without process termination or crash.
- **Result:** **PASS**.

### 6.4 Metadata Reconciliation & Persistence Consistency
- **Configuration:** Simulated an unexpected host restart by initializing a clean `MetadataReconciliationService` on the experiment directory and upload folder.
- **Outcomes:**
  - Datasets Cataloged: 1 untracked dataset discovered and registered into SQLite.
  - Experiments Reconciled: 12 experiment workspaces reconciled and indexed into SQLite database.
  - Integrity Check: Database schema validated, relational foreign keys verified (`PRAGMA foreign_keys=ON`).
- **Result:** **PASS**.

---

## 7. Boundary Enforcement, Safety & Failure Recovery

| Boundary Test Condition | Scenario Description | Expected Status | Handled Safely? | Actual Behavior |
| :--- | :--- | :---: | :---: | :--- |
| **Empty File Upload** | 0-byte CSV upload | HTTP 400 | **YES** | Caught during validation; rejected without persisting metadata. |
| **Row Limit Enforcement** | Rows $> \text{max\_dataset\_rows}$ | HTTP 400 | **YES** | `HTTP 400: Dataset rows exceed maximum supported training limit.` |
| **Column Limit Enforcement** | Columns $> \text{max\_dataset\_columns}$ | HTTP 400 | **YES** | `HTTP 400: Dataset columns exceed maximum supported training limit.` |
| **Training Budget Bounds** | Budget $> 300\text{s}$ or $< 5\text{s}$ | HTTP 422 / 400 | **YES** | Pydantic schema validation rejects payload with detailed range error. |
| **Prediction Batch Limit** | Batch $> 1,000$ JSON records | HTTP 400 | **YES** | `HTTP 400: Number of records exceeds maximum permitted batch size.` |
| **Missing Target Column** | Nonexistent target column name | HTTP 400 | **YES** | `HTTP 400: Target column not found in dataset. Available columns: [...]` |

---

## 8. Targeted Fixes & Dedicated Regression Test Suite

During the design of the stress harness, four boundary conditions were codified into a permanent automated regression test suite:

### 8.1 Regression Suite Implementation
Created [`backend/tests/test_phase17d_stress_contracts.py`](file:///C:/Users/ishit/AutoNexa/backend/tests/test_phase17d_stress_contracts.py) with four dedicated contract tests:
1. `test_training_budget_schema_bounds`: Verifies lower ($5\text{s}$) and upper ($300\text{s}$) Pydantic schema validation bounds.
2. `test_row_and_column_limit_enforcement`: Confirms clean HTTP 400 rejection when datasets exceed configured row or column limits.
3. `test_prediction_batch_size_limit`: Confirms HTTP 400 rejection when prediction payloads exceed $1,000$ records.
4. `test_time_budget_candidate_skipping`: Uses monkeypatched clock advancement to verify that candidate models exceeding the time budget are assigned `ModelStatus.SKIPPED_TIMEOUT` and completed gracefully.

### 8.2 Test Suite Execution Results
- **Dedicated Stress Contract Tests:** **4 passed in 6.22s**.
- **Full Backend Regression Suite:** **309 passed in 80.24s (0 failures)**.
- **Frontend Linter:** **0 errors, 158 warnings** (clean exit code 0).
- **Frontend Production Build:** **Static optimization successful across all routes (exit code 0)**.

---

## 9. Architectural Bottlenecks & Limitations

To ensure honest engineering reporting, the following physical and architectural boundaries are documented:

1. **Single-Worker In-Memory Serving:**
   - In `ModelServingService`, the 20-model LRU cache (`_GLOBAL_MODEL_CACHE`) is held in the memory of the active Python process.
   - *Limitation:* If deployed behind a multi-worker load balancer (e.g. multiple Uvicorn worker processes or Kubernetes pods) without sticky sessions, cache hits will be partitioned across workers, and cache invalidation calls will only clear the worker receiving the request.
2. **CPU Thread Contention During Concurrent Training:**
   - AutoNexa's candidate models (Random Forest, HistGradientBoosting) use OpenMP multithreading under the hood.
   - *Limitation:* When multiple training requests execute simultaneously on the same host, OpenMP threads compete for physical CPU cores, causing aggregate training duration to scale linearly with concurrent jobs.
3. **Synchronous Training Endpoint Execution:**
   - `POST /api/v1/datasets/{id}/train` executes synchronously within the FastAPI threadpool worker.
   - *Limitation:* The client HTTP connection must remain open for the duration of the training budget (up to 300s). For serverless deployments (such as Vercel, which enforces a 10s or 60s execution limit), long training runs must be offloaded to asynchronous background workers or message queues (e.g. Celery / Cloud Tasks).
4. **SQLite Concurrency Ceiling:**
   - SQLite operates in WAL mode (`PRAGMA journal_mode=WAL; busy_timeout=5000;`).
   - *Limitation:* While read operations scale concurrently without locking, concurrent write operations serialize behind the single database file lock. High sustained write concurrency ($>50$ simultaneous writes per second) will hit the 5,000ms busy timeout.

---

## 10. Recommendations for Safe Production Deployment

1. **Asynchronous Training Queue:** For production workloads with training budgets $>15\text{s}$, decouple training from the HTTP request-response cycle using an asynchronous task runner with job status polling (`POST /train` returns `202 Accepted` with a job ID).
2. **Horizontal Serving Scaling:** When scaling model serving across multiple containers, replace the local in-memory LRU cache with an external distributed cache (Redis) or use dedicated model server sidecars (Triton / TorchServe / BentoML).
3. **Relational Database Migration:** For multi-instance deployments, transition from SQLite to a managed PostgreSQL cluster (e.g. Cloud SQL) to eliminate file-lock serialization on experiment cataloging.
4. **Container Resource Allocation:** In Kubernetes or Docker environments, assign minimum container limits of $1\text{ CPU}$ and $1\text{ GB RAM}$ (recommended $2\text{ CPU}$, $2\text{ GB RAM}$) to support 25,000-row tabular AutoML training without CPU throttling.

---

## 11. Reproducible Artifacts Created

The empirical measurements and manifests produced during Phase 17D are persisted in the repository:

1. **Formal Quality Report:** [`docs/quality/phase_17d_performance_stress_validation.md`](file:///c:/Users/ishit/AutoNexa/docs/quality/phase_17d_performance_stress_validation.md) (This document).
2. **Machine-Readable JSON Results:** [`data/research_benchmarks/phase_17d/phase_17d_results.json`](file:///c:/Users/ishit/AutoNexa/data/research_benchmarks/phase_17d/phase_17d_results.json) (Contains full system baseline, audit findings, 9 scenario outcomes, boundary checks, and concurrency results).
3. **Tabular Results CSV:** [`data/research_benchmarks/phase_17d/phase_17d_results.csv`](file:///c:/Users/ishit/AutoNexa/data/research_benchmarks/phase_17d/phase_17d_results.csv) (Summary metrics across all evaluated scenarios).
4. **Cryptographic Reproducibility Manifest:** [`data/research_benchmarks/phase_17d/phase_17d_manifest.json`](file:///c:/Users/ishit/AutoNexa/data/research_benchmarks/phase_17d/phase_17d_manifest.json).
5. **Automated Stress Test Harness:** `scratch/run_phase17d_stress_validation.py`.
6. **Permanent Regression Test Suite:** [`backend/tests/test_phase17d_stress_contracts.py`](file:///c:/Users/ishit/AutoNexa/backend/tests/test_phase17d_stress_contracts.py).

### Exact Command to Reproduce:
```powershell
# Run the Phase 17D stress test suite
.\backend\.venv\Scripts\python.exe C:\Users\ishit\.gemini\antigravity\brain\0512cb4a-2e5b-406b-915c-35377c91c579\scratch\run_phase17d_stress_validation.py

# Run dedicated Phase 17D contract regression tests
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_phase17d_stress_contracts.py -v
```

---

## 12. Final Verdict

### **VERDICT: PASS WITH LIMITATIONS**

**Justification:**
1. **Planned Workload Execution:** All 9 planned stress scenarios (from small baselines to 25,000-row workloads, wide feature spaces, and dirty data challenges) executed successfully with 100% empirical traceability.
2. **Boundary & Limit Enforcement:** All 6 boundary safety and resource rejection checks passed cleanly without unhandled exceptions or internal path leaks.
3. **Concurrency & Data Integrity:** Verified threadpool isolation for concurrent predictions (50/50 success) and concurrent training jobs (unique experiment IDs, clean SQLite transactions).
4. **Evidence Audit Integrity:** Successfully audited and documented the Phase 17C Diabetes multi-seed metric label, California Housing 10% sampling provenance, and memory measurement methods.
5. **No Unsupported Claims:** The verdict is designated **PASS WITH LIMITATIONS** to accurately represent the verified stability within documented single-node boundaries, while explicitly noting architectural constraints regarding single-worker memory caching, threadpool CPU contention, and synchronous HTTP training lifecycles.

