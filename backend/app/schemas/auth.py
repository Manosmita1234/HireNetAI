"""
schemas/auth.py – Request/Response data shapes for authentication endpoints.

"Schemas" (sometimes called DTOs – Data Transfer Objects) define exactly what
data is expected in an HTTP request body, and what data is sent back in the response.

Pydantic is the library that powers these classes.  It automatically:
  - Validates incoming JSON (raises 422 Unprocessable Entity if fields are wrong)
  - Converts types (e.g. string "true" → Python bool True)
  - Generates interactive API docs (visible at /docs when the server runs)

Every class here is used in a router (see app/routers/auth.py) as a type annotation.
FastAPI reads the annotation and knows what JSON to expect or return.
"""

from pydantic import BaseModel, EmailStr  # BaseModel: base class for all schemas; EmailStr: validated email type
from app.models.user import UserRole      # UserRole enum defines valid role strings ("candidate" / "admin")


# ── Request schemas (data sent by the client → server) ───────────────────────

class SignupRequest(BaseModel):
    """Data required to create a new account."""
    email: EmailStr      # Pydantic validates this is a properly formatted email (e.g. user@example.com)
    password: str        # plain-text; the router hashes it before storing
    full_name: str       # displayed in the UI
    role: UserRole = UserRole.CANDIDATE  # default: candidate (admins are created manually or via seed)


class LoginRequest(BaseModel):
    """Credentials the user submits to log in."""
    email: EmailStr
    password: str  # plain-text; the router compares it against the stored bcrypt hash


class ForgotPasswordRequest(BaseModel):
    """Submitted when the user clicks 'Forgot Password' and enters their email."""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Submitted on the Reset Password page after clicking the email link."""
    token: str         # the reset token from the URL (e.g. ?token=xyz)
    new_password: str  # the new password the user wants; the router hashes it before saving


# ── Response schemas (data sent by the server → client) ──────────────────────

class TokenResponse(BaseModel):
    """
    Returned on successful login or signup.

    The frontend stores 'access_token' in localStorage and sends it
    on every subsequent request in the Authorization header:
        Authorization: Bearer <access_token>
    """
    access_token: str          # the JWT string
    token_type: str = "bearer" # always "bearer" – part of the OAuth2 standard
    user_id: str               # MongoDB document _id (as string)
    role: str                  # "candidate" or "admin" – used by frontend for routing
    full_name: str             # displayed as "Hi, <full_name>" in the navbar


class MessageResponse(BaseModel):
    """
    A simple envelope for endpoints that only need to send a text message.
    e.g. { "message": "Password reset email sent." }
    """
    message: str
