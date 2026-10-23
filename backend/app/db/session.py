"""Database engine configuration, connection lifecycle, and session management for AutoNexa."""

from contextlib import contextmanager
import logging
from pathlib import Path
import sqlite3
import threading
from typing import Dict, Generator, Optional

from sqlalchemy import Engine, create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.models import Base, SchemaVersionModel, utc_now

logger = logging.getLogger(__name__)

_ENGINES_LOCK = threading.Lock()
_ENGINES: Dict[str, Engine] = {}
_SESSION_FACTORIES: Dict[str, sessionmaker] = {}


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


def get_engine(db_path: Optional[Path] = None) -> Engine:
    """Retrieve or create an SQLAlchemy Engine for the given database path."""
    resolved_path: Path
    if db_path is not None:
        resolved_path = Path(db_path).resolve()
    else:
        resolved_path = get_settings().resolved_metadata_db_path

    key = str(resolved_path)
    with _ENGINES_LOCK:
        if key not in _ENGINES:
            resolved_path.parent.mkdir(parents=True, exist_ok=True)
            db_uri = f"sqlite:///{resolved_path}"
            logger.info("Initializing SQLite metadata engine: %s", resolved_path)
            engine = create_engine(
                db_uri,
                connect_args={"check_same_thread": False, "timeout": 30.0},
                pool_pre_ping=True,
            )
            _ENGINES[key] = engine
            _SESSION_FACTORIES[key] = sessionmaker(
                bind=engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )
        return _ENGINES[key]


def get_session_factory(db_path: Optional[Path] = None) -> sessionmaker:
    """Retrieve or initialize the sessionmaker for the target database."""
    engine = get_engine(db_path)
    key = str(getattr(engine, "_autonexa_key", None) or (db_path.resolve() if db_path else get_settings().resolved_metadata_db_path))
    with _ENGINES_LOCK:
        if key not in _SESSION_FACTORIES:
            _SESSION_FACTORIES[key] = sessionmaker(
                bind=engine,
                autocommit=False,
                autoflush=False,
                expire_on_commit=False,
            )
        return _SESSION_FACTORIES[key]


def init_db(engine: Optional[Engine] = None, db_path: Optional[Path] = None) -> None:
    """Initialize SQLite database tables, indexes, and schema version ledger."""
    target_engine = engine or get_engine(db_path)
    Base.metadata.create_all(bind=target_engine)

    # Verify or record initial schema version
    session_factory = sessionmaker(bind=target_engine, autocommit=False, autoflush=False)
    with session_factory() as session:
        try:
            stmt = select(SchemaVersionModel).where(SchemaVersionModel.version == 1)
            existing = session.execute(stmt).scalar_one_or_none()
            if existing is None:
                record = SchemaVersionModel(
                    version=1,
                    applied_at=utc_now(),
                    description="Phase 16D initial relational metadata schema (datasets, experiments, pipelines)",
                )
                session.add(record)
                session.commit()
                logger.info("Initialized metadata database schema version 1.")
        except Exception as exc:
            session.rollback()
            logger.error("Error verifying schema version: %s", exc)
            raise


def close_db(engine: Optional[Engine] = None) -> None:
    """Dispose active database engine(s) and release all file connections cleanly."""
    with _ENGINES_LOCK:
        if engine is not None:
            engine.dispose()
            # Remove from cached engines
            for k, e in list(_ENGINES.items()):
                if e is engine:
                    _ENGINES.pop(k, None)
                    _SESSION_FACTORIES.pop(k, None)
        else:
            for k, e in list(_ENGINES.items()):
                try:
                    e.dispose()
                except Exception as exc:
                    logger.warning("Error disposing engine %s: %s", k, exc)
            _ENGINES.clear()
            _SESSION_FACTORIES.clear()
    logger.info("All SQLite metadata database connections closed.")


@contextmanager
def get_db_context(db_path: Optional[Path] = None) -> Generator[Session, None, None]:
    """Context manager providing an isolated transactional database session."""
    factory = get_session_factory(db_path)
    session: Session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db(db_path: Optional[Path] = None) -> Generator[Session, None, None]:
    """FastAPI route dependency yielding a scoped database session."""
    factory = get_session_factory(db_path)
    session: Session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
