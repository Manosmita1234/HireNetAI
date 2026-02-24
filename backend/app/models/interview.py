"""
models/interview.py – Interview session and per-answer models.
"""

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ─── Emotion snapshot for a single frame ─────────────────────────────────────
class FrameEmotion(BaseModel):
    timestamp: float            # seconds from video start
    dominant_emotion: str
    emotion_scores: Dict[str, float]   # e.g. {"happy": 0.7, "neutral": 0.2, ...}


# ─── WhisperX word ────────────────────────────────────────────────────────────
class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float
    score: float = 1.0


# ─── LLM evaluation result ───────────────────────────────────────────────────
class LLMEvaluation(BaseModel):
    clarity_score: int = 0
    confidence_score: int = 0
    logic_score: int = 0
    relevance_score: int = 0
    communication_level: str = "Low"
    personality_traits: Dict[str, int] = {}
    strengths: List[str] = []
    weaknesses: List[str] = []
    overall_score: int = 0
    final_verdict: str = "Not Recommended"
    reasoning: str = ""


# ─── Per-answer record ───────────────────────────────────────────────────────
class Answer(BaseModel):
    question_id: str
    question_text: str
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    transcript: Optional[str] = None
    word_timestamps: List[WordTimestamp] = []

    # Emotion analysis
    frame_emotions: List[FrameEmotion] = []
    emotion_distribution: Dict[str, float] = {}
    confidence_index: float = 0.0
    nervousness_score: float = 0.0

    # Hesitation
    pause_count: int = 0
    long_pauses: List[Dict[str, float]] = []
    hesitation_score: float = 0.0

    # LLM
    llm_evaluation: Optional[LLMEvaluation] = None

    # Final answer score (pre-aggregation)
    answer_final_score: float = 0.0

    processed: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Interview session ────────────────────────────────────────────────────────
class InterviewSession(BaseModel):
    id: Optional[str] = None
    candidate_id: str
    candidate_name: str
    candidate_email: str
    answers: List[Answer] = []

    # Aggregated scores
    final_score: float = 0.0
    category: str = "Not Recommended"

    status: str = "in_progress"    # in_progress | completed | processing
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    model_config = {"arbitrary_types_allowed": True}
