"""
models/user.py – Pydantic models for User documents stored in MongoDB.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId


class UserRole(str, Enum):
    CANDIDATE = "candidate"
    ADMIN = "admin"


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.CANDIDATE


class UserInDB(UserBase):
    """Represents the document as stored in MongoDB."""
    id: Optional[str] = None
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    model_config = {"arbitrary_types_allowed": True}


class UserCreate(UserBase):
    password: str


class UserPublic(UserBase):
    """Safe representation returned to clients (no password)."""
    id: str
    created_at: datetime
    is_active: bool
