"""
models/question.py – Interview question bank model.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Question(BaseModel):
    id: Optional[str] = None
    text: str
    category: str = "general"          # e.g. "behavioural", "technical", "situational"
    difficulty: str = "medium"         # easy | medium | hard
    expected_duration_seconds: int = 120
    created_at: datetime = Field(default_factory=datetime.utcnow)
