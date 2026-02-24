"""
config.py – Central application settings loaded from environment variables.
Uses pydantic-settings for validation and type coercion.
"""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── MongoDB ──────────────────────────────────────────────────────────────
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "hirenet_ai"

    # ── JWT ──────────────────────────────────────────────────────────────────
    secret_key: str = "CHANGE_ME"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 h

    # ── LLM (OpenRouter or OpenAI) ──────────────────────────────────────────
    openai_api_key: str = ""              # set to your OpenRouter key
    openai_model: str = "openai/gpt-4o-mini"
    openai_base_url: str = "https://openrouter.ai/api/v1"  # OpenRouter endpoint

    # ── WhisperX ─────────────────────────────────────────────────────────────
    whisper_model_size: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # ── Storage ──────────────────────────────────────────────────────────────
    upload_dir: str = "app/uploads"

    # ── CORS ─────────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    @property
    def origins_list(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    """Return a cached Settings singleton."""
    return Settings()
