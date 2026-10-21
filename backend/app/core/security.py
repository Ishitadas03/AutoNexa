"""Authentication and role-based authorization for AutoNexa API endpoints."""

from enum import Enum
import logging
import secrets
from typing import Any, Callable, Dict, Optional

from fastapi import Header, HTTPException, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class AppRole(str, Enum):
    """Access control roles across the AutoNexa platform."""
    INFERENCE = "inference"  # Read-only querying, inspection, and model prediction
    ADMIN = "admin"          # Privileged operations: dataset uploads, training, promotion, deletion


ServingRole = AppRole  # Backward compatibility alias


def extract_api_key(
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key", description="API key header"),
    authorization: Optional[str] = Header(default=None, alias="Authorization", description="Bearer token header"),
) -> Optional[str]:
    """Extract API key from either 'X-API-Key' header or 'Authorization: Bearer <token>' header."""
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()

    if authorization and authorization.strip():
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
        if len(parts) == 1:
            return parts[0].strip()

    return None


def verify_api_access(required_role: AppRole = AppRole.INFERENCE) -> Callable:
    """FastAPI dependency factory enforcing authentication and role-based access control.

    Uses constant-time string comparison to prevent timing attacks and denies access by default.
    """
    def _dependency(
        x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
        authorization: Optional[str] = Header(default=None, alias="Authorization"),
    ) -> Dict[str, Any]:
        settings: Settings = get_settings()

        # If authentication is explicitly disabled in settings (e.g. for testing)
        if not settings.api_auth_enabled or not settings.serving_auth_enabled:
            return {"role": required_role.value, "authenticated": True, "auth_enabled": False}

        token = extract_api_key(x_api_key=x_api_key, authorization=authorization)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required: Provide a valid API key via 'X-API-Key' or 'Authorization: Bearer <key>' header.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        admin_key = settings.api_key_admin
        read_key = settings.api_key_read

        # Constant-time comparison against Admin Key
        if admin_key and secrets.compare_digest(token, admin_key):
            return {"role": AppRole.ADMIN.value, "authenticated": True, "auth_enabled": True}

        # Constant-time comparison against Read/Inference Key
        if read_key and secrets.compare_digest(token, read_key):
            if required_role == AppRole.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Insufficient permissions. Admin role required for this operation.",
                )
            return {"role": AppRole.INFERENCE.value, "authenticated": True, "auth_enabled": True}

        # Credential does not match either authorized key
        logger.warning("Rejected unauthenticated request to endpoint (invalid API key)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: Invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _dependency


verify_serving_access = verify_api_access  # Backward compatibility alias

# Convenience dependencies
require_inference_role = verify_api_access(AppRole.INFERENCE)
require_read_role = require_inference_role  # Explicit read alias
require_admin_role = verify_api_access(AppRole.ADMIN)
