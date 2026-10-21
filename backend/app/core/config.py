"""Centralized application settings and configuration management."""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings resolved from environment variables and defaults."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application Information
    app_name: str = Field(
        default="AutoNexa",
        validation_alias=AliasChoices("APP_NAME", "PROJECT_NAME"),
        description="Name of the application",
    )
    app_version: str = Field(
        default="0.1.0",
        validation_alias="APP_VERSION",
        description="Application semantic version",
    )
    app_description: str = Field(
        default="An automated machine-learning research platform for tabular datasets.",
        validation_alias="APP_DESCRIPTION",
        description="Application description for OpenAPI documentation",
    )

    # API Routing
    api_v1_prefix: str = Field(
        default="/api/v1",
        validation_alias="API_V1_PREFIX",
        description="Base routing prefix for API v1 endpoints",
    )

    # Runtime Environment
    environment: str = Field(
        default="development",
        validation_alias="ENVIRONMENT",
        description="Runtime environment (development, staging, production)",
    )
    debug: bool = Field(
        default=False,
        validation_alias="DEBUG",
        description="Debug mode toggle",
    )

    # Server Configuration
    server_host: str = Field(
        default="127.0.0.1",
        validation_alias="SERVER_HOST",
        description="Host interface for development server binding",
    )
    server_port: int = Field(
        default=8000,
        validation_alias="SERVER_PORT",
        description="Port for development server binding",
    )

    # Cross-Origin Resource Sharing (CORS)
    backend_cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
        validation_alias="BACKEND_CORS_ORIGINS",
        description="List of allowed CORS origins for client applications",
    )

    # Storage & Upload Configuration
    upload_dir: str = Field(
        default="uploads",
        validation_alias=AliasChoices("UPLOAD_DIR"),
        description="Directory where uploaded datasets are stored",
    )
    max_upload_size_bytes: int = Field(
        default=10 * 1024 * 1024,  # 10 MB default
        validation_alias=AliasChoices("MAX_UPLOAD_SIZE_BYTES", "MAX_UPLOAD_SIZE"),
        description="Maximum permitted upload size in bytes (default 10 MB)",
    )

    # AutoML Training & Experiments Configuration
    experiments_dir: str = Field(
        default="experiments",
        validation_alias=AliasChoices("EXPERIMENTS_DIR"),
        description="Directory where experiment metadata and artifacts are stored",
    )
    enable_mlflow_tracking: bool = Field(
        default=True,
        validation_alias=AliasChoices("ENABLE_MLFLOW_TRACKING"),
        description="Toggle for logging experiments and candidate runs to MLflow",
    )
    mlflow_tracking_uri: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("MLFLOW_TRACKING_URI"),
        description="Custom MLflow tracking URI; if omitted, defaults to file:<experiments_dir>/mlruns",
    )
    max_dataset_rows: int = Field(
        default=100000,
        validation_alias=AliasChoices("MAX_DATASET_ROWS"),
        description="Maximum permitted rows for dataset training",
    )
    max_dataset_columns: int = Field(
        default=500,
        validation_alias=AliasChoices("MAX_DATASET_COLUMNS"),
        description="Maximum permitted columns for dataset training",
    )
    max_training_budget_seconds: int = Field(
        default=300,
        validation_alias=AliasChoices("MAX_TRAINING_BUDGET_SECONDS"),
        description="Maximum allowed training budget in seconds (default 300s)",
    )

    # Inference & Prediction Limits
    max_prediction_records: int = Field(
        default=1000,
        validation_alias=AliasChoices("MAX_PREDICTION_RECORDS"),
        description="Maximum permitted records in a single JSON prediction request",
    )
    max_prediction_csv_rows: int = Field(
        default=10000,
        validation_alias=AliasChoices("MAX_PREDICTION_CSV_ROWS"),
        description="Maximum permitted rows in a single CSV batch prediction request",
    )
    max_prediction_csv_size_bytes: int = Field(
        default=5 * 1024 * 1024,  # 5 MB
        validation_alias=AliasChoices("MAX_PREDICTION_CSV_SIZE_BYTES"),
        description="Maximum permitted upload size for CSV batch prediction in bytes (default 5 MB)",
    )

    # Explainability, Error Analysis & Benchmarking Limits
    max_explainability_sample_size: int = Field(
        default=500,
        validation_alias=AliasChoices("MAX_EXPLAINABILITY_SAMPLE_SIZE"),
        description="Maximum background evaluation sample size for feature importance and SHAP",
    )
    max_explainability_records: int = Field(
        default=50,
        validation_alias=AliasChoices("MAX_EXPLAINABILITY_RECORDS"),
        description="Maximum permitted records in a single local prediction explanation request",
    )
    max_benchmark_experiments: int = Field(
        default=20,
        validation_alias=AliasChoices("MAX_BENCHMARK_EXPERIMENTS"),
        description="Maximum number of experiments that can be compared in a single benchmark request",
    )
    explainability_n_permutations: int = Field(
        default=5,
        validation_alias=AliasChoices("EXPLAINABILITY_N_PERMUTATIONS"),
        description="Number of shuffle iterations for permutation feature importance",
    )
    max_repeated_seeds: int = Field(
        default=10,
        validation_alias=AliasChoices("MAX_REPEATED_SEEDS"),
        description="Maximum permitted random seeds in a single repeated-run benchmark series (default 10)",
    )
    default_bootstrap_resamples: int = Field(
        default=1000,
        validation_alias=AliasChoices("DEFAULT_BOOTSTRAP_RESAMPLES"),
        description="Default number of resamples for statistical bootstrap confidence intervals",
    )

    # Phase 16B: Unified API Security & Access Control Configuration
    api_auth_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("API_AUTH_ENABLED", "SERVING_AUTH_ENABLED", "AUTH_ENABLED"),
        description="Whether to enforce API key authentication across AutoNexa endpoints",
    )
    api_key_read: str = Field(
        default="autonexa-read-key-secret",
        validation_alias=AliasChoices("API_KEY_READ", "SERVING_API_KEY_READ", "SERVING_API_KEY"),
        description="Read-only / inference API key for querying endpoints, inspecting metadata, and running predictions",
    )
    api_key_admin: str = Field(
        default="autonexa-admin-key-secret",
        validation_alias=AliasChoices("API_KEY_ADMIN", "SERVING_API_KEY_ADMIN"),
        description="Admin API key for privileged operations (dataset uploads, training, promotion, deletion)",
    )
    @property
    def serving_auth_enabled(self) -> bool:
        return self.api_auth_enabled

    @serving_auth_enabled.setter
    def serving_auth_enabled(self, val: bool) -> None:
        self.api_auth_enabled = val

    @property
    def serving_api_key_read(self) -> str:
        return self.api_key_read

    @serving_api_key_read.setter
    def serving_api_key_read(self, val: str) -> None:
        self.api_key_read = val

    @property
    def serving_api_key_admin(self) -> str:
        return self.api_key_admin

    @serving_api_key_admin.setter
    def serving_api_key_admin(self, val: str) -> None:
        self.api_key_admin = val

    serving_eligible_stages: List[str] = Field(
        default=["production", "staging"],
        validation_alias=AliasChoices("SERVING_ELIGIBLE_STAGES"),
        description="List of model lifecycle stages eligible for serving (default: production, staging)",
    )
    serving_cache_max_models: int = Field(
        default=20,
        validation_alias=AliasChoices("SERVING_CACHE_MAX_MODELS"),
        description="Maximum number of loaded model pipelines cached in memory simultaneously",
    )

    # Phase 14: Model Monitoring, Drift Detection & Automated Retraining Configuration
    monitoring_max_records_per_window: int = Field(
        default=5000,
        validation_alias=AliasChoices("MONITORING_MAX_RECORDS_PER_WINDOW"),
        description="Maximum number of records accepted per monitoring window or batch",
    )
    monitoring_min_samples_drift: int = Field(
        default=30,
        validation_alias=AliasChoices("MONITORING_MIN_SAMPLES_DRIFT"),
        description="Minimum sample count required to compute statistically defensible drift metrics without warnings",
    )
    monitoring_psi_warning_threshold: float = Field(
        default=0.1,
        validation_alias=AliasChoices("MONITORING_PSI_WARNING_THRESHOLD"),
        description="Population Stability Index (PSI) threshold for moderate drift warning (default 0.1)",
    )
    monitoring_psi_critical_threshold: float = Field(
        default=0.2,
        validation_alias=AliasChoices("MONITORING_PSI_CRITICAL_THRESHOLD"),
        description="Population Stability Index (PSI) threshold for significant drift alert (default 0.2)",
    )
    monitoring_ks_pvalue_threshold: float = Field(
        default=0.05,
        validation_alias=AliasChoices("MONITORING_KS_PVALUE_THRESHOLD"),
        description="Two-sample Kolmogorov-Smirnov p-value significance threshold for distributional drift (default 0.05)",
    )
    monitoring_unseen_category_rate_threshold: float = Field(
        default=0.05,
        validation_alias=AliasChoices("MONITORING_UNSEEN_CATEGORY_RATE_THRESHOLD"),
        description="Threshold fraction of newly observed categories in categorical features triggering drift alert (default 0.05)",
    )
    monitoring_missing_rate_delta_threshold: float = Field(
        default=0.1,
        validation_alias=AliasChoices("MONITORING_MISSING_RATE_DELTA_THRESHOLD"),
        description="Maximum acceptable increase in missing value rate before flagging data quality degradation (default 0.1)",
    )
    monitoring_retraining_regression_tolerance: float = Field(
        default=0.02,
        validation_alias=AliasChoices("MONITORING_RETRAINING_REGRESSION_TOLERANCE"),
        description="Maximum permissible relative regression for a retrained candidate model vs current production (default 0.02 = 2%)",
    )
    monitoring_max_retraining_concurrency: int = Field(
        default=1,
        validation_alias=AliasChoices("MONITORING_MAX_RETRAINING_CONCURRENCY"),
        description="Maximum number of concurrent retraining jobs permitted simultaneously (default 1)",
    )

    # Phase 15 Pipeline Orchestration Settings
    pipeline_max_concurrency: int = Field(
        default=2,
        validation_alias=AliasChoices("PIPELINE_MAX_CONCURRENCY"),
        description="Maximum number of simultaneous active pipeline executions (default 2)",
    )
    pipeline_timeout_seconds: int = Field(
        default=600,
        validation_alias=AliasChoices("PIPELINE_TIMEOUT_SECONDS"),
        description="Maximum execution timeout for an entire pipeline run in seconds (default 600)",
    )

    @model_validator(mode="after")
    def validate_and_sync_security_settings(self) -> "Settings":
        """Validate fail-closed security configuration in production."""

        # Fail-closed validation when running in production
        if self.environment and self.environment.strip().lower() == "production":
            if not self.api_auth_enabled or not self.serving_auth_enabled:
                raise ValueError(
                    "Insecure production configuration: API authentication cannot be disabled when ENVIRONMENT=production."
                )

            insecure_defaults = {
                "autonexa-read-key-secret",
                "autonexa-admin-key-secret",
                "secret",
                "changeme",
                "admin",
                "password",
                "default",
                "test",
            }

            admin_key = (self.api_key_admin or "").strip()
            read_key = (self.api_key_read or "").strip()

            if not admin_key or admin_key.lower() in insecure_defaults:
                raise ValueError(
                    "Insecure production configuration: API_KEY_ADMIN must be set to a strong, non-default secret when ENVIRONMENT=production."
                )

            if not read_key or read_key.lower() in insecure_defaults:
                raise ValueError(
                    "Insecure production configuration: API_KEY_READ must be set to a strong, non-default secret when ENVIRONMENT=production."
                )

            if admin_key == read_key:
                raise ValueError(
                    "Insecure production configuration: API_KEY_ADMIN and API_KEY_READ must be distinct secrets with proper role separation."
                )

            if len(admin_key) < 16:
                raise ValueError(
                    "Insecure production configuration: API_KEY_ADMIN must be at least 16 characters long."
                )

            if len(read_key) < 16:
                raise ValueError(
                    "Insecure production configuration: API_KEY_READ must be at least 16 characters long."
                )

        return self

    @property
    def resolved_upload_dir(self) -> Path:
        """Return absolute Path for uploads directory, creating it if needed."""
        path = Path(self.upload_dir)
        if not path.is_absolute():
            # Resolve relative to the backend directory
            base_dir = Path(__file__).resolve().parent.parent.parent
            path = (base_dir / self.upload_dir).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_experiments_dir(self) -> Path:
        """Return absolute Path for experiments directory, creating it if needed."""
        path = Path(self.experiments_dir)
        if not path.is_absolute():
            base_dir = Path(__file__).resolve().parent.parent.parent
            # Check if experiments exists at project root (parent of backend)
            if (base_dir.parent / self.experiments_dir).is_dir():
                path = (base_dir.parent / self.experiments_dir).resolve()
            else:
                path = (base_dir / self.experiments_dir).resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_monitoring_dir(self) -> Path:
        """Return absolute Path for model monitoring storage directory."""
        path = (self.resolved_experiments_dir / "monitoring").resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def resolved_pipelines_dir(self) -> Path:
        """Return absolute Path for pipeline orchestration storage directory."""
        path = (self.resolved_experiments_dir / "pipelines").resolve()
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton instance."""
    return Settings()


settings: Settings = get_settings()
