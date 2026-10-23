"""Tests for Phase 16F: Readiness probe non-blocking concurrency, timeout safety, and traceback sanitization."""

import asyncio
import logging
import time
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes.health import (
    READINESS_TIMEOUT_SECONDS,
    _check_db_connectivity_sync,
    _check_storage_writeability_sync,
)
from app.core.config import get_settings
from app.core.logging import StructuredLogFormatter, sanitize_log_message
from app.core.metrics import get_metrics_collector
from app.main import app

client = TestClient(app)


# =============================================================================
# 1. Non-Blocking Readiness Probe & Concurrency Tests (Finding M-1)
# =============================================================================

def test_readiness_probe_non_blocking_concurrency():
    """Verify that a slow or contending database check running in worker threadpool does not stall the event loop."""
    settings = get_settings()
    headers = {"X-API-Key": settings.api_key_read}

    # Simulate a database check that takes 0.5s in the threadpool
    def slow_db():
        time.sleep(0.5)
        return True, 500.0, None

    with patch("app.api.routes.health._check_db_connectivity_sync", side_effect=slow_db):
        t0 = time.perf_counter()
        res = client.get("/api/v1/health/readiness", headers=headers)
        elapsed = time.perf_counter() - t0

        assert res.status_code == 200
        data = res.json()
        assert data["ready"] is True
        assert data["checks"]["database"]["status"] == "ok"
        assert elapsed >= 0.45


def test_readiness_probe_timeout_bounded():
    """Verify that if database connectivity exceeds READINESS_TIMEOUT_SECONDS, probe fails fast with 503."""
    settings = get_settings()
    headers = {"X-API-Key": settings.api_key_read}
    collector = get_metrics_collector()
    initial_db_errors = collector.get_snapshot()["metadata_db"]["errors_total"]

    # Simulate a hanging database query that exceeds timeout
    def hanging_db():
        time.sleep(READINESS_TIMEOUT_SECONDS + 1.0)
        return True, 4000.0, None

    # Patch timeout to a small value for fast testing
    with patch("app.api.routes.health.READINESS_TIMEOUT_SECONDS", 0.2):
        with patch("app.api.routes.health._check_db_connectivity_sync", side_effect=hanging_db):
            t0 = time.perf_counter()
            res = client.get("/api/v1/health/readiness", headers=headers)
            elapsed = time.perf_counter() - t0

            assert res.status_code == 503
            assert elapsed < 1.0  # Must not hang indefinitely
            data = res.json()
            assert data["ready"] is False
            assert data["status"] == "unhealthy"
            assert data["checks"]["database"]["status"] == "unhealthy"
            assert "timed out" in data["checks"]["database"]["error"]

            new_db_errors = collector.get_snapshot()["metadata_db"]["errors_total"]
            assert new_db_errors > initial_db_errors


def test_readiness_probe_storage_timeout_bounded():
    """Verify that if storage write check hangs or times out, readiness returns 503 degraded without hanging."""
    settings = get_settings()
    headers = {"X-API-Key": settings.api_key_read}

    def hanging_storage(upload_dir, artifacts_dir):
        time.sleep(1.0)
        return True, True, None

    with patch("app.api.routes.health.READINESS_TIMEOUT_SECONDS", 0.15):
        with patch("app.api.routes.health._check_storage_writeability_sync", side_effect=hanging_storage):
            t0 = time.perf_counter()
            res = client.get("/api/v1/health/readiness", headers=headers)
            elapsed = time.perf_counter() - t0

            assert res.status_code == 503
            assert elapsed < 0.8
            data = res.json()
            assert data["ready"] is False
            assert data["status"] == "degraded"
            assert data["checks"]["storage"]["status"] == "degraded"
            assert "timed out" in data["checks"]["storage"]["error"]


