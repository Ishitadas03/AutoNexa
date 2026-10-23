"""Request correlation ID handling, context propagation, and middleware for AutoNexa."""

from contextvars import ContextVar
import logging
import re
from typing import Callable, Optional
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

# Header names supported for correlation tracking
CORRELATION_ID_HEADER = "X-Correlation-ID"
REQUEST_ID_HEADER = "X-Request-ID"

# Maximum permissible length for an external correlation ID to prevent log injection
MAX_CORRELATION_ID_LENGTH = 64

# Strict character set for correlation IDs: alphanumeric, dashes, and underscores only
CORRELATION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

# Task-local ContextVar for correlation ID tracking
_CORRELATION_ID_CTX: ContextVar[str] = ContextVar("correlation_id", default="-")


def get_correlation_id() -> str:
    """Retrieve the correlation ID for the current execution context."""
    return _CORRELATION_ID_CTX.get()


def set_correlation_id(cid: str) -> None:
    """Set the correlation ID for the current execution context."""
    _CORRELATION_ID_CTX.set(cid)


def validate_correlation_id(raw_id: Optional[str]) -> Optional[str]:
    """Validate and sanitize an incoming caller-supplied correlation ID.

    Returns the sanitized string if valid; None if absent, malformed, or oversized.
    """
    if not raw_id:
        return None
    cleaned = raw_id.strip()
    if not cleaned or len(cleaned) > MAX_CORRELATION_ID_LENGTH:
        return None
    if not CORRELATION_ID_PATTERN.match(cleaned):
        return None
    return cleaned


def resolve_correlation_id(header_val: Optional[str]) -> str:
    """Resolve an incoming correlation header or generate a cryptographically random UUID4."""
    validated = validate_correlation_id(header_val)
    if validated is not None:
        return validated
    return str(uuid.uuid4())


class CorrelationIdFilter(logging.Filter):
    """Logging filter that injects the active correlation ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "correlation_id") or record.correlation_id == "-":
            record.correlation_id = get_correlation_id()
        return True


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """ASGI Middleware to assign, propagate, and reflect request correlation identifiers."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Check both X-Correlation-ID and X-Request-ID headers
        raw_corr_id = request.headers.get(CORRELATION_ID_HEADER) or request.headers.get(REQUEST_ID_HEADER)
        correlation_id = resolve_correlation_id(raw_corr_id)

        # Bind to contextvar and request state
        token = _CORRELATION_ID_CTX.set(correlation_id)
        request.state.correlation_id = correlation_id

        try:
            response = await call_next(request)
            # Inject both standard response headers for broad client interoperability
            response.headers[CORRELATION_ID_HEADER] = correlation_id
            response.headers[REQUEST_ID_HEADER] = correlation_id
            return response
        finally:
            _CORRELATION_ID_CTX.reset(token)
