"""AutoNexa Phase 16E: Observability, Diagnostics & Operational Readiness Tests.

Validates:
1. Request correlation ID validation, generation, and response header propagation (X-Correlation-ID & X-Request-ID).
2. Missing, valid, malformed, and oversized correlation header resilience.
3. Structured logging filter and secret/path sanitization (Bearer tokens, API keys, file paths).
4. Unmodified lightweight public health check contract (GET /api/v1/health).
5. Authenticated readiness probe (GET /api/v1/health/readiness) under healthy and degraded conditions (503).
6. Admin-restricted operational diagnostics (GET /api/v1/health/diagnostics) with RBAC enforcement (401, 403, 200).
7. Thread-safe in-memory operational metrics collector, bounded labels, and API endpoint (GET /api/v1/metrics).
8. Resilience when database or storage dependencies are degraded.
"""

import logging
from pathlib import Path
import re
import threading
import time
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings
from app.core.correlation import (
    CORRELATION_ID_HEADER,
    REQUEST_ID_HEADER,
    get_correlation_id,
    resolve_correlation_id,
    set_correlation_id,
    validate_correlation_id,
)
from app.core.logging import (
    StructuredLogFormatter,
    sanitize_exception,
    sanitize_log_message,
)
from app.core.metrics import (
    MetricsCollector,
    get_metrics_collector,
    reset_metrics_collector,
)
from app.db.session import close_db, get_engine, init_db
from app.main import app


@pytest.fixture
def phase16e_env(tmp_path: Path):
    """Provide isolated environment with SQLite database and clean metrics."""
    upload_dir = tmp_path / "uploads"
    experiments_dir = tmp_path / "experiments"
    db_path = experiments_dir / "metadata.db"

    upload_dir.mkdir(parents=True, exist_ok=True)
    experiments_dir.mkdir(parents=True, exist_ok=True)

    read_key = "test-16e-read-key"
    admin_key = "test-16e-admin-key"

    test_settings = Settings(
        UPLOAD_DIR=str(upload_dir),
        EXPERIMENTS_DIR=str(experiments_dir),
        METADATA_DB_PATH=str(db_path),
        API_AUTH_ENABLED=True,
        API_KEY_READ=read_key,
        API_KEY_ADMIN=admin_key,
        LOG_LEVEL="DEBUG",
    )

    reset_metrics_collector()
    init_db(db_path=db_path)

    with patch("app.core.config.get_settings", return_value=test_settings), \
         patch("app.core.security.get_settings", return_value=test_settings), \
         patch("app.db.session.get_settings", return_value=test_settings), \
         patch("app.api.routes.health.get_settings", return_value=test_settings), \
         patch("app.main.get_settings", return_value=test_settings):
        yield {
            "settings": test_settings,
            "read_key": read_key,
            "admin_key": admin_key,
            "db_path": db_path,
            "upload_dir": upload_dir,
            "experiments_dir": experiments_dir,
        }

    close_db()
    reset_metrics_collector()


# =============================================================================
# 1. Correlation ID Generation, Validation & Middleware Tests
# =============================================================================

def test_correlation_id_validation_unit():
    """Verify strict validation rules: length <= 64, safe characters only."""
    # Valid IDs
    assert validate_correlation_id("req-12345") == "req-12345"
    assert validate_correlation_id("abc_DEF-0123") == "abc_DEF-0123"
    assert validate_correlation_id("a" * 64) == "a" * 64

    # Invalid / Malformed / Oversized IDs
    assert validate_correlation_id(None) is None
    assert validate_correlation_id("") is None
    assert validate_correlation_id("   ") is None
    assert validate_correlation_id("a" * 65) is None  # Oversized
    assert validate_correlation_id("req with spaces") is None
    assert validate_correlation_id("bad;header=inject\r\n") is None
    assert validate_correlation_id("<script>alert(1)</script>") is None

    # Resolution behavior
    valid_resolved = resolve_correlation_id("valid-id-01")
    assert valid_resolved == "valid-id-01"

    fallback_resolved = resolve_correlation_id("invalid spaces!")
    assert re.match(r"^[0-9a-f\-]{36}$", fallback_resolved) is not None


