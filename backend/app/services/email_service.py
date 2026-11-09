"""Configurable email delivery service supporting in-memory, console, and SMTP backends."""

import email.message
import logging
import smtplib
from typing import Any, Dict, List, Optional

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    """Raised when email delivery fails."""
    pass


class EmailService:
    """Service for sending transactional authentication emails."""

    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        self._sent_messages: List[Dict[str, Any]] = []

    def clear_sent_messages(self) -> None:
        """Clear memory backend messages queue (for test isolation)."""
        self._sent_messages.clear()

    def get_sent_messages(self) -> List[Dict[str, Any]]:
        """Retrieve sent messages queue (for testing verification)."""
        return list(self._sent_messages)

    def send_verification_email(self, to_email: str, name: str, raw_token: str) -> bool:
        """Deliver email verification link to newly registered user."""
        frontend_base = self.settings.auth_frontend_url.rstrip("/")
        verification_url = f"{frontend_base}/verify-email?token={raw_token}"

        subject = "Verify your AutoNexa account"
        plain_body = (
            f"Hello {name},\n\n"
            f"Thank you for registering with AutoNexa.\n\n"
            f"Please verify your email address by clicking the link below:\n"
            f"{verification_url}\n\n"
            f"This link expires in {self.settings.auth_email_verification_expiry_seconds // 3600} hours.\n"
            f"If you did not create an AutoNexa account, please ignore this email.\n"
        )
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background-color: #F8FAFC; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; border: 1px solid #E2E8F0;">
                <h2 style="color: #0F172A; margin-top: 0;">AutoNexa Account Verification</h2>
                <p style="color: #475569; font-size: 15px;">Hello {name},</p>
                <p style="color: #475569; font-size: 15px;">Thank you for registering with AutoNexa. Please confirm your email address to activate your account:</p>
                <div style="margin: 28px 0;">
                    <a href="{verification_url}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: bold; font-size: 14px; display: inline-block;">
                        Verify Email Address
                    </a>
                </div>
                <p style="color: #64748B; font-size: 13px;">Or copy and paste this link into your browser:<br/><a href="{verification_url}" style="color: #1D4ED8;">{verification_url}</a></p>
                <p style="color: #94A3B8; font-size: 12px; margin-top: 24px; border-top: 1px solid #E2E8F0; padding-top: 16px;">This link will expire in {self.settings.auth_email_verification_expiry_seconds // 3600} hours. If you did not sign up for AutoNexa, no action is needed.</p>
            </div>
        </body>
        </html>
        """
        return self._send(
            to_email=to_email,
            subject=subject,
            plain_body=plain_body,
            html_body=html_body,
            message_type="verification",
            token=raw_token,
            action_url=verification_url,
        )

    def send_password_reset_email(self, to_email: str, name: str, raw_token: str) -> bool:
        """Deliver password reset link to user requesting password recovery."""
        frontend_base = self.settings.auth_frontend_url.rstrip("/")
        reset_url = f"{frontend_base}/reset-password?token={raw_token}"

        subject = "Reset your AutoNexa password"
        plain_body = (
            f"Hello {name},\n\n"
            f"We received a request to reset your AutoNexa account password.\n\n"
            f"Please click the link below to set a new password:\n"
            f"{reset_url}\n\n"
            f"This link expires in {self.settings.auth_password_reset_expiry_seconds // 60} minutes.\n"
            f"If you did not request a password reset, your account remains secure and no action is required.\n"
        )
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background-color: #F8FAFC; padding: 24px;">
            <div style="max-width: 560px; margin: 0 auto; background: white; padding: 32px; border-radius: 12px; border: 1px solid #E2E8F0;">
                <h2 style="color: #0F172A; margin-top: 0;">AutoNexa Password Reset</h2>
                <p style="color: #475569; font-size: 15px;">Hello {name},</p>
                <p style="color: #475569; font-size: 15px;">We received a request to reset your AutoNexa account password. Click the button below to choose a new password:</p>
                <div style="margin: 28px 0;">
                    <a href="{reset_url}" style="background-color: #1D4ED8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: bold; font-size: 14px; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="color: #64748B; font-size: 13px;">Or copy and paste this link into your browser:<br/><a href="{reset_url}" style="color: #1D4ED8;">{reset_url}</a></p>
                <p style="color: #94A3B8; font-size: 12px; margin-top: 24px; border-top: 1px solid #E2E8F0; padding-top: 16px;">This link will expire in {self.settings.auth_password_reset_expiry_seconds // 60} minutes. If you did not request this, please ignore this email.</p>
            </div>
        </body>
        </html>
        """
        return self._send(
            to_email=to_email,
            subject=subject,
            plain_body=plain_body,
            html_body=html_body,
            message_type="password_reset",
            token=raw_token,
            action_url=reset_url,
        )

    def _send(
        self,
        to_email: str,
        subject: str,
        plain_body: str,
        html_body: str,
        message_type: str,
        token: str,
        action_url: str,
    ) -> bool:
        """Internal dispatch to configured email backend."""
        backend = (self.settings.email_backend or "console").strip().lower()

        message_record = {
            "to": to_email,
            "subject": subject,
            "plain_body": plain_body,
            "html_body": html_body,
            "type": message_type,
            "token": token,
            "action_url": action_url,
        }

        # 1. In-memory backend (testing & development inspection)
        if backend == "memory":
            self._sent_messages.append(message_record)
            logger.info("Email queued in memory backend for: %s | Subject: %s", to_email, subject)
            return True

        # 2. Console backend (stdout/logger output for local development & Docker)
        if backend == "console":
            self._sent_messages.append(message_record)
            logger.info(
                "\n================================================================================\n"
                "AUTONEXA TRANSACTIONAL EMAIL [%s]\n"
                "To: %s\nSubject: %s\nAction URL: %s\n"
                "================================================================================",
                message_type.upper(),
                to_email,
                subject,
                action_url,
            )
            return True

        # 3. SMTP backend
        if backend == "smtp":
            if not self.settings.smtp_host:
                raise EmailDeliveryError("SMTP email backend selected but SMTP_HOST is not configured.")

            msg = email.message.EmailMessage()
            msg["Subject"] = subject
            msg["From"] = self.settings.smtp_from
            msg["To"] = to_email
            msg.set_content(plain_body)
            msg.add_alternative(html_body, subtype="html")

            try:
                smtp_server = smtplib.SMTP(
                    self.settings.smtp_host,
                    self.settings.smtp_port,
                    timeout=10,
                )
                if self.settings.smtp_tls:
                    smtp_server.starttls()
                if self.settings.smtp_user and self.settings.smtp_password:
                    smtp_server.login(self.settings.smtp_user, self.settings.smtp_password)
                smtp_server.send_message(msg)
                smtp_server.quit()
                self._sent_messages.append(message_record)
                logger.info("Successfully delivered SMTP email to %s", to_email)
                return True
            except Exception as exc:
                logger.error("Failed to deliver SMTP email to %s: %s", to_email, exc)
                raise EmailDeliveryError(f"SMTP delivery failed: {exc}") from exc

        raise EmailDeliveryError(f"Unsupported EMAIL_BACKEND: '{backend}'. Valid options: 'console', 'memory', 'smtp'.")


_email_service_instance: Optional[EmailService] = None


def get_email_service() -> EmailService:
    """Dependency provider for EmailService."""
    global _email_service_instance
    if _email_service_instance is None:
        _email_service_instance = EmailService()
    return _email_service_instance

