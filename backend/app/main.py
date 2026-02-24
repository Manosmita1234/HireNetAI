"""
main.py – FastAPI application entry point.

Starts the app, registers routers, handles CORS, and manages DB lifecycle.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import connect_db, close_db
from app.routers import auth, interview, upload, admin

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup/shutdown events."""
    # ── Startup ────────────────────────────────────────────────────────────
    await connect_db()
    # Ensure upload directory exists
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    print(f"[APP] Upload directory: {settings.upload_path.resolve()}")
    yield
    # ── Shutdown ───────────────────────────────────────────────────────────
    await close_db()


# ── Application instance ──────────────────────────────────────────────────────
app = FastAPI(
    title="HireNetAI – Video Interview Platform",
    description="AI-powered video interview analysis: speech, emotion, LLM evaluation.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(interview.router)
app.include_router(upload.router)
app.include_router(admin.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Dev entrypoint ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
