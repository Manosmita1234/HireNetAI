"""
routers/auth.py – Authentication endpoints: signup, login, forgot/reset password.
"""

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import UserInDB
from app.schemas.auth import (
    LoginRequest,
    SignupRequest,
    TokenResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    MessageResponse,
)
from app.utils.auth import create_access_token, hash_password, verify_password
from app.services.email_service import send_reset_email
from app.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(
    body: SignupRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Register a new candidate (or admin) account and return a JWT."""
    # Ensure email is unique
    if await db["users"].find_one({"email": body.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(body.password)
    user = UserInDB(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        hashed_password=hashed,
    )
    result = await db["users"].insert_one(user.model_dump(exclude={"id"}))
    user_id = str(result.inserted_id)

    token = create_access_token(
        {"sub": user_id, "role": body.role.value, "email": body.email},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(
        access_token=token,
        user_id=user_id,
        role=body.role.value,
        full_name=body.full_name,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Authenticate a user and return a JWT."""
    doc = await db["users"].find_one({"email": body.email})
    if not doc or not verify_password(body.password, doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user_id = str(doc["_id"])
    token = create_access_token(
        {"sub": user_id, "role": doc["role"], "email": doc["email"]},
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return TokenResponse(
        access_token=token,
        user_id=user_id,
        role=doc["role"],
        full_name=doc["full_name"],
    )


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Generate a password-reset token and email it to the user.

    Always returns a success message to prevent user-enumeration attacks.
    """
    user = await db["users"].find_one({"email": body.email})

    if user:
        # Delete any existing reset tokens for this email
        await db["password_reset_tokens"].delete_many({"email": body.email})

        # Generate a secure random token
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.reset_token_expire_minutes)

        await db["password_reset_tokens"].insert_one({
            "email": body.email,
            "token": token,
            "expires_at": expires_at,
            "created_at": datetime.utcnow(),
        })

        reset_link = f"{settings.frontend_url}/reset-password?token={token}"
        full_name = user.get("full_name", "there")

        # Fire-and-forget (prints to console in dev mode)
        await send_reset_email(body.email, reset_link, full_name)

    return MessageResponse(
        message=(
            "If an account with that email exists, "
            "you will receive a password reset link shortly."
        )
    )


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Verify the reset token and update the user's password."""
    record = await db["password_reset_tokens"].find_one({"token": body.token})

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    if datetime.utcnow() > record["expires_at"]:
        # Clean up expired token
        await db["password_reset_tokens"].delete_one({"token": body.token})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has expired. Please request a new one.",
        )

    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters.",
        )

    # Update the user's password
    new_hashed = hash_password(body.new_password)
    result = await db["users"].update_one(
        {"email": record["email"]},
        {"$set": {"hashed_password": new_hashed}},
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    # Delete the used token (one-time use)
    await db["password_reset_tokens"].delete_one({"token": body.token})

    return MessageResponse(message="Password updated successfully. You can now log in.")
