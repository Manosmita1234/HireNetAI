"""
utils/auth.py – JWT creation/verification + password hashing helpers.
"""

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.config import get_settings

settings = get_settings()

# ── Password hashing ──────────────────────────────────────────────────────────
import bcrypt as _bcrypt


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Encode a JWT containing 'data' with an expiry."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── FastAPI dependencies ───────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Extract and validate the JWT from the Authorization header."""
    return decode_token(credentials.credentials)


def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that rejects non-admin callers."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_candidate(current_user: dict = Depends(get_current_user)) -> dict:
    """Dependency that rejects non-candidate callers."""
    if current_user.get("role") != "candidate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate access required")
    return current_user


# ── Optional auth (returns None if no/invalid token) ─────────────────────────
bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme_optional),
) -> Optional[dict]:
    """Like get_current_user but returns None instead of raising 401."""
    if not credentials:
        return None
    try:
        return decode_token(credentials.credentials)
    except Exception:
        return None
