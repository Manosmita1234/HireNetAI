"""
routers/auth.py – Authentication endpoints: signup, login.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.models.user import UserInDB
from app.schemas.auth import LoginRequest, SignupRequest, TokenResponse
from app.utils.auth import create_access_token, hash_password, verify_password
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
