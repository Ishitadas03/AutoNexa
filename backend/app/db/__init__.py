"""Database package for AutoNexa Phase 16D metadata catalog and indexing."""

from app.db.models import (
    Base,
    DatasetModel,
    ExperimentModel,
    PipelineModel,
    SchemaVersionModel,
    UserModel,
    SessionModel,
    AuthTokenModel,
    UserRole,
    UserStatus,
    TokenType,
)
from app.db.reconciliation import MetadataReconciliationService
from app.db.repositories.dataset_repository import DatasetRepository
from app.db.repositories.experiment_repository import ExperimentRepository
from app.db.repositories.pipeline_repository import PipelineRepository
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository, normalize_email
from app.db.session import (
    close_db,
    get_db,
    get_db_context,
    get_engine,
    get_session_factory,
    init_db,
)

__all__ = [
    "Base",
    "DatasetModel",
    "ExperimentModel",
    "PipelineModel",
    "SchemaVersionModel",
    "UserModel",
    "SessionModel",
    "AuthTokenModel",
    "UserRole",
    "UserStatus",
    "TokenType",
    "MetadataReconciliationService",
    "DatasetRepository",
    "ExperimentRepository",
    "PipelineRepository",
    "SessionRepository",
    "UserRepository",
    "normalize_email",
    "close_db",
    "get_db",
    "get_db_context",
    "get_engine",
    "get_session_factory",
    "init_db",
]
