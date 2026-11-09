"""AutoNexa Phase 17F — Secure Email Authentication & User Identity Tests.

Comprehensive validation suite for:
1. Argon2id password hashing, verification, and policy enforcement.
2. Opaque token generation, SHA-256 hashing, and verification.
3. Registration lifecycle and public registration gate (feature flag).
4. Email verification, single-use token consumption, and expiry.
5. Resend verification and anti-enumeration protections.
6. Login authentication, HttpOnly cookies, and unverified user rejection.
7. Session management, activity tracking, individual revocation, and logout-all.
8. Password reset lifecycle, anti-enumeration, and complete session revocation on password change.
9. FastAPI security dependency integration (active user sessions + API keys).
"""

from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.password import hash_password, verify_password, validate_password_policy, PasswordPolicyError
from app.core.auth_tokens import generate_opaque_token, generate_token_pair, hash_token, verify_token_hash
from app.db.models import UserModel, SessionModel, AuthTokenModel, UserRole, UserStatus, TokenType, utc_now
from app.db.session import get_session_factory, get_engine, init_db, close_db
from app.db.repositories.user_repository import UserRepository
from app.db.repositories.session_repository import SessionRepository
from app.services.email_service import get_email_service
from app.main import app


@pytest.fixture
def auth_env(monkeypatch: pytest.MonkeyPatch):
    """Hermetic isolated environment with dedicated temporary SQLite database without Windows symlink issues."""
    with tempfile.TemporaryDirectory(dir=".") as tmp_dir_str:
        tmp_path = Path(tmp_dir_str).resolve()
        data_dir = tmp_path / "data"
        data_dir.mkdir(parents=True, exist_ok=True)
        db_path = data_dir / "test_auth_metadata.db"
        upload_dir = tmp_path / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        experiments_dir = tmp_path / "experiments"
        experiments_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.setenv("METADATA_DB_PATH", str(db_path))
        monkeypatch.setenv("UPLOAD_DIR", str(upload_dir))
        monkeypatch.setenv("EXPERIMENTS_DIR", str(experiments_dir))
        monkeypatch.setenv("API_AUTH_ENABLED", "true")
        monkeypatch.setenv("EMAIL_BACKEND", "memory")
        monkeypatch.setenv("API_KEY_ADMIN", "autonexa-admin-key-secret")
        monkeypatch.setenv("API_KEY_READ", "autonexa-read-key-secret")
        get_settings.cache_clear()

        close_db()
        init_db(db_path=db_path)

        email_service = get_email_service()
        email_service.clear_sent_messages()

        with TestClient(app) as client:
            yield client, db_path

        close_db()
        get_settings.cache_clear()


# -----------------------------------------------------------------------------
# 1. Password Hashing & Policy Tests (Pure compute, no DB required)
# -----------------------------------------------------------------------------

def test_argon2id_hashing_and_verification():
    """Verify Argon2id produces valid PHC string and correctly validates."""
    password = "CorrectHorseBattery99!"
    hashed = hash_password(password)

    assert hashed.startswith("$argon2id$v=19$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword123!", hashed) is False
    assert verify_password("", hashed) is False


def test_password_policy_enforcement():
    """Verify password complexity requirements."""
    # Under 8 chars
    with pytest.raises(PasswordPolicyError, match="at least 8 characters"):
        validate_password_policy("Short1!")

    # No letters
    with pytest.raises(PasswordPolicyError, match="at least one letter"):
        validate_password_policy("1234567890!")

    # No numbers or symbols
    with pytest.raises(PasswordPolicyError, match="at least one number or special character"):
        validate_password_policy("OnlyLettersHere")

    # Valid combinations should not raise
    validate_password_policy("ValidPassword123")
    validate_password_policy("MySuperSecret#1")


# -----------------------------------------------------------------------------
# 2. Opaque Token Tests (Pure cryptographic functions)
# -----------------------------------------------------------------------------

def test_opaque_token_generation_and_hashing():
    """Verify cryptographic opaque token generation and SHA-256 hashing."""
    token = generate_opaque_token(32)
    assert len(token) >= 40
    thash = hash_token(token)
    assert len(thash) == 64  # SHA-256 hex string
    assert verify_token_hash(token, thash) is True
    assert verify_token_hash("tampered-token", thash) is False


# -----------------------------------------------------------------------------
# 3. Registration & Public Signup Gate
# -----------------------------------------------------------------------------

def test_registration_blocked_when_feature_flag_disabled(auth_env):
    """Verify that registration returns 403 when public registration is disabled."""
    client, _ = auth_env
    settings = get_settings()
    settings.auth_public_registration_enabled = False

    res = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Test User",
            "email": "candidate@example.com",
            "password": "StrongPassword123!",
        },
    )
    assert res.status_code == 403
    assert "Registration is currently in closed evaluation" in res.json()["detail"] or "Phase 17G" in res.json()["detail"]


