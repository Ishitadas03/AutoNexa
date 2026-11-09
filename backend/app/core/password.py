"""Password hashing, verification, and policy enforcement using Argon2id."""

import base64
import os
import re
import secrets
from typing import Tuple

from cryptography.exceptions import InvalidKey
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id


# OWASP recommended baseline parameters for Argon2id
ARGON2_MEMORY_COST_KB = 65536  # 64 MB
ARGON2_ITERATIONS = 3
ARGON2_LANES = 4
ARGON2_KEY_LENGTH = 32
ARGON2_SALT_LENGTH = 16

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


class PasswordPolicyError(ValueError):
    """Raised when a password violates security policy rules."""
    pass


def validate_password_policy(password: str) -> None:
    """Validate password against length and complexity constraints."""
    if not password or not isinstance(password, str):
        raise PasswordPolicyError("Password must be provided.")

    if len(password) < PASSWORD_MIN_LENGTH:
        raise PasswordPolicyError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long.")

    if len(password) > PASSWORD_MAX_LENGTH:
        raise PasswordPolicyError(f"Password cannot exceed {PASSWORD_MAX_LENGTH} characters.")

    # At least one letter
    if not re.search(r"[A-Za-z]", password):
        raise PasswordPolicyError("Password must contain at least one letter.")

    # At least one digit or special character
    if not re.search(r"[\d\W_]", password):
        raise PasswordPolicyError("Password must contain at least one number or special character.")


def hash_password(password: str) -> str:
    """Hash password using Argon2id with cryptographically random salt.

    Returns encoded string: $argon2id$v=19$m=65536,t=3,p=4$<b64salt>$<b64key>
    """
    validate_password_policy(password)
    salt = os.urandom(ARGON2_SALT_LENGTH)

    kdf = Argon2id(
        salt=salt,
        length=ARGON2_KEY_LENGTH,
        iterations=ARGON2_ITERATIONS,
        lanes=ARGON2_LANES,
        memory_cost=ARGON2_MEMORY_COST_KB,
    )
    key = kdf.derive(password.encode("utf-8"))

    salt_b64 = base64.b64encode(salt).decode("ascii")
    key_b64 = base64.b64encode(key).decode("ascii")

    return f"$argon2id$v=19$m={ARGON2_MEMORY_COST_KB},t={ARGON2_ITERATIONS},p={ARGON2_LANES}${salt_b64}${key_b64}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify password against Argon2id hash using constant-time comparison."""
    if not plain_password or not password_hash:
        return False

    try:
        parts = password_hash.split("$")
        # Format: ["", "argon2id", "v=19", "m=65536,t=3,p=4", "<salt>", "<key>"]
        if len(parts) != 6 or parts[1] != "argon2id":
            return False

        # Parse memory, iterations, lanes
        param_parts = dict(kv.split("=") for kv in parts[3].split(","))
        memory_cost = int(param_parts.get("m", ARGON2_MEMORY_COST_KB))
        iterations = int(param_parts.get("t", ARGON2_ITERATIONS))
        lanes = int(param_parts.get("p", ARGON2_LANES))

        salt = base64.b64decode(parts[4])
        stored_key = base64.b64decode(parts[5])

        kdf = Argon2id(
            salt=salt,
            length=len(stored_key),
            iterations=iterations,
            lanes=lanes,
            memory_cost=memory_cost,
        )

        try:
            kdf.verify(plain_password.encode("utf-8"), stored_key)
            return True
        except InvalidKey:
            return False

    except Exception:
        return False

