"""
tests/test_auth.py – Unit tests for authentication endpoints.

Covers: signup, duplicate email, login success, wrong password,
forgot-password, and basic JWT protection.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import create_user, auth_headers


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient):
    """A new user should be able to register and receive a JWT."""
    resp = await client.post("/auth/signup", json={
        "email": "alice@example.com",
        "full_name": "Alice Smith",
        "password": "SecurePass1!",
        "role": "candidate",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "candidate"
    assert data["full_name"] == "Alice Smith"


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient):
    """Registering with an already-used email should return 400."""
    payload = {
        "email": "dup@example.com",
        "full_name": "Dup User",
        "password": "pass123",
        "role": "candidate",
    }
    await client.post("/auth/signup", json=payload)
    resp = await client.post("/auth/signup", json=payload)
    assert resp.status_code == 400
    assert "already registered" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """A registered user should be able to log in and receive a JWT."""
    await create_user(client, "bob@example.com", "Bob Jones", "admin")
    resp = await client.post("/auth/login", json={
        "email": "bob@example.com",
        "password": "TestPass123",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """An incorrect password should return 401."""
    await create_user(client, "carol@example.com", "Carol Brown")
    resp = await client.post("/auth/login", json={
        "email": "carol@example.com",
        "password": "WrongPassword",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    """Logging in with an unregistered email should return 401."""
    resp = await client.post("/auth/login", json={
        "email": "nobody@example.com",
        "password": "DoesNotMatter",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_requires_token(client: AsyncClient):
    """
    Accessing a protected endpoint without any Authorization header should
    return 403 (FastAPI HTTPBearer auto_error=True rejects missing credentials with 403).
    A 401 is only returned when a token IS present but invalid/expired.
    """
    resp = await client.get("/interview/my-sessions")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_endpoint_requires_admin_role(client: AsyncClient):
    """A candidate JWT should be rejected on admin-only endpoints."""
    token_data = await create_user(client, "candidate@x.com", "Cand User", "candidate")
    resp = await client.get(
        "/admin/candidates",
        headers=auth_headers(token_data["access_token"]),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_forgot_password_always_returns_200(client: AsyncClient):
    """Forgot-password should return 200 even for unknown emails (anti-enumeration)."""
    resp = await client.post("/auth/forgot-password", json={"email": "nonexistent@x.com"})
    assert resp.status_code == 200
    assert "message" in resp.json()