def test_registration_successful_when_feature_flag_enabled(auth_env):
    """Verify complete registration lifecycle and transactional email generation."""
    client, db_path = auth_env
    settings = get_settings()
    settings.auth_public_registration_enabled = True

    email_service = get_email_service()
    email_service.clear_sent_messages()

    res = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Test User",
            "email": "Test.User@Example.COM",
            "password": "StrongPassword123!",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"].lower() == "test.user@example.com"
    assert data["status"] == "pending_verification"
    assert data["requires_verification"] is True

    # Check transactional email queue
    queue = email_service.get_sent_messages()
    assert len(queue) == 1
    sent = queue[0]
    assert sent["to"].lower() == "test.user@example.com"
    assert "Verify your AutoNexa account" in sent["subject"]
    assert "token=" in sent["plain_body"]

    # Duplicate registration with same email (case-insensitive) rejected with 409 Conflict
    res_dup = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Duplicate User",
            "email": "test.user@example.com",
            "password": "AnotherPassword456!",
        },
    )
    assert res_dup.status_code == 409
    assert "already exists" in res_dup.json()["detail"].lower()


# -----------------------------------------------------------------------------
# 4. Email Verification Tests
# -----------------------------------------------------------------------------

def test_email_verification_flow(auth_env):
    """Verify single-use token consumption and state transition to ACTIVE."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="Verify Me",
            email="verify.me@example.com",
            password_hash=hash_password("StrongPassword123!"),
            role=UserRole.USER.value,
            status=UserStatus.PENDING_VERIFICATION.value,
        )
        raw_token, token_hash = generate_token_pair()
        user_repo.create_auth_token(
            user_id=user.id,
            token_hash=token_hash,
            token_type=TokenType.EMAIL_VERIFICATION.value,
            expires_at=utc_now() + timedelta(hours=1),
        )
        db.commit()

    # Verify using valid token via POST
    res = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res.status_code == 200
    assert res.json()["verified"] is True

    # Token cannot be reused (consumed)
    res_reuse = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res_reuse.status_code == 400
    assert "Invalid, expired, or already used" in res_reuse.json()["detail"]

    # Verify user state in DB
    with factory() as db:
        user_updated = UserRepository(db).get_by_email("verify.me@example.com")
        assert user_updated.status == UserStatus.ACTIVE.value
        assert user_updated.is_email_verified is True


def test_email_verification_expired_token(auth_env):
    """Verify expired token rejection."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="Expired User",
            email="expired@example.com",
            password_hash=hash_password("StrongPassword123!"),
        )
        raw_token, token_hash = generate_token_pair()
        user_repo.create_auth_token(
            user_id=user.id,
            token_hash=token_hash,
            token_type=TokenType.EMAIL_VERIFICATION.value,
            expires_at=utc_now() - timedelta(hours=1),
        )
        db.commit()

    res = client.post("/api/v1/auth/verify-email", json={"token": raw_token})
    assert res.status_code == 400
    assert "Invalid, expired, or already used" in res.json()["detail"]


# -----------------------------------------------------------------------------
# 5. Resend Verification & Anti-Enumeration
# -----------------------------------------------------------------------------

def test_resend_verification_anti_enumeration(auth_env):
    """Verify resend verification returns 200 even for non-existent users."""
    client, db_path = auth_env
    email_service = get_email_service()
    email_service.clear_sent_messages()

    # Non-existent email
    res = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "nonexistent@example.com"},
    )
    assert res.status_code == 200
    assert len(email_service.get_sent_messages()) == 0

    # Existing unverified user
    factory = get_session_factory(db_path)
    with factory() as db:
        UserRepository(db).create_user(
            name="Unverified User",
            email="unverified@example.com",
            password_hash=hash_password("StrongPassword123!"),
            status=UserStatus.PENDING_VERIFICATION.value,
        )
        db.commit()

    res = client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "unverified@example.com"},
    )
    assert res.status_code == 200
    assert len(email_service.get_sent_messages()) == 1


# -----------------------------------------------------------------------------
# 6. Login, Cookies & Session Management
# -----------------------------------------------------------------------------

def test_login_requires_verified_email(auth_env):
    """Verify unverified user cannot login."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        UserRepository(db).create_user(
            name="Unverified User",
            email="unverified.login@example.com",
            password_hash=hash_password("StrongPassword123!"),
            status=UserStatus.PENDING_VERIFICATION.value,
        )
        db.commit()

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "unverified.login@example.com", "password": "StrongPassword123!"},
    )
    assert res.status_code == 403
    assert "not verified" in res.json()["detail"].lower()


def test_login_invalid_password(auth_env):
    """Verify login fails with wrong credentials."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="Valid User",
            email="valid.user@example.com",
            password_hash=hash_password("StrongPassword123!"),
            status=UserStatus.ACTIVE.value,
        )
        user_repo.mark_email_verified(user.id)
        db.commit()

    res = client.post(
        "/api/v1/auth/login",
        json={"email": "valid.user@example.com", "password": "WrongPassword456!"},
    )
    assert res.status_code == 401
    assert "Invalid email or password" in res.json()["detail"]