def test_correlation_id_middleware_and_headers(phase16e_env):
    """Verify correlation ID header reflection across incoming requests."""
    client = TestClient(app)

    # 1. Missing header -> Generated UUID returned in both headers
    resp1 = client.get("/api/v1/health")
    assert resp1.status_code == 200
    corr1 = resp1.headers.get(CORRELATION_ID_HEADER)
    req1 = resp1.headers.get(REQUEST_ID_HEADER)
    assert corr1 is not None
    assert req1 == corr1
    assert re.match(r"^[0-9a-f\-]{36}$", corr1)

    # 2. Valid X-Correlation-ID header -> Echoed back identically
    resp2 = client.get("/api/v1/health", headers={CORRELATION_ID_HEADER: "test-client-corr-99"})
    assert resp2.status_code == 200
    assert resp2.headers.get(CORRELATION_ID_HEADER) == "test-client-corr-99"
    assert resp2.headers.get(REQUEST_ID_HEADER) == "test-client-corr-99"

    # 3. Valid X-Request-ID header -> Recognized and echoed
    resp3 = client.get("/api/v1/health", headers={REQUEST_ID_HEADER: "custom-req-id-888"})
    assert resp3.status_code == 200
    assert resp3.headers.get(CORRELATION_ID_HEADER) == "custom-req-id-888"
    assert resp3.headers.get(REQUEST_ID_HEADER) == "custom-req-id-888"

    # 4. Malformed header (spaces, injection) -> Safe UUID generated instead
    resp4 = client.get("/api/v1/health", headers={CORRELATION_ID_HEADER: "bad id with spaces!"})
    assert resp4.status_code == 200
    corr4 = resp4.headers.get(CORRELATION_ID_HEADER)
    assert corr4 != "bad id with spaces!"
    assert re.match(r"^[0-9a-f\-]{36}$", corr4)

    # 5. Oversized header (> 64 characters) -> Safe fallback generated
    oversized = "a" * 128
    resp5 = client.get("/api/v1/health", headers={CORRELATION_ID_HEADER: oversized})
    assert resp5.status_code == 200
    assert resp5.headers.get(CORRELATION_ID_HEADER) != oversized
    assert len(resp5.headers.get(CORRELATION_ID_HEADER)) == 36


# =============================================================================
# 2. Structured Logging & Sanitization Tests
# =============================================================================

def test_log_sanitization_rules():
    """Verify regex sanitization of credentials, secrets, Bearer tokens, and paths."""
    # Bearer token scrubbing
    msg_token = "Failed authentication for Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz"
    sanitized_token = sanitize_log_message(msg_token)
    assert "eyJhbGci" not in sanitized_token
    assert "[REDACTED_TOKEN]" in sanitized_token

    # AutoNexa API key scrubbing
    msg_key = "Using API key autonexa_live_secret_123456789 to access endpoint"
    sanitized_key = sanitize_log_message(msg_key)
    assert "autonexa_live_secret" not in sanitized_key
    assert "[REDACTED_API_KEY]" in sanitized_key

    # Key-value assignment scrubbing
    msg_kv = "Config: api_key='secret-pass-99', password: 'myPassword123!', token=xyzabc123"
    sanitized_kv = sanitize_log_message(msg_kv)
    assert "secret-pass-99" not in sanitized_kv
    assert "myPassword123!" not in sanitized_kv
    assert "[REDACTED]" in sanitized_kv

    # Windows user home scrubbing
    msg_win = r"File saved to C:\Users\ishit\AutoNexa\data\models\best_model.joblib"
    sanitized_win = sanitize_log_message(msg_win)
    assert "Users" not in sanitized_win or "ishit" not in sanitized_win
    assert "[HOME]" in sanitized_win

    # Linux user home scrubbing
    msg_linux = "Artifact located at /home/ubuntu/AutoNexa/models/v1/model.joblib"
    sanitized_linux = sanitize_log_message(msg_linux)
    assert "/home/ubuntu/" not in sanitized_linux
    assert "[HOME]/" in sanitized_linux

    # Exception sanitization
    exc = ValueError("Failed connection with password='supersecretpass'")
    sanitized_exc = sanitize_exception(exc)
    assert "supersecretpass" not in sanitized_exc
    assert "[REDACTED]" in sanitized_exc


