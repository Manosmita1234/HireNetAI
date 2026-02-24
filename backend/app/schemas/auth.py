"""
schemas/auth.py – Request/Response schemas for Authentication endpoints.
"""

from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.CANDIDATE


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str
    full_name: str
