"""
utils/auth.py – JWT creation/verification and password hashing helpers.

This module is the security backbone of the application.  It provides:

  1. Password hashing (using bcrypt):
       - Store passwords as irreversible hashes (never store plain text)
       - Verify a user's plain-text entry against the stored hash at login

  2. JWT (JSON Web Token) creation and decoding:
       - After login, the server creates a signed JWT containing the user's
         id, role, and an expiry timestamp
       - The frontend includes this token in every API request
       - The server verifies the token and extracts the user info from it
       - Tokens expire (default: 24 hours), after which the user must log in again

  3. FastAPI dependency functions:
       - get_current_user        – reads and verifies the JWT from the request header
       - require_admin           – additionally checks the user is an admin
       - require_candidate       – additionally checks the user is a candidate
       - get_current_user_optional – like get_current_user but returns None (no error)
         for anonymous routes (e.g. anonymous interview upload)

How FastAPI dependencies work:
  When you write `user = Depends(get_current_user)` in a route, FastAPI
  automatically calls get_current_user(), passes the result as `user`,
  and aborts the request with a 401/403 error if the dependency raises one.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
# HTTPBearer: reads the "Authorization: Bearer <token>" header automatically
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt  # python-jose: JWT encoding/decoding library

from app.config import get_settings

settings = get_settings()  # loads SECRET_KEY, ALGORITHM, TOKEN_EXPIRY from .env


# ── Password hashing ──────────────────────────────────────────────────────────
# bcrypt is a one-way hashing algorithm designed specifically for passwords.
# It is intentionally slow to prevent brute-force attacks.
import bcrypt as _bcrypt


def hash_password(plain: str) -> str:
    """
    Converts a plain-text password into a secure bcrypt hash.

    gensalt() generates a random 'salt' (random bytes mixed into the hash)
    so the same password always produces a different hash — making rainbow
    table attacks impossible.

    Returns: a string like "$2b$12$..." that is safe to store in the database.
    """
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """
    Checks whether a plain-text password matches a stored bcrypt hash.

    bcrypt.checkpw() re-hashes the plain password using the salt embedded
    in the stored hash and compares the results.

    Returns: True if they match, False otherwise.
    Never raises an exception — returns False on any error.
    """
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False  # treat any error (e.g. malformed hash) as a mismatch


# ── JWT (JSON Web Token) ──────────────────────────────────────────────────────
# A JWT is a compact, signed string in three parts: header.payload.signature
# The server uses a secret key to sign it, so it cannot be forged by anyone
# who doesn't have the key.  The payload contains things like user_id, role, and expiry.

# HTTPBearer is a FastAPI security class that reads:
#   Authorization: Bearer eyJhbGci...
# from the request header and extracts the token string.
bearer_scheme = HTTPBearer()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Creates a signed JWT token containing the provided data.

    Example payload (data dict):
        { "sub": "userId123", "role": "candidate", "name": "Alice" }

    The token automatically expires after:
        expires_delta  (if provided)  OR
        settings.access_token_expire_minutes  (from .env, default 24 * 60 minutes)

    Returns: the JWT string to send to the frontend.
    """
    to_encode = data.copy()  # copy to avoid modifying the original dict
    # Calculate the expiry timestamp and add it to the payload as "exp"
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    # jwt.encode() signs the payload with the secret key using the specified algorithm (HS256)
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    """
    Verifies a JWT's signature and expiry, then returns its payload dict.

    Raises an HTTP 401 Unauthorized error if:
      - The token signature is invalid (tampered or wrong secret)
      - The token has expired
      - The token is malformed (not a valid JWT)
    """
    try:
        # jwt.decode() verifies the signature AND checks the "exp" field automatically
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            # WWW-Authenticate header tells browsers which auth scheme to use
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI route dependency functions ────────────────────────────────────────
# These are "dependency injection" functions.
# Add them to a route with `Depends(...)` and FastAPI runs them automatically.

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Extracts the JWT from the request's Authorization header and decodes it.
    Returns the payload dict (e.g. { "sub": "userId", "role": "candidate", ... }).

    Usage in a router:
        @router.get("/me")
        async def get_me(user = Depends(get_current_user)):
            return user
    """
    return decode_token(credentials.credentials)


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Extends get_current_user by additionally requiring the role to be "admin".
    Returns HTTP 403 Forbidden if the user is a candidate or unauthenticated.

    Usage:
        @router.get("/admin-only")
        async def admin_route(user = Depends(require_admin)):
            ...
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_candidate(current_user: dict = Depends(get_current_user)) -> dict:
    """
    Extends get_current_user by additionally requiring the role to be "candidate".
    Returns HTTP 403 Forbidden if the user is an admin or unauthenticated.
    """
    if current_user.get("role") != "candidate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")
    return current_user


# ── Optional authentication ───────────────────────────────────────────────────
# auto_error=False means FastAPI won't automatically return 401 if the header is missing.
# This lets us have routes that work for both logged-in and anonymous users.
bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme_optional),
) -> Optional[dict]:
    """
    Like get_current_user but returns None instead of raising 401 when
    the Authorization header is missing or the token is invalid.

    Used for endpoints that support anonymous access (e.g. uploading answers
    in an anonymous interview session started from a public link).
    """
    if not credentials:
        return None  # no header present → anonymous user
    try:
        return decode_token(credentials.credentials)
    except Exception:
        return None  # invalid token → treat as anonymous
