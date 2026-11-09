"""Repository for user account persistence, identity lookups, and authentication token lifecycle."""

from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session

from app.db.models import AuthTokenModel, TokenType, UserModel, UserRole, UserStatus, utc_now

logger = logging.getLogger(__name__)


def normalize_email(email: str) -> str:
    """Normalize email by trimming and lowercasing."""
    return email.strip().lower()


class UserRepository:
    """Data access layer for user accounts and authentication tokens."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, user_id: str) -> Optional[UserModel]:
        """Fetch a single user by primary key ID."""
        stmt = select(UserModel).where(UserModel.id == user_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_normalized_email(self, normalized_email: str) -> Optional[UserModel]:
        """Fetch a user record by normalized lowercase email."""
        stmt = select(UserModel).where(UserModel.normalized_email == normalized_email)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_by_email(self, email: str) -> Optional[UserModel]:
        """Fetch a user record by email, performing normalization."""
        return self.get_by_normalized_email(normalize_email(email))

    def create_user(
        self,
        name: str,
        email: str,
        password_hash: str,
        role: str = UserRole.USER.value,
        status: str = UserStatus.PENDING_VERIFICATION.value,
    ) -> UserModel:
        """Create and persist a new user identity record."""
        norm_email = normalize_email(email)
        now = utc_now()
        user = UserModel(
            name=name.strip(),
            email=email.strip(),
            normalized_email=norm_email,
            password_hash=password_hash,
            role=role,
            status=status,
            is_email_verified=False,
            created_at=now,
            updated_at=now,
        )
        self.session.add(user)
        self.session.flush()
        return user

    def mark_email_verified(self, user_id: str) -> Optional[UserModel]:
        """Transition user status to active and record email verification timestamp."""
        user = self.get_by_id(user_id)
        if user is None:
            return None
        now = utc_now()
        user.is_email_verified = True
        user.email_verified_at = now
        user.status = UserStatus.ACTIVE.value
        user.updated_at = now
        self.session.flush()
        return user

    def update_password(self, user_id: str, password_hash: str) -> Optional[UserModel]:
        """Update password hash for a user."""
        user = self.get_by_id(user_id)
        if user is None:
            return None
        now = utc_now()
        user.password_hash = password_hash
        user.updated_at = now
        self.session.flush()
        return user

    def update_last_login(self, user_id: str) -> Optional[UserModel]:
        """Record last login timestamp for an authenticated user."""
        user = self.get_by_id(user_id)
        if user is not None:
            user.last_login_at = utc_now()
            self.session.flush()
        return user

    def update_status(self, user_id: str, new_status: str) -> Optional[UserModel]:
        """Update account status."""
        user = self.get_by_id(user_id)
        if user is not None:
            user.status = new_status
            user.updated_at = utc_now()
            self.session.flush()
        return user

    # -------------------------------------------------------------------------
    # Auth Token Management (Email Verification & Password Reset)
    # -------------------------------------------------------------------------

    def create_auth_token(
        self,
        user_id: str,
        token_hash: str,
        token_type: str,
        expires_at: datetime,
    ) -> AuthTokenModel:
        """Persist a single-use hashed authentication token."""
        token_record = AuthTokenModel(
            user_id=user_id,
            token_hash=token_hash,
            token_type=token_type,
            expires_at=expires_at,
            created_at=utc_now(),
        )
        self.session.add(token_record)
        self.session.flush()
        return token_record

    def get_valid_auth_token(
        self,
        token_hash: str,
        token_type: str,
    ) -> Optional[AuthTokenModel]:
        """Find an unexpired, unused token by its cryptographic hash and type."""
        now = utc_now()
        stmt = select(AuthTokenModel).where(
            and_(
                AuthTokenModel.token_hash == token_hash,
                AuthTokenModel.token_type == token_type,
                AuthTokenModel.used_at.is_(None),
                AuthTokenModel.expires_at > now,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def mark_token_used(self, token_id: str) -> None:
        """Mark an auth token as consumed to prevent replay."""
        now = utc_now()
        stmt = (
            update(AuthTokenModel)
            .where(AuthTokenModel.id == token_id)
            .values(used_at=now)
        )
        self.session.execute(stmt)
        self.session.flush()

    def invalidate_pending_tokens(self, user_id: str, token_type: str) -> int:
        """Mark all existing unconsumed tokens of a given type as used for a user."""
        now = utc_now()
        stmt = (
            update(AuthTokenModel)
            .where(
                and_(
                    AuthTokenModel.user_id == user_id,
                    AuthTokenModel.token_type == token_type,
                    AuthTokenModel.used_at.is_(None),
                )
            )
            .values(used_at=now)
        )
        result = self.session.execute(stmt)
        self.session.flush()
        return result.rowcount or 0

