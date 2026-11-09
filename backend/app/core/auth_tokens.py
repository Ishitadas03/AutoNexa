"""Cryptographic opaque token generation and hashing for sessions and verification."""

import hashlib
import secrets
from typing import Tuple


def generate_opaque_token(nbytes: int = 32) -> str:
    """Generate a high-entropy URL-safe opaque token string."""
    return secrets.token_urlsafe(nbytes)


def hash_token(raw_token: str) -> str:
    """Compute SHA-256 digest of an opaque token for secure database persistence."""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def generate_token_pair(nbytes: int = 32) -> Tuple[str, str]:
    """Generate an (opaque_token, token_hash) pair.

    The raw opaque_token is delivered to the client/email.
    The token_hash is stored in the database.
    """
    raw = generate_opaque_token(nbytes=nbytes)
    h = hash_token(raw)
    return raw, h


def verify_token_hash(raw_token: str, stored_hash: str) -> bool:
    """Verify an opaque token against a stored hash using constant-time comparison."""
    if not raw_token or not stored_hash:
        return False
    computed_hash = hash_token(raw_token)
    return secrets.compare_digest(computed_hash, stored_hash)

