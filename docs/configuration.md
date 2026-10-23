# AutoNexa Configuration Reference

AutoNexa manages application settings through Pydantic Settings (`app.core.config.Settings`). Configuration is loaded from environment variables and `.env` files.

---

## 1. Environment Variable Reference Table

| Variable | Type | Default Value | Required in Production | Description & Validation Constraints |
| :--- | :--- | :--- | :---: | :--- |
| `APP_NAME` | string | `AutoNexa` | No | Name of the platform application. |
| `APP_VERSION` | string | `0.1.0` | No | Semantic version of the AutoNexa release. |
| `APP_DESCRIPTION` | string | `An automated machine-learning...` | No | Description displayed in OpenAPI and Swagger docs. |
| `ENVIRONMENT` | string | `development` | Yes | Runtime environment: `development`, `staging`, or `production`. *(In production, enforces fail-closed authentication)*. |
| `DEBUG` | boolean | `false` | No | Enables verbose debugging mode and stack traces. Must be `false` in production. |
| `LOG_LEVEL` | string | `INFO` | No | Logging output threshold: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`. |
| `API_V1_PREFIX` | string | `/api/v1` | No | Base routing prefix for all REST API endpoints. |
| `SERVER_HOST` | string | `127.0.0.1` | No | Network interface for server binding (`0.0.0.0` for Docker containers). |
| `SERVER_PORT` | integer | `8000` | No | Port for incoming HTTP requests. |
| `BACKEND_CORS_ORIGINS` | JSON list | `["http://localhost:3000"]` | No | JSON-encoded array of allowed browser origins for CORS. |
| `UPLOAD_DIR` | path | `uploads` | No | Directory for storing uploaded raw `.csv` datasets. Must be mapped to persistent storage. |
| `EXPERIMENTS_DIR` | path | `experiments` | No | Root directory for trained model binaries, MLflow runs, and pipeline manifests. |
| `METADATA_DB_PATH` | path | `data/metadata.db` | No | SQLite database file location for relational metadata indexing. |
| `MAX_UPLOAD_SIZE_BYTES` | integer | `10485760` (10 MB) | No | Strict byte ceiling for incoming multipart CSV streams. |
| `API_AUTH_ENABLED` | boolean | `true` | No | Global toggle for API key authentication. *(Cannot be set to false in production)*. |
| `API_KEY_READ` | string | `autonexa-read-key-secret` | Yes | Token for read-only querying, inspection, and inference. Must be >= 16 chars and non-default in production. |
| `API_KEY_ADMIN` | string | `autonexa-admin-key-secret` | Yes | Token for uploads, training, pipeline runs, and promotion. Must be distinct from `API_KEY_READ`. |
| `SERVING_ELIGIBLE_STAGES`| JSON list | `["production","staging"]` | No | Lifecycle stages permitted to serve prediction traffic. |
| `SERVING_CACHE_MAX_MODELS`| integer | `20` | No | Maximum number of deserialized `.joblib` model pipelines cached in memory. |
| `MAX_DATASET_ROWS` | integer | `100000` | No | Resource guard: Maximum allowed tabular rows per training execution. |
| `MAX_DATASET_COLUMNS` | integer | `500` | No | Resource guard: Maximum allowed tabular columns per training execution. |
| `MAX_TRAINING_BUDGET_SECONDS` | integer | `300` | No | Wall-clock execution time limit per AutoML model selection run. |
| `PIPELINE_MAX_CONCURRENCY` | integer | `2` | No | Maximum concurrent end-to-end pipeline executions in worker threadpool. |
| `PIPELINE_TIMEOUT_SECONDS` | integer | `600` | No | Maximum execution timeout for an end-to-end pipeline run before cancellation. |
| `MONITORING_MAX_RECORDS_PER_WINDOW` | integer | `5000` | No | Maximum telemetry events retained in sliding drift detection window. |
| `MONITORING_MIN_SAMPLES_DRIFT` | integer | `30` | No | Minimum sample size required before running statistical drift tests. |
| `MONITORING_PSI_WARNING_THRESHOLD` | float | `0.1` | No | Population Stability Index threshold triggering a drift warning. |
| `MONITORING_PSI_CRITICAL_THRESHOLD` | float | `0.2` | No | Population Stability Index threshold triggering a critical drift alert. |
| `MONITORING_KS_PVALUE_THRESHOLD` | float | `0.05` | No | Kolmogorov-Smirnov p-value threshold below which numerical drift is declared. |

---

## 2. Production Fail-Closed Security Policy

When `ENVIRONMENT=production`, the application performs startup validation:
1. `API_AUTH_ENABLED` must be `true`. Disabling authentication in production causes an immediate startup exception.
2. `API_KEY_ADMIN` and `API_KEY_READ` must both be configured.
3. Default development keys (`autonexa-admin-key-secret` and `autonexa-read-key-secret`) are rejected.
4. `API_KEY_ADMIN` and `API_KEY_READ` must be distinct keys.
5. Keys must be at least 16 characters in length.

To generate secure production keys:
```bash
openssl rand -hex 24
```