def test_structured_log_formatter():
    """Verify that StructuredLogFormatter formats records with correlation ID and sanitized text."""
    formatter = StructuredLogFormatter()
    set_correlation_id("test-corr-fmt-42")

    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Authenticated user with token=secretToken123456",
        args=(),
        exc_info=None,
    )
    formatted = formatter.format(record)

    assert "[test-corr-fmt-42]" in formatted
    assert "secretToken123456" not in formatted
    assert "[REDACTED]" in formatted
    assert "INFO" in formatted


# =============================================================================
# 3. Health & Readiness Endpoint Tests
# =============================================================================

def test_public_health_contract_unmodified(phase16e_env):
    """Verify public GET /api/v1/health remains lightweight and free of internals."""
    client = TestClient(app)
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()

    assert body["status"] == "healthy"
    assert body["app_name"] == "AutoNexa"
    assert "version" in body
    # Verify no leaked internals
    assert "database" not in body
    assert "system" not in body
    assert "storage" not in body


def test_readiness_probe_healthy(phase16e_env):
    """Verify GET /api/v1/health/readiness returns 200 ready when components are healthy."""
    client = TestClient(app)
    headers = {"X-API-Key": phase16e_env["read_key"]}

    resp = client.get("/api/v1/health/readiness", headers=headers)
    assert resp.status_code == 200
    body = resp.json()

    assert body["status"] == "ready"
    assert body["ready"] is True
    assert "checks" in body
    assert body["checks"]["database"]["status"] == "ok"
    assert body["checks"]["storage"]["status"] == "ok"
    assert body["checks"]["storage"]["writable"] is True
    assert body["checks"]["lifecycle"]["status"] == "ok"


def test_readiness_probe_database_unavailable(phase16e_env):
    """Verify GET /api/v1/health/readiness returns 503 degraded when database connectivity fails."""
    client = TestClient(app)
    headers = {"X-API-Key": phase16e_env["read_key"]}

    # Simulate database outage
    with patch("app.api.routes.health.get_db_context", side_effect=RuntimeError("SQLite connection refused")):
        resp = client.get("/api/v1/health/readiness", headers=headers)
        assert resp.status_code == 503
        body = resp.json()

        assert body["status"] == "unhealthy"
        assert body["ready"] is False
        assert body["checks"]["database"]["status"] == "unhealthy"


def test_readiness_probe_storage_unwritable(phase16e_env):
    """Verify GET /api/v1/health/readiness returns 503 degraded when storage is unwritable."""
    client = TestClient(app)
    headers = {"X-API-Key": phase16e_env["read_key"]}

    # Mock Path.write_text to raise PermissionError
    with patch.object(Path, "write_text", side_effect=PermissionError("Permission denied: read-only filesystem")):
        resp = client.get("/api/v1/health/readiness", headers=headers)
        assert resp.status_code == 503
        body = resp.json()

        assert body["status"] == "degraded"
        assert body["ready"] is False
        assert body["checks"]["storage"]["status"] == "degraded"


# =============================================================================
# 4. Privileged Diagnostics Tests
# =============================================================================

def test_diagnostics_rbac_and_content(phase16e_env):
    """Verify Admin-only RBAC protection and diagnostics report structure."""
    client = TestClient(app)

    # 1. Unauthenticated -> 401
    resp_unauth = client.get("/api/v1/health/diagnostics")
    assert resp_unauth.status_code == 401

    # 2. Read role (Inference key) -> 403 Forbidden
    resp_read = client.get(
        "/api/v1/health/diagnostics",
        headers={"X-API-Key": phase16e_env["read_key"]},
    )
    assert resp_read.status_code == 403

    # 3. Admin role -> 200 OK
    resp_admin = client.get(
        "/api/v1/health/diagnostics",
        headers={"X-API-Key": phase16e_env["admin_key"]},
    )
    assert resp_admin.status_code == 200
    diag = resp_admin.json()

    assert diag["status"] in ("ok", "degraded")
    assert "system" in diag
    assert "database" in diag
    assert "pipelines" in diag
    assert "storage" in diag
    assert "correlation_id" in diag
    assert diag["database"]["connected"] is True
    assert "table_counts" in diag["database"]