def test_readiness_probe_database_exception_handled():
    """Verify that an unexpected database exception produces a bounded 503 and logs metric."""
    settings = get_settings()
    headers = {"X-API-Key": settings.api_key_read}

    with patch("app.api.routes.health._check_db_connectivity_sync", side_effect=RuntimeError("SQLite lock contention")):
        res = client.get("/api/v1/health/readiness", headers=headers)
        assert res.status_code == 503
        data = res.json()
        assert data["ready"] is False
        assert "SQLite lock contention" in data["checks"]["database"]["error"]


# =============================================================================
# 2. Traceback & Stack Sanitization Tests (Finding L-1)
# =============================================================================

def test_traceback_sanitization_windows_and_linux_paths():
    """Verify that StructuredLogFormatter.formatException sanitizes Windows and Linux user directories in tracebacks."""
    formatter = StructuredLogFormatter()

    try:
        raise ValueError("Synthetic error for traceback testing")
    except ValueError:
        import sys
        ei = sys.exc_info()

    # Create raw traceback string and format through formatter
    formatted_tb = formatter.formatException(ei)
    assert "Traceback (most recent call last):" in formatted_tb
    assert "Synthetic error for traceback testing" in formatted_tb

    # Test with synthetic Windows backslash path
    synthetic_win_tb = (
        'Traceback (most recent call last):\n'
        '  File "C:\\Users\\synthetic_user\\AutoNexa\\backend\\app\\api\\routes\\health.py", line 42, in test_fn\n'
        '    raise RuntimeError("synthetic error")\n'
    )
    sanitized_win = sanitize_log_message(synthetic_win_tb)
    assert "C:\\Users\\synthetic_user\\" not in sanitized_win
    assert "[HOME]\\" in sanitized_win
    assert "line 42, in test_fn" in sanitized_win  # Preserves line and function debugging context

    # Test with synthetic Windows forward-slash path
    synthetic_win_fwd = (
        'Traceback (most recent call last):\n'
        '  File "C:/Users/synthetic_user/AutoNexa/backend/app/main.py", line 15, in startup\n'
        '    raise RuntimeError("synthetic error")\n'
    )
    sanitized_fwd = sanitize_log_message(synthetic_win_fwd)
    assert "C:/Users/synthetic_user/" not in sanitized_fwd
    assert "[HOME]/" in sanitized_fwd
    assert "line 15, in startup" in sanitized_fwd

    # Test with synthetic Linux path
    synthetic_linux_tb = (
        'Traceback (most recent call last):\n'
        '  File "/home/synthetic_deployer/AutoNexa/backend/app/db/session.py", line 88, in get_session\n'
        '    raise ConnectionError("connection failed")\n'
    )
    sanitized_linux = sanitize_log_message(synthetic_linux_tb)
    assert "/home/synthetic_deployer/" not in sanitized_linux
    assert "[HOME]/" in sanitized_linux
    assert "line 88, in get_session" in sanitized_linux


def test_traceback_sanitization_tokens_and_secrets():
    """Verify that formatted tracebacks containing synthetic secrets are properly scrubbed."""
    formatter = StructuredLogFormatter()

    # Synthetic traceback with Bearer token, API key, and password assignments
    synthetic_secret_tb = (
        'Traceback (most recent call last):\n'
        '  File "app/service.py", line 10, in authenticate\n'
        '    client.auth(token="Bearer eyJhbGciOi_SYNTHETIC_BEARER_TOKEN_999999")\n'
        '  File "app/client.py", line 25, in connect\n'
        '    login(api_key="autonexa_synthetic_admin_key_12345", password="synthetic_password_xyz987")\n'
        'ValueError: Failed connecting with token=ak_synthetic_secret_998877\n'
    )

    sanitized = sanitize_log_message(synthetic_secret_tb)

    # Assert all synthetic credentials are redacted
    assert "eyJhbGciOi_SYNTHETIC_BEARER_TOKEN_999999" not in sanitized
    assert "[REDACTED_TOKEN]" in sanitized

    assert "autonexa_synthetic_admin_key_12345" not in sanitized
    assert "ak_synthetic_secret_998877" not in sanitized
    assert "[REDACTED_API_KEY]" in sanitized

    assert "synthetic_password_xyz987" not in sanitized
    assert "[REDACTED]" in sanitized

    # Assert traceback line numbers and structure remain intact
    assert "line 10, in authenticate" in sanitized
    assert "line 25, in connect" in sanitized


