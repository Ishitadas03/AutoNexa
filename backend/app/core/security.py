"""Authentication, session validation, and role-based authorization for AutoNexa API endpoints."""

from enum import Enum
import logging
import secrets
from typing import Any, Callable, Dict, Generator, Optional, Tuple

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth_tokens import hash_token
from app.core.config import Settings, get_settings
from app.db.models import UserModel, UserRole, UserStatus
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository
from app.db.session import get_db

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


def extract_session_token_from_request(
    request: Request,
    authorization: Optional[str] = None,
    cookie_token: Optional[str] = None,
) -> Optional[str]:
    """Extract opaque session token from cookie, Authorization header, or BFF session header."""
    settings = get_settings()
    cookie_name = settings.auth_session_cookie_name

    # 1. HttpOnly cookie
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()
    if cookie_name in request.cookies and request.cookies[cookie_name].strip():
        return request.cookies[cookie_name].strip()

    # 2. X-Session-Token header (BFF forwarded)
    bff_session = request.headers.get("x-session-token")
    if bff_session and bff_session.strip():
        return bff_session.strip()

    # 3. Authorization: Bearer <token> (if token is not a configured service API key)
    auth_hdr = authorization or request.headers.get("authorization")
    if auth_hdr and auth_hdr.strip():
        parts = auth_hdr.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
            # If it's not a service API key, treat as potential session token
            if token and token not in (settings.api_key_admin, settings.api_key_read):
                return token

    return None


def get_current_user_and_session(
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Tuple[UserModel, Any]:
    """FastAPI dependency to extract and validate active user session.

    Raises HTTP 401 if unauthenticated or session invalid/expired.
    """
    settings = get_settings()
    cookie_token = request.cookies.get(settings.auth_session_cookie_name)
    token = extract_session_token_from_request(
        request=request,
        authorization=authorization,
        cookie_token=cookie_token,
    )

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: No active session. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    t_hash = hash_token(token)
    session_repo = SessionRepository(db)
    user_session = session_repo.get_valid_session_by_token_hash(t_hash)

    if user_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: Session is invalid, expired, or revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_repo = UserRepository(db)
    user = user_repo.get_by_id(user_session.user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed: Associated user account not found.",
        )

    if user.status == UserStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended: Access has been temporarily suspended by an administrator.",
        )

    if user.status == UserStatus.DISABLED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled: This account is disabled.",
        )

    session_repo.touch_activity(user_session.id)
    db.commit()

    return user, user_session


def get_current_user(
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
) -> UserModel:
    """Dependency returning the authenticated UserModel."""
    return user_and_session[0]


def get_optional_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> Optional[UserModel]:
    """Dependency returning the authenticated UserModel if a valid session is present, else None."""
    try:
        settings = get_settings()
        cookie_token = request.cookies.get(settings.auth_session_cookie_name)
        token = extract_session_token_from_request(request=request, cookie_token=cookie_token)
        if not token:
            return None
        t_hash = hash_token(token)
        user_session = SessionRepository(db).get_valid_session_by_token_hash(t_hash)
        if user_session is None:
            return None
        user = UserRepository(db).get_by_id(user_session.user_id)
        if user and user.status == UserStatus.ACTIVE.value:
            return user
        return None
    except Exception:
        return None


def require_admin_user(
    user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Dependency verifying that the session-authenticated user holds the Admin role."""
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Insufficient permissions. Admin role required for this operation.",
        )
    return user


def verify_api_access(required_role: AppRole = AppRole.INFERENCE) -> Callable:
    """FastAPI dependency factory enforcing authentication and role-based access control.

    Accepts:
    1. Valid user session (Admin user satisfies all roles; standard user satisfies INFERENCE).
    2. Valid service API key (Admin API key satisfies all roles; Read API key satisfies INFERENCE).
    """
    def _dependency(
        request: Request,
        x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
        authorization: Optional[str] = Header(default=None, alias="Authorization"),
        db: Session = Depends(get_db),
    ) -> Dict[str, Any]:
        settings: Settings = get_settings()

        # If authentication is explicitly disabled in settings (e.g. for testing)
        if not settings.api_auth_enabled or not settings.serving_auth_enabled:
            return {"role": required_role.value, "authenticated": True, "auth_enabled": False}

        # 1. Check for authenticated user session first
        opt_user = get_optional_current_user(request=request, db=db)
        if opt_user is not None:
            if opt_user.role == UserRole.ADMIN.value:
                return {"role": AppRole.ADMIN.value, "authenticated": True, "user_id": opt_user.id, "auth_enabled": True}
            if required_role == AppRole.ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Forbidden: Insufficient permissions. Admin role required for this operation.",
                )
            return {"role": AppRole.INFERENCE.value, "authenticated": True, "user_id": opt_user.id, "auth_enabled": True}

        # 2. Check service API key
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
