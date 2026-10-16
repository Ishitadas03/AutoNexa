"""Centralized application settings and configuration management."""

from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic import AliasChoices, Field
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


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton instance."""
    return Settings()


settings: Settings = get_settings()