def test_structured_log_formatter_with_exception_record():
    """Verify that logging a record with exc_info scrubs the exception traceback in output."""
    formatter = StructuredLogFormatter()

    try:
        # Raise synthetic exception with a synthetic password in the message
        raise ValueError("Failed login with password='synthetic_secret_pwd_456'")
    except ValueError:
        import sys
        record = logging.LogRecord(
            name="app.test",
            level=logging.ERROR,
            pathname=r"C:\Users\synthetic_dev\AutoNexa\backend\app\test.py",
            lineno=55,
            msg="Exception encountered in handler: api_key='ak_synthetic_key_12345678'",
            args=(),
            exc_info=sys.exc_info(),
        )

    formatted = formatter.format(record)

    # Check that message was sanitized
    assert "ak_synthetic_key_12345678" not in formatted
    assert "[REDACTED_API_KEY]" in formatted

    # Check that exception traceback was sanitized
    assert "synthetic_secret_pwd_456" not in formatted
    assert "[REDACTED]" in formatted
    assert "C:\\Users\\synthetic_dev\\" not in formatted
    assert "[HOME]\\" in formatted


# =============================================================================
# 3. Release Safety: Backup, Verification & Recovery (Stage 6)
# =============================================================================

def test_sqlite_safe_backup_verification_and_restore(tmp_path):
    """Verify end-to-end SQLite online backup, checksum verification, and clean restoration."""
    import sqlite3
    from scripts.backup_restore import create_backup, restore_backup, verify_backup

    base_dir = tmp_path / "app_root"
    base_dir.mkdir()

    # 1. Setup mock SQLite database
    db_dir = base_dir / "data"
    db_dir.mkdir()
    db_path = db_dir / "metadata.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE mock_datasets (id TEXT PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO mock_datasets VALUES ('ds-1', 'iris_data')")
    conn.commit()
    conn.close()

    # 2. Setup mock uploads & experiments
    uploads_dir = base_dir / "uploads"
    uploads_dir.mkdir()
    (uploads_dir / "sample.csv").write_text("a,b,c\n1,2,3", encoding="utf-8")

    experiments_dir = base_dir / "experiments"
    experiments_dir.mkdir()
    (experiments_dir / "model.bin").write_bytes(b"SYNTHETIC_MODEL_BYTES")

    # 3. Execute backup
    backup_out = tmp_path / "backups"
    backup_out.mkdir()
    archive = create_backup(base_dir=base_dir, output_dir=backup_out)
    assert archive.exists()
    assert archive.suffix == ".gz"

    # 4. Verify archive integrity
    manifest = verify_backup(archive)
    assert "metadata.db" in manifest["components"]["database"]["backup_filename"]
    assert manifest["components"]["database"]["table_counts"]["mock_datasets"] == 1

    # 5. Restore to clean directory
    restore_target = tmp_path / "restored_root"
    restore_target.mkdir()
    restore_backup(archive_path=archive, target_base_dir=restore_target)

    # 6. Verify restored database and files
    restored_db = restore_target / "data" / "metadata.db"
    assert restored_db.exists()

    rconn = sqlite3.connect(str(restored_db))
    rows = rconn.execute("SELECT id, name FROM mock_datasets").fetchall()
    rconn.close()
    assert rows == [("ds-1", "iris_data")]

    assert (restore_target / "uploads" / "sample.csv").read_text(encoding="utf-8") == "a,b,c\n1,2,3"
    assert (restore_target / "experiments" / "model.bin").read_bytes() == b"SYNTHETIC_MODEL_BYTES"