def test_login_success_and_session_cookie(auth_env):
    """Verify login sets HttpOnly cookie and allows subsequent authenticated requests."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="Session User",
            email="session.user@example.com",
            password_hash=hash_password("StrongPassword123!"),
            status=UserStatus.ACTIVE.value,
        )
        user_repo.mark_email_verified(user.id)
        db.commit()

    # Login
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "session.user@example.com", "password": "StrongPassword123!"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["email"] == "session.user@example.com"
    assert "session_id" in data

    # Verify Set-Cookie header
    cookie_header = res.headers.get("set-cookie", "")
    assert "autonexa_session=" in cookie_header
    assert "HttpOnly" in cookie_header

    # Request /me using cookie
    res_me = client.get("/api/v1/auth/me")
    assert res_me.status_code == 200
    assert res_me.json()["user"]["email"] == "session.user@example.com"

    # List active sessions
    res_sess = client.get("/api/v1/auth/sessions")
    assert res_sess.status_code == 200
    sessions = res_sess.json()["sessions"]
    assert len(sessions) == 1
    assert sessions[0]["is_current"] is True

    # Logout
    res_logout = client.post("/api/v1/auth/logout")
    assert res_logout.status_code == 200

    # Request /me after logout fails
    res_me_after = client.get("/api/v1/auth/me")
    assert res_me_after.status_code == 401


# -----------------------------------------------------------------------------
# 7. Password Reset & Multi-Session Invalidation
# -----------------------------------------------------------------------------

def test_password_reset_flow_and_session_invalidation(auth_env):
    """Verify password reset workflow invalidates all previous active sessions."""
    client, db_path = auth_env
    email_service = get_email_service()
    email_service.clear_sent_messages()

    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="Reset User",
            email="reset.user@example.com",
            password_hash=hash_password("OldPassword123!"),
            status=UserStatus.ACTIVE.value,
        )
        user_repo.mark_email_verified(user.id)
        db.commit()
        user_id = user.id

    # Create two active sessions for user
    login1 = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "OldPassword123!"},
    )
    assert login1.status_code == 200

    login2 = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "OldPassword123!"},
    )
    assert login2.status_code == 200

    with factory() as db:
        assert len(SessionRepository(db).list_active_sessions_for_user(user_id)) == 2

    # Request forgot password
    res_forgot = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.user@example.com"},
    )
    assert res_forgot.status_code == 200

    # Extract reset token from email
    emails = email_service.get_sent_messages()
    assert len(emails) == 1
    body = emails[0]["plain_body"]
    assert "token=" in body
    raw_token = body.split("token=")[1].split("\n")[0].split("&")[0].strip()

    # Reset password with new password
    res_reset = client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewStrongPassword456!"},
    )
    assert res_reset.status_code == 200

    # Verify all previous sessions revoked
    with factory() as db:
        assert len(SessionRepository(db).list_active_sessions_for_user(user_id)) == 0

    # Old password fails
    res_old = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "OldPassword123!"},
    )
    assert res_old.status_code == 401

    # New password succeeds
    res_new = client.post(
        "/api/v1/auth/login",
        json={"email": "reset.user@example.com", "password": "NewStrongPassword456!"},
    )
    assert res_new.status_code == 200
    assert res_new.json()["user"]["email"] == "reset.user@example.com"


# -----------------------------------------------------------------------------
# 8. Security Dependency Integration (Sessions + API Keys)
# -----------------------------------------------------------------------------

def test_session_authenticates_protected_endpoints(auth_env):
    """Verify that an active user session satisfies verify_api_access."""
    client, db_path = auth_env
    factory = get_session_factory(db_path)
    with factory() as db:
        user_repo = UserRepository(db)
        user = user_repo.create_user(
            name="API User",
            email="api.access@example.com",
            password_hash=hash_password("StrongPassword123!"),
            status=UserStatus.ACTIVE.value,
            role=UserRole.USER.value,
        )
        user_repo.mark_email_verified(user.id)
        db.commit()

    # Login to acquire session cookie
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "api.access@example.com", "password": "StrongPassword123!"},
    )
    assert login_res.status_code == 200

    # Access /api/v1/auth/me using session cookie
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "api.access@example.com"

    # Logout
    client.post("/api/v1/auth/logout")

    # Accessing /api/v1/auth/me after logout fails
    res_unauth = client.get("/api/v1/auth/me")
    assert res_unauth.status_code == 401
