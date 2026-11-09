"""Authentication routes for email registration, verification, sessions, and password recovery."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
import logging
import time
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.auth_tokens import generate_token_pair, hash_token
from app.core.config import Settings, get_settings
from app.core.password import hash_password, validate_password_policy, verify_password
from app.core.security import (
    get_current_user,
    get_current_user_and_session,
    require_admin_user,
)
from app.db.models import TokenType, UserModel, UserRole, UserStatus, utc_now
from app.db.repositories.session_repository import SessionRepository
from app.db.repositories.user_repository import UserRepository, normalize_email
from app.db.session import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    ResendVerificationRequest,
    ResetPasswordRequest,
    SessionListResponse,
    UserMeResponse,
    UserPublicProfile,
    UserRegisterRequest,
    UserRegisterResponse,
    UserSessionRecord,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.services.email_service import EmailService, get_email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# Process-local failed login rate limiter (Windowed IP/Email tracking)
_FAILED_LOGINS: Dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> None:
    """Enforce windowed rate limiting on authentication attempts."""
    now = time.time()
    attempts = [t for t in _FAILED_LOGINS[key] if now - t < window_seconds]
    _FAILED_LOGINS[key] = attempts

    if len(attempts) >= max_attempts:
        logger.warning("Authentication rate limit exceeded for key: %s (%d attempts)", key, len(attempts))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please wait {window_seconds // 60} minutes before trying again.",
        )


def _record_failed_attempt(key: str) -> None:
    _FAILED_LOGINS[key].append(time.time())


def _clear_failed_attempts(key: str) -> None:
    _FAILED_LOGINS.pop(key, None)


# -----------------------------------------------------------------------------
# 1. User Registration
# -----------------------------------------------------------------------------

@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register New User Account",
    description=(
        "Registers a new user account with email and password. "
        "Enforces email normalization, password complexity, and unique email constraints. "
        "Sends an activation email with a cryptographically secure single-use token."
    ),
)
def register_user(
    request: Request,
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    email_service: EmailService = Depends(get_email_service),
) -> UserRegisterResponse:
    """Handle new user registration."""
    # Critical Safety Gate (Stage 9): Public registration disabled pending Phase 17G data isolation
    if not settings.auth_public_registration_enabled:
        logger.info("Blocked registration attempt: public registration feature flag is disabled.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Public user registration is currently in closed evaluation while Phase 17G "
                "multi-tenant data isolation is completed. Administrative onboarding only."
            ),
        )

    # 1. Validate password policy
    try:
        validate_password_policy(payload.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # 2. Check email uniqueness with normalization
    user_repo = UserRepository(db)
    norm_email = normalize_email(payload.email)
    existing_user = user_repo.get_by_normalized_email(norm_email)

    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    # 3. Hash password with Argon2id (never plaintext)
    pw_hash = hash_password(payload.password)

    # 4. Create user in pending_verification status (users cannot self-assign admin role)
    user = user_repo.create_user(
        name=payload.name,
        email=payload.email,
        password_hash=pw_hash,
        role=UserRole.USER.value,
        status=UserStatus.PENDING_VERIFICATION.value,
    )

    # 5. Generate secure verification token pair (raw token to email, token hash to DB)
    raw_token, token_hash = generate_token_pair()
    expires_at = utc_now() + timedelta(seconds=settings.auth_email_verification_expiry_seconds)

    user_repo.create_auth_token(
        user_id=user.id,
        token_hash=token_hash,
        token_type=TokenType.EMAIL_VERIFICATION.value,
        expires_at=expires_at,
    )
    db.commit()

    # 6. Deliver verification email
    try:
        email_service.send_verification_email(
            to_email=user.email,
            name=user.name,
            raw_token=raw_token,
        )
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", user.email, exc)
        # Account is safely created; user can request a resend later

    return UserRegisterResponse(
        message="Registration successful. Please check your email to verify your account.",
        user_id=user.id,
        email=user.email,
        status=user.status,
        requires_verification=True,
    )


# -----------------------------------------------------------------------------
# 2. Email Verification
# -----------------------------------------------------------------------------

@router.post(
    "/verify-email",
    response_model=VerifyEmailResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify User Email Address",
    description="Validates a single-use verification token, marks account active, and records verification timestamp.",
)
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> VerifyEmailResponse:
    """Consume verification token and activate user account."""
    user_repo = UserRepository(db)
    token_hash = hash_token(payload.token)

    token_record = user_repo.get_valid_auth_token(
        token_hash=token_hash,
        token_type=TokenType.EMAIL_VERIFICATION.value,
    )

    if token_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or already used verification link. Please request a new verification email.",
        )

    user = user_repo.get_by_id(token_record.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated user account not found.",
        )

    # 1. Mark token as consumed (replay prevention)
    user_repo.mark_token_used(token_record.id)

    # 2. Activate user account
    user_repo.mark_email_verified(user.id)
    db.commit()

    return VerifyEmailResponse(
        message="Email address successfully verified. You may now log in.",
        verified=True,
        email=user.email,
    )


@router.get(
    "/verify-email",
    response_model=VerifyEmailResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify User Email Address (GET)",
    description="Validates a single-use verification token passed as query param for direct browser links.",
)
def verify_email_get(
    token: str = Query(..., min_length=16, description="Opaque single-use verification token"),
    db: Session = Depends(get_db),
) -> VerifyEmailResponse:
    return verify_email(payload=VerifyEmailRequest(token=token), db=db)


@router.post(
    "/resend-verification",
    status_code=status.HTTP_200_OK,
    summary="Resend Verification Email",
    description="Generates a new verification link and invalidates older unused verification tokens.",
)
def resend_verification(
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    email_service: EmailService = Depends(get_email_service),
) -> Dict[str, str]:
    """Resend email verification link with anti-enumeration protection."""
    norm_email = normalize_email(payload.email)
    user_repo = UserRepository(db)
    user = user_repo.get_by_normalized_email(norm_email)

    generic_success = {
        "message": "If an unverified account exists with this email address, a new verification link has been sent."
    }

    if user is None or user.is_email_verified or user.status != UserStatus.PENDING_VERIFICATION.value:
        return generic_success

    # Invalidate previous verification tokens
    user_repo.invalidate_pending_tokens(user.id, TokenType.EMAIL_VERIFICATION.value)

    # Generate new token
    raw_token, token_hash = generate_token_pair()
    expires_at = utc_now() + timedelta(seconds=settings.auth_email_verification_expiry_seconds)

    user_repo.create_auth_token(
        user_id=user.id,
        token_hash=token_hash,
        token_type=TokenType.EMAIL_VERIFICATION.value,
        expires_at=expires_at,
    )
    db.commit()

    try:
        email_service.send_verification_email(
            to_email=user.email,
            name=user.name,
            raw_token=raw_token,
        )
    except Exception as exc:
        logger.error("Error resending verification email to %s: %s", user.email, exc)

    return generic_success


# -----------------------------------------------------------------------------
# 3. Login & Session Lifecycle
# -----------------------------------------------------------------------------

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate User and Establish Session",
    description=(
        "Validates email and password, rejects unverified or suspended accounts, "
        "creates a high-entropy opaque session, and issues a secure HttpOnly cookie."
    ),
)
def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> LoginResponse:
    """Authenticate credentials and establish session."""
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_key = f"{client_ip}:{normalize_email(payload.email)}"

    _check_rate_limit(
        key=rate_limit_key,
        max_attempts=settings.auth_rate_limit_login_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )

    user_repo = UserRepository(db)
    norm_email = normalize_email(payload.email)
    user = user_repo.get_by_normalized_email(norm_email)

    # Protection against timing-based enumeration: verify dummy hash if user doesn't exist
    if user is None:
        # Dummy Argon2 verification to equalize response timing
        verify_password("dummy-password", "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$aGFzaGFzaGFzaGFzaGFzaGFzaGFzaGFzaGFzaA==")
        _record_failed_attempt(rate_limit_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Verify password hash
    if not verify_password(payload.password, user.password_hash):
        _record_failed_attempt(rate_limit_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    # Check verification status
    if not user.is_email_verified or user.status == UserStatus.PENDING_VERIFICATION.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address not verified. Please check your inbox or request a new verification link.",
        )

    # Check suspension status
    if user.status == UserStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended: Access has been temporarily suspended by an administrator.",
        )

    if user.status == UserStatus.DISABLED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled.",
        )

    # Login successful: clear rate limiting counters
    _clear_failed_attempts(rate_limit_key)

    # Generate session token pair (raw token to client cookie, hash to DB)
    raw_session_token, token_hash = generate_token_pair()
    expires_at = utc_now() + timedelta(seconds=settings.auth_session_max_age_seconds)

    user_agent = request.headers.get("user-agent")
    session_repo = SessionRepository(db)
    sess = session_repo.create_session(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    user_repo.update_last_login(user.id)
    db.commit()

    # Set secure HttpOnly session cookie
    is_production = settings.environment.strip().lower() == "production"
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=raw_session_token,
        max_age=settings.auth_session_max_age_seconds,
        httponly=True,
        secure=is_production,
        samesite="lax",
        path="/",
    )

    # Also forward session token header for API clients & BFF proxies
    response.headers["X-Session-Token"] = raw_session_token

    user_profile = UserPublicProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        status=user.status,
        is_email_verified=user.is_email_verified,
        created_at=user.created_at.isoformat() if user.created_at else "",
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
    )

    return LoginResponse(
        message="Login successful.",
        user=user_profile,
        session_id=sess.id,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Revoke Current User Session",
    description="Revokes the active session token in database and deletes the HttpOnly session cookie.",
)
def logout(
    response: Response,
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Dict[str, str]:
    """Revoke session and clear cookies."""
    _, user_session = user_and_session
    session_repo = SessionRepository(db)
    session_repo.revoke_session(user_session.id)
    db.commit()

    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        httponly=True,
    )
    return {"message": "Successfully logged out."}


@router.post(
    "/logout-all",
    status_code=status.HTTP_200_OK,
    summary="Revoke All User Sessions Across Devices",
    description="Revokes every active session for the authenticated user and clears the current session cookie.",
)
def logout_all(
    response: Response,
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Dict[str, Any]:
    """Revoke all active sessions for current user."""
    user, _ = user_and_session
    session_repo = SessionRepository(db)
    count = session_repo.revoke_all_user_sessions(user.id)
    db.commit()

    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        httponly=True,
    )
    return {
        "message": "Successfully logged out of all active sessions.",
        "revoked_sessions_count": count,
    }


# -----------------------------------------------------------------------------
# 4. Authenticated User Profile & Active Sessions
# -----------------------------------------------------------------------------

@router.get(
    "/me",
    response_model=UserMeResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve Current User Profile and Session State",
    description="Returns public profile and session information for the currently authenticated user.",
)
def get_me(
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
    db: Session = Depends(get_db),
) -> UserMeResponse:
    """Return authenticated user profile and security state."""
    user, _ = user_and_session
    session_repo = SessionRepository(db)
    active_sessions = session_repo.list_active_sessions_for_user(user.id)

    profile = UserPublicProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        status=user.status,
        is_email_verified=user.is_email_verified,
        created_at=user.created_at.isoformat() if user.created_at else "",
        last_login_at=user.last_login_at.isoformat() if user.last_login_at else None,
    )

    return UserMeResponse(
        user=profile,
        active_sessions_count=len(active_sessions),
        data_access_restricted=(user.role != UserRole.ADMIN.value),
    )


@router.get(
    "/sessions",
    response_model=SessionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Active User Sessions",
    description="Lists active sessions for the current user across devices with IP and user-agent metadata.",
)
def list_sessions(
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
    db: Session = Depends(get_db),
) -> SessionListResponse:
    """List active sessions for current user."""
    user, current_session = user_and_session
    session_repo = SessionRepository(db)
    active_sessions = session_repo.list_active_sessions_for_user(user.id)

    records = [
        UserSessionRecord(
            id=s.id,
            user_id=s.user_id,
            created_at=s.created_at.isoformat() if s.created_at else "",
            expires_at=s.expires_at.isoformat() if s.expires_at else "",
            last_activity_at=s.last_activity_at.isoformat() if s.last_activity_at else "",
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            is_current=(s.id == current_session.id),
        )
        for s in active_sessions
    ]

    return SessionListResponse(sessions=records, total=len(records))


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke Specific Session",
    description="Revokes a single session belonging to the current user (e.g. logging out a remote device).",
)
def revoke_specific_session(
    session_id: str,
    user_and_session: Tuple[UserModel, Any] = Depends(get_current_user_and_session),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Revoke specific session."""
    user, current_session = user_and_session
    session_repo = SessionRepository(db)

    # Verify session belongs to this user
    active_sessions = session_repo.list_active_sessions_for_user(user.id)
    target = next((s for s in active_sessions if s.id == session_id), None)

    if target is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or already revoked.",
        )

    session_repo.revoke_session(session_id)
    db.commit()

    return {"message": f"Session '{session_id}' revoked successfully."}