# =============================================================================
# 5. Operational Metrics Collection & API Tests
# =============================================================================

def test_metrics_collector_unit():
    """Verify thread-safe MetricsCollector state, label bounding, and non-durability contract."""
    collector = MetricsCollector()

    # Initial state
    snap = collector.get_snapshot()
    assert snap["durable"] is False
    assert snap["storage"] == "in_memory"
    assert snap["http"]["requests_total"] == 0

    # Record requests with normal and exotic methods
    collector.record_http_request("GET", 200, 15.5)
    collector.record_http_request("POST", 201, 45.2)
    collector.record_http_request("INVALID_METHOD", 404, 5.0)  # Bounded to OTHER

    # Record training events
    collector.record_training_event("started", task_type="tabular_classification")
    collector.record_training_event("completed", task_type="tabular_classification", duration_seconds=12.4)
    collector.record_training_event("invalid_status", task_type="unknown")

    # Record pipeline events and gauges
    collector.record_pipeline_event("started")
    collector.set_pipeline_gauges(active=2, queued=1)
    collector.record_pipeline_event("completed", duration_seconds=30.0)

    # Record db operations and reconciliation
    collector.record_db_operation(error=False)
    collector.record_db_operation(error=True)
    collector.record_reconciliation(reconciled_count=5, error=False)

    # Record governance transitions
    collector.record_stage_transition("production")
    collector.record_retraining_trigger("triggered")

    snap = collector.get_snapshot()

    # Verify HTTP stats
    assert snap["http"]["requests_total"] == 3
    assert snap["http"]["by_method"]["GET"] == 1
    assert snap["http"]["by_method"]["POST"] == 1
    assert snap["http"]["by_method"]["OTHER"] == 1
    assert snap["http"]["by_status_family"]["2xx"] == 2
    assert snap["http"]["by_status_family"]["4xx"] == 1
    assert snap["http"]["duration_ms"]["count"] == 3

    # Verify training stats
    assert snap["training"]["runs_total"] == 1
    assert snap["training"]["by_status"]["completed"] == 1
    assert snap["training"]["by_status"]["unknown"] == 1

    # Verify pipeline stats
    assert snap["pipelines"]["runs_total"] == 1
    assert snap["pipelines"]["active_gauge"] == 2
    assert snap["pipelines"]["queued_gauge"] == 1

    # Verify DB stats
    assert snap["metadata_db"]["operations_total"] == 2
    assert snap["metadata_db"]["errors_total"] == 1
    assert snap["metadata_db"]["reconciled_items_total"] == 5

    # Verify governance
    assert snap["governance"]["stage_transitions_total"] == 1
    assert snap["governance"]["stage_transitions_by_stage"]["production"] == 1
    assert snap["governance"]["retraining_triggers_total"] == 1


def test_metrics_api_endpoint(phase16e_env):
    """Verify GET /api/v1/metrics and /api/v1/health/metrics RBAC and response format."""
    client = TestClient(app)

    # 1. Unauthenticated -> 401
    resp_unauth = client.get("/api/v1/metrics")
    assert resp_unauth.status_code == 401

    # 2. Authenticated with Inference Key -> 200
    resp_auth = client.get(
        "/api/v1/metrics",
        headers={"X-API-Key": phase16e_env["read_key"]},
    )
    assert resp_auth.status_code == 200
    metrics = resp_auth.json()

    assert metrics["durable"] is False
    assert metrics["storage"] == "in_memory"
    assert "http" in metrics
    assert "training" in metrics
    assert "pipelines" in metrics
    assert "metadata_db" in metrics
    assert "governance" in metrics

    # 3. Test alias /api/v1/health/metrics
    resp_alias = client.get(
        "/api/v1/health/metrics",
        headers={"X-API-Key": phase16e_env["read_key"]},
    )
    assert resp_alias.status_code == 200
    assert resp_alias.json()["storage"] == "in_memory"
