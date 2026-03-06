"""
conftest.py – Pytest fixtures for HireNetAI backend tests.

Uses mongomock-motor for an in-memory MongoDB substitute so tests
run without a real database.
"""

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# ── Override database before importing the app ────────────────────────────────
from mongomock_motor import AsyncMongoMockClient
from app import database as db_module


@pytest.fixture(scope="session")
def event_loop():
    """Create a single event loop shared across the whole test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def mock_db(monkeypatch):
    """
    Replace the Motor client with an in-memory mock client before each test.
    Ensures tests are isolated and don't touch a real MongoDB instance.
    """
    mock_client = AsyncMongoMockClient()
    monkeypatch.setattr(db_module, "_client", mock_client)
    yield mock_client
    # Clean up collections after each test
    db = mock_client["hirenet_ai"]
    for col in await db.list_collection_names():
        await db[col].drop()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Return an httpx test client pointed at the FastAPI app."""
    from app.main import app
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac


# ── Helper: create and login a user ──────────────────────────────────────────

async def create_user(client: AsyncClient, email: str, full_name: str, role: str = "candidate") -> dict:
    """Helper: register a user and return the token response."""
    resp = await client.post("/auth/signup", json={
        "email": email,
        "full_name": full_name,
        "password": "TestPass123",
        "role": role,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


async def login_user(client: AsyncClient, email: str) -> dict:
    """Helper: login and return the token response."""
    resp = await client.post("/auth/login", json={
        "email": email,
        "password": "TestPass123",
    })
    assert resp.status_code == 200
    return resp.json()


def auth_headers(token: str) -> dict:
    """Build Authorization header dict from a JWT token string."""
    return {"Authorization": f"Bearer {token}"}