# -----------------------------------------------------------------------------
# 5. Forgot Password & Password Reset
# -----------------------------------------------------------------------------

@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    summary="Request Password Reset Link",
    description="Generates a single-use password reset token with short expiry and delivers via email without account enumeration.",
)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    email_service: EmailService = Depends(get_email_service),
) -> Dict[str, str]:
    """Request password reset link."""
    norm_email = normalize_email(payload.email)
    user_repo = UserRepository(db)
    user = user_repo.get_by_normalized_email(norm_email)

    generic_success = {
        "message": "If an account exists with this email address, password reset instructions have been sent."
    }

    if user is None or not user.is_email_verified or user.status != UserStatus.ACTIVE.value:
        return generic_success

    # Invalidate older pending reset tokens
    user_repo.invalidate_pending_tokens(user.id, TokenType.PASSWORD_RESET.value)

    # Generate new single-use token pair
    raw_token, token_hash = generate_token_pair()
    expires_at = utc_now() + timedelta(seconds=settings.auth_password_reset_expiry_seconds)

    user_repo.create_auth_token(
        user_id=user.id,
        token_hash=token_hash,
        token_type=TokenType.PASSWORD_RESET.value,
        expires_at=expires_at,
    )
    db.commit()

    try:
        email_service.send_password_reset_email(
            to_email=user.email,
            name=user.name,
            raw_token=raw_token,
        )
    except Exception as exc:
        logger.error("Error sending password reset email to %s: %s", user.email, exc)

    return generic_success


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    summary="Reset Password with Verification Token",
    description="Validates single-use reset token, applies new password with policy checks, and invalidates all active sessions.",
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    """Reset password and invalidate all existing sessions."""
    # 1. Validate new password policy
    try:
        validate_password_policy(payload.new_password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # 2. Validate token hash
    user_repo = UserRepository(db)
    token_hash = hash_token(payload.token)

    token_record = user_repo.get_valid_auth_token(
        token_hash=token_hash,
        token_type=TokenType.PASSWORD_RESET.value,
    )

    if token_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid, expired, or already used password reset link. Please request a new link.",
        )

    user = user_repo.get_by_id(token_record.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated user account not found.",
        )

    # 3. Mark token as used immediately (single-use guarantee)
    user_repo.mark_token_used(token_record.id)

    # 4. Update password hash
    new_hash = hash_password(payload.new_password)
    user_repo.update_password(user.id, new_hash)

    # 5. Revoke ALL active sessions for this user across all devices (Security requirement)
    session_repo = SessionRepository(db)
    session_repo.revoke_all_user_sessions(user.id)
    db.commit()

    return {
        "message": "Password successfully reset. You can now log in with your new password."
    }
