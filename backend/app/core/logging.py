"""Structured logging, log record sanitization, and correlation injection for AutoNexa."""

import logging
import os
import re
from typing import Any, Optional

from app.core.correlation import CorrelationIdFilter, get_correlation_id

# Regex patterns for identifying and masking sensitive credentials and tokens
TOKEN_PATTERNS = [
    # Bearer tokens
    (re.compile(r"(Bearer\s+)[A-Za-z0-9_\-\.]{8,}", re.IGNORECASE), r"\1[REDACTED_TOKEN]"),
    # Explicit AutoNexa keys or generic key formats
    (re.compile(r"\b(autonexa[-_][a-zA-Z0-9_\-]{8,})\b", re.IGNORECASE), "[REDACTED_API_KEY]"),
    (re.compile(r"\b(ak[-_][a-zA-Z0-9_\-]{8,})\b", re.IGNORECASE), "[REDACTED_API_KEY]"),
    # Key-value assignments like api_key="secret", password: 'xyz', token=...
    (
        re.compile(
            r"(?i)\b(api[_-]?key|secret|password|token|authorization)\b\s*([:=])\s*['\"]?(?!(?:\[REDACTED|Bearer\b))([^\s,'\"\)]+)['\"]?"
        ),
        r"\1\2[REDACTED]",
    ),
]

# Regex patterns for sanitizing sensitive absolute filesystem paths (e.g. C:\Users\username\... or /home/username/...)
PATH_PATTERNS = [
    # Windows User Directory: C:\Users\<username>\...
    (re.compile(r"[a-zA-Z]:\\Users\\[^\\]+\\", re.IGNORECASE), r"[HOME]\\"),
    # Windows User Directory with forward slashes: C:/Users/<username>/...
    (re.compile(r"[a-zA-Z]:/Users/[^/]+/", re.IGNORECASE), r"[HOME]/"),
    # Linux / Unix Home Directory: /home/<username>/...
    (re.compile(r"/home/[^/]+/", re.IGNORECASE), r"[HOME]/"),
]


def sanitize_log_message(msg: str) -> str:
    """Sanitize log messages by redacting credentials, secrets, tokens, and sensitive system paths."""
    if not msg:
        return ""
    sanitized = str(msg)

    # 1. Redact credentials & tokens
    for pattern, replacement in TOKEN_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    # 2. Redact sensitive absolute paths
    for pattern, replacement in PATH_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    return sanitized


def sanitize_exception(exc: BaseException) -> str:
    """Sanitize an exception message to prevent credential/path leaking in logs or error responses."""
    if exc is None:
        return ""
    return sanitize_log_message(str(exc))


class StructuredLogFormatter(logging.Formatter):
    """Logging formatter that injects correlation IDs and sanitizes message content."""

    DEFAULT_FMT = "%(asctime)s | %(levelname)-7s | [%(correlation_id)s] | %(name)s | %(message)s"
    DEFAULT_DATEFMT = "%Y-%m-%d %H:%M:%S"

    def __init__(
        self,
        fmt: Optional[str] = None,
        datefmt: Optional[str] = None,
    ) -> None:
        super().__init__(fmt=fmt or self.DEFAULT_FMT, datefmt=datefmt or self.DEFAULT_DATEFMT)

    def format(self, record: logging.LogRecord) -> str:
        # Ensure correlation_id is present on the record
        if not hasattr(record, "correlation_id") or not record.correlation_id:
            record.correlation_id = get_correlation_id()

        # Sanitize message if it's a string
        if isinstance(record.msg, str):
            record.msg = sanitize_log_message(record.msg)

        # Also sanitize string arguments before formatting
        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    sanitize_log_message(str(arg)) if isinstance(arg, str) else arg
                    for arg in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: (sanitize_log_message(str(v)) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }

        return super().format(record)

    def formatException(self, ei: Any) -> str:
        """Format and sanitize exception traceback to prevent credential and path leaking."""
        raw_tb = super().formatException(ei)
        return sanitize_log_message(raw_tb)

    def formatStack(self, stack_info: str) -> str:
        """Format and sanitize stack information to prevent path leaking."""
        raw_stack = super().formatStack(stack_info)
        return sanitize_log_message(raw_stack)


def setup_logging(log_level: str = "INFO") -> None:
    """Configure root and application loggers with structured formatting and correlation filtering."""
    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Add correlation filter to root logger
    has_filter = any(isinstance(f, CorrelationIdFilter) for f in root_logger.filters)
    if not has_filter:
        root_logger.addFilter(CorrelationIdFilter())

    # Update handlers with StructuredLogFormatter
    if not root_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(StructuredLogFormatter())
        handler.addFilter(CorrelationIdFilter())
        root_logger.addHandler(handler)
    else:
        for handler in root_logger.handlers:
            handler.setFormatter(StructuredLogFormatter())
            if not any(isinstance(f, CorrelationIdFilter) for f in handler.filters):
                handler.addFilter(CorrelationIdFilter())
