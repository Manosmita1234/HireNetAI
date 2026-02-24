"""
database.py – Async MongoDB connection using Motor.
Call connect_db() on startup and close_db() on shutdown.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

settings = get_settings()

# Module-level client reference so we can close it on shutdown
_client: AsyncIOMotorClient | None = None


async def connect_db() -> None:
    """Create the Motor client and attach it to this module."""
    global _client
    _client = AsyncIOMotorClient(settings.mongodb_url)
    try:
        # Trigger a lightweight command to verify connectivity
        await _client.admin.command("ping")
        print("[DB] Connected to MongoDB ✓")
    except Exception as e:
        # Non-fatal: warn but keep the client so connections are retried per-request
        print(f"[DB] WARNING: Could not ping MongoDB: {e}")
        print("[DB] Ensure MongoDB is running on:", settings.mongodb_url)


async def close_db() -> None:
    """Gracefully close the Motor client."""
    global _client
    if _client:
        _client.close()
        print("[DB] MongoDB connection closed.")


def get_database() -> AsyncIOMotorDatabase:
    """Return the application database handle (used as a FastAPI dependency)."""
    if _client is None:
        raise RuntimeError("Database not initialised – call connect_db() first.")
    return _client[settings.mongodb_db_name]
