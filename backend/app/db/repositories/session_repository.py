"""Repository for authenticated session persistence, activity tracking, and revocation."""

from datetime import datetime, timezone
import logging
from typing import List, Optional

from sqlalchemy import and_, select, update
from sqlalchemy.orm import Session

from app.db.models import SessionModel, utc_now

logger = logging.getLogger(__name__)


class SessionRepository:
    """Data access layer for user sessions."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def create_session(
        self,
        user_id: str,
        token_hash: str,
        expires_at: datetime,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> SessionModel:
        """Create and persist an opaque session record."""
        now = utc_now()
        sess = SessionModel(
            user_id=user_id,
            token_hash=token_hash,
            created_at=now,
            expires_at=expires_at,
            last_activity_at=now,
            revoked_at=None,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
        )
        self.session.add(sess)
        self.session.flush()
        return sess

    def get_valid_session_by_token_hash(self, token_hash: str) -> Optional[SessionModel]:
        """Look up an active, unexpired, non-revoked session by token hash."""
        now = utc_now()
        stmt = select(SessionModel).where(
            and_(
                SessionModel.token_hash == token_hash,
                SessionModel.revoked_at.is_(None),
                SessionModel.expires_at > now,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def touch_activity(self, session_id: str) -> None:
        """Update last_activity_at timestamp for an active session."""
        stmt = (
            update(SessionModel)
            .where(SessionModel.id == session_id)
            .values(last_activity_at=utc_now())
        )
        self.session.execute(stmt)
        self.session.flush()

    def revoke_session(self, session_id: str) -> bool:
        """Explicitly revoke a single session."""
        now = utc_now()
        stmt = (
            update(SessionModel)
            .where(
                and_(
                    SessionModel.id == session_id,
                    SessionModel.revoked_at.is_(None),
                )
            )
            .values(revoked_at=now)
        )
        result = self.session.execute(stmt)
        self.session.flush()
        return (result.rowcount or 0) > 0

    def revoke_all_user_sessions(self, user_id: str) -> int:
        """Revoke all active sessions for a user (e.g. on password reset or logout-all)."""
        now = utc_now()
        stmt = (
            update(SessionModel)
            .where(
                and_(
                    SessionModel.user_id == user_id,
                    SessionModel.revoked_at.is_(None),
                )
            )
            .values(revoked_at=now)
        )
        result = self.session.execute(stmt)
        self.session.flush()
        return result.rowcount or 0

    def list_active_sessions_for_user(self, user_id: str) -> List[SessionModel]:
        """List active non-revoked sessions for a user."""
        now = utc_now()
        stmt = (
            select(SessionModel)
            .where(
                and_(
                    SessionModel.user_id == user_id,
                    SessionModel.revoked_at.is_(None),
                    SessionModel.expires_at > now,
                )
            )
            .order_by(SessionModel.last_activity_at.desc())
        )
        return list(self.session.execute(stmt).scalars().all())

