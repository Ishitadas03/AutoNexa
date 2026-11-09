"""Pydantic schemas for authentication requests, responses, sessions, and token management."""

import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserRegisterRequest(BaseModel):
    """Payload for user registration."""

    name: str = Field(..., min_length=2, max_length=100, description="User full display name")
    email: str = Field(..., min_length=5, max_length=255, description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="Plaintext password")

    @field_validator("email")
    @classmethod
    def validate_email_syntax(cls, v: str) -> str:
        trimmed = v.strip()
        if not EMAIL_REGEX.match(trimmed):
            raise ValueError("Invalid email format.")
        return trimmed

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Name must be at least 2 characters.")
        return trimmed


class UserRegisterResponse(BaseModel):
    """Response returned upon successful user registration."""

    message: str
    user_id: str
    email: str
    status: str
    requires_verification: bool = True


class VerifyEmailRequest(BaseModel):
    """Payload for verifying an account via verification token."""

    token: str = Field(..., min_length=16, description="Opaque single-use verification token")


class VerifyEmailResponse(BaseModel):
    """Response for email verification."""

    message: str
    verified: bool
    email: str


class ResendVerificationRequest(BaseModel):
    """Payload to request re-delivery of verification email."""

    email: str = Field(..., description="Email address of the unverified account")


class LoginRequest(BaseModel):
    """Payload for credential authentication."""

    email: str = Field(..., description="Registered user email")
    password: str = Field(..., description="User password")


class UserPublicProfile(BaseModel):
    """Safe public representation of a user identity (excluding credentials)."""

    id: str
    name: str
    email: str
    role: str
    status: str
    is_email_verified: bool
    created_at: str
    last_login_at: Optional[str] = None


class LoginResponse(BaseModel):
    """Response returned upon successful authentication."""

    message: str
    user: UserPublicProfile
    session_id: str


class UserSessionRecord(BaseModel):
    """Representation of an active user session."""

    id: str
    user_id: str
    created_at: str
    expires_at: str
    last_activity_at: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_current: bool = False


class SessionListResponse(BaseModel):
    """List of active sessions for the current user."""

    sessions: List[UserSessionRecord]
    total: int


class ForgotPasswordRequest(BaseModel):
    """Payload to request a password reset link."""

    email: str = Field(..., description="Email address associated with the account")


class ResetPasswordRequest(BaseModel):
    """Payload to reset password using an issued reset token."""

    token: str = Field(..., min_length=16, description="Opaque password reset token")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")


class UserMeResponse(BaseModel):
    """Profile data for currently authenticated user session."""

    user: UserPublicProfile
    active_sessions_count: int
    data_access_restricted: bool = True
    restriction_message: str = (
        "AutoNexa Identity Foundation (Phase 17F Active) — Full tenant dataset isolation is scheduled for Phase 17G. "
        "Shared research dataset management is currently restricted to platform administrators."
    )

