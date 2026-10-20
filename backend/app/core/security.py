"""Authentication and role-based authorization for AutoNexa model serving endpoints."""

from enum import Enum
import logging
import secrets
from typing import Any, Callable, Dict, Optional

from fastapi import Header, HTTPException, status

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class ServingRole(str, Enum):
    """Access control roles for the model serving subsystem."""
    INFERENCE = "inference"  # Read-only querying and model inference
    ADMIN = "admin"          # Privileged operations: cache invalidation, deployment lifecycle


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


def verify_serving_access(required_role: ServingRole = ServingRole.INFERENCE) -> Callable:
    """FastAPI dependency factory enforcing authentication and role-based access control.

    Uses constant-time string comparison to prevent timing attacks and denies access by default.
    """
    def _dependency(
        x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
        authorization: Optional[str] = Header(default=None, alias="Authorization"),
    ) -> Dict[str, Any]:
        settings: Settings = get_settings()

        # If authentication is explicitly disabled in settings
        if not settings.serving_auth_enabled:
            return {"role": required_role.value, "authenticated": True, "auth_enabled": False}

        token = extract_api_key(x_api_key=x_api_key, authorization=authorization)
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required: Provide a valid API key via 'X-API-Key' or 'Authorization: Bearer <key>' header.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        admin_key = settings.serving_api_key_admin
        read_key = settings.serving_api_key_read

        # Constant-time comparison against Admin Key
        if admin_key and secrets.compare_digest(token, admin_key):
            return {"role": ServingRole.ADMIN.value, "authenticated": True, "auth_enabled": True}

        # Constant-time comparison against Read/Inference Key
        if read_key and secrets.compare_digest(token, read_key):
            if required_role == ServingRole.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Insufficient permissions. Admin role required for this operation.",
                )
            return {"role": ServingRole.INFERENCE.value, "authenticated": True, "auth_enabled": True}

        # Credential does not match either authorized key
        logger.warning("Rejected unauthenticated request to serving endpoint (invalid API key)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: Invalid API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _dependency


# Convenience dependencies
require_inference_role = verify_serving_access(ServingRole.INFERENCE)
require_admin_role = verify_serving_access(ServingRole.ADMIN)
