"""
routers/auth.py – Authentication endpoints: signup, login, forgot/reset password.

This module defines the HTTP routes (API endpoints) that the frontend calls
for all authentication-related actions.  The URL prefix "/auth" is added to
every route below, so the full URLs become:
  POST /auth/signup
  POST /auth/login
  POST /auth/forgot-password
  POST /auth/reset-password

FastAPI automatically:
  - Parses and validates the JSON request body using the Pydantic schemas
  - Returns an HTTP 422 error if the body is missing required fields
  - Generates interactive API docs at http://localhost:8000/docs
"""

import secrets                           # Python stdlib: cryptographically secure random number generator
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase  # async MongoDB driver

from app.database import get_database    # dependency: provides a database connection per request
from app.models.user import UserInDB     # Pydantic model for the User MongoDB document
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
# APIRouter groups related routes; prefix="/auth" means all routes start with /auth
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(
    body: SignupRequest,                             # JSON body parsed and validated by Pydantic
    db: AsyncIOMotorDatabase = Depends(get_database), # MongoDB connection injected by FastAPI
):
    """Register a new candidate (or admin) account and return a JWT."""
    # Check if someone has already registered with this email
    if await db["users"].find_one({"email": body.email}):
        raise HTTPException(status_code=400, detail="Email already registered")

    # Hash the plain-text password with bcrypt before storing
    # (we NEVER store the plain password — only the hash)
    hashed = hash_password(body.password)

    # Build the UserInDB model (this adds created_at, is_active, etc. automatically)
    user = UserInDB(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        hashed_password=hashed,
    )

    # Insert the new user into the "users" MongoDB collection
    # exclude={"id"} prevents sending the empty id field (MongoDB generates _id automatically)
    result = await db["users"].insert_one(user.model_dump(exclude={"id"}))
    user_id = str(result.inserted_id)  # convert MongoDB's ObjectId to a plain string

    # Create a signed JWT so the user is immediately logged in after signup
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
    # Look up the user by email in the "users" collection
    doc = await db["users"].find_one({"email": body.email})

    # verify_password compares the plain-text input against the stored bcrypt hash
    # We check BOTH conditions together (no separate "user not found" message)
    # to prevent attackers from knowing which accounts exist (user enumeration)
    if not doc or not verify_password(body.password, doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",  # vague on purpose — doesn't say which is wrong
        )

    user_id = str(doc["_id"])  # MongoDB ObjectId → string
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

    Security note: Always returns the same generic message whether or not
    the email exists. This prevents "user enumeration" — an attack where
    an attacker submits many emails to find out which ones have accounts.
    """
    user = await db["users"].find_one({"email": body.email})

    if user:
        # Delete any earlier unused reset tokens for this user
        # (only one active reset link at a time)
        await db["password_reset_tokens"].delete_many({"email": body.email})

        # secrets.token_urlsafe(32) creates a 32-byte (256-bit) cryptographically random string
        # It is URL-safe (no special characters), making it safe to embed in a link
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.reset_token_expire_minutes)

        # Persist the token in the database so we can verify it later
        await db["password_reset_tokens"].insert_one({
            "email": body.email,
            "token": token,
            "expires_at": expires_at,       # checked during reset to prevent expired links
            "created_at": datetime.utcnow(),
        })

        # Build the link that goes in the email (points to the frontend reset page)
        reset_link = f"{settings.frontend_url}/reset-password?token={token}"
        full_name = user.get("full_name", "there")

        # Fire-and-forget: send the email without blocking this response
        # In development mode, email_service prints the link to the console instead of sending
        await send_reset_email(body.email, reset_link, full_name)

    # Always return the same message whether the email was found or not
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
    # Look up the token in the password_reset_tokens collection
    record = await db["password_reset_tokens"].find_one({"token": body.token})

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token.",
        )

    # Check if the token has passed its expiry time
    if datetime.utcnow() > record["expires_at"]:
        # Clean up the stale token from the database
        await db["password_reset_tokens"].delete_one({"token": body.token})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has expired. Please request a new one.",
        )

    # Enforce minimum password length
    if len(body.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters.",
        )

    # Hash the new password and overwrite the existing hash in the database
    # MongoDB's $set operator updates only the specified field, leaving others untouched
    new_hashed = hash_password(body.new_password)
    result = await db["users"].update_one(
        {"email": record["email"]},            # find user by email stored in the token record
        {"$set": {"hashed_password": new_hashed}},  # update only the hashed_password field
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found.",
        )

    # Delete the token so it can never be used again (one-time use tokens)
    await db["password_reset_tokens"].delete_one({"token": body.token})

    return MessageResponse(message="Password updated successfully. You can now log in.")
