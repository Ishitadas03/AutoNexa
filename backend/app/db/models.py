"""SQLAlchemy ORM models for AutoNexa Phase 16D metadata catalog and indexing."""

from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import declarative_base, synonym

Base = declarative_base()


def utc_now() -> datetime:
    """Return timezone-aware current UTC datetime."""
    return datetime.now(timezone.utc)


class SchemaVersionModel(Base):
    """Schema version ledger for migration tracking."""

    __tablename__ = "schema_versions"

    version = Column(Integer, primary_key=True)
    applied_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    description = Column(String(255), nullable=False)


class DatasetModel(Base):
    """Persistent catalog model for uploaded datasets."""

    __tablename__ = "datasets"

    dataset_id = Column(String(64), primary_key=True, index=True)
    filename = Column(String(255), nullable=False, index=True)
    rows = Column(Integer, nullable=False)
    columns = Column(Integer, nullable=False)
    row_count = synonym("rows")
    column_count = synonym("columns")
    column_names = Column(JSON, nullable=False)
    data_types = Column(JSON, nullable=False)
    missing_values = Column(JSON, nullable=False)
    duplicate_rows = Column(Integer, nullable=False, default=0)
    memory_usage_bytes = Column(BigInteger, nullable=False, default=0)
    file_size_bytes = Column(BigInteger, nullable=False, default=0)
    fingerprint_sha256 = Column(String(64), nullable=False, index=True)
    validation_status = Column(String(32), nullable=False, default="validated", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)

    __table_args__ = (
        Index("ix_datasets_created_at_desc", created_at.desc(), dataset_id.desc()),
    )


class ExperimentModel(Base):
    """Indexed metadata model for AutoML experiments."""

    __tablename__ = "experiments"

    experiment_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    dataset_id = Column(String(64), nullable=False, index=True)
    dataset_fingerprint = Column(String(64), nullable=False, index=True)
    task_type = Column(String(64), nullable=False, index=True)
    target_column = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, index=True)
    best_model = Column(String(128), nullable=True, index=True)
    model_name = synonym("best_model")
    best_score = Column(Float, nullable=True)
    primary_metric = Column(String(64), nullable=False)
    primary_metric_greater_is_better = Column(Boolean, nullable=True)
    evaluation_strategy = Column(String(64), nullable=True)
    total_duration_seconds = Column(Float, nullable=True)
    models_count = Column(Integer, nullable=False, default=0)
    has_artifact = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)
    artifacts_manifest = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_experiments_created_at_desc", created_at.desc(), experiment_id.desc()),
        Index("ix_experiments_status_created_at", status, created_at.desc()),
    )


class PipelineModel(Base):
    """Indexed metadata model for end-to-end AutoML pipeline orchestrations."""

    __tablename__ = "pipelines"

    pipeline_id = Column(String(64), primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    model_name = Column(String(128), nullable=False, index=True)
    dataset_id = Column(String(64), nullable=False, index=True)
    target_column = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, index=True)
    current_stage = Column(String(64), nullable=True)
    total_stages = Column(Integer, nullable=False, default=0)
    completed_stages = Column(Integer, nullable=False, default=0)
    retry_count = Column(Integer, nullable=False, default=0)
    failure_reason = Column(Text, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=utc_now, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    manifest_json = Column(JSON, nullable=False)

    __table_args__ = (
        Index("ix_pipelines_created_at_desc", created_at.desc(), pipeline_id.desc()),
        Index("ix_pipelines_status_created_at", status, created_at.desc()),
    )
