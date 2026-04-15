"""
schemas/interview.py – Request/Response data shapes for interview endpoints.

These Pydantic models define the exact JSON structure the API sends to the frontend.
FastAPI automatically converts Python objects (from MongoDB) into these shapes
and validates the structure before sending or receiving data.

How data flows:
  MongoDB document → Python dict → Pydantic model → JSON response to frontend
  JSON request body → Pydantic model → Python dict → saved to MongoDB
"""

from typing import Any, Dict, List, Optional  # Python type hints for nested data structures
from pydantic import BaseModel


# ── Session lifecycle responses ───────────────────────────────────────────────

class StartSessionResponse(BaseModel):
    """
    Returned when a new interview session is created.
    The frontend uses 'session_id' in all subsequent URLs:
      /candidate/interview/<session_id>
      /upload/answer  (as a form field)
    """
    session_id: str  # MongoDB _id of the created InterviewSession document
    message: str     # e.g. "Session started successfully"


class UploadAnswerResponse(BaseModel):
    """
    Returned after a video answer is uploaded for one question.
    'processing_started' will be True if the last answer was uploaded
    and the AI pipeline (WhisperX + DeepFace + LLM) has been triggered.
    """
    session_id: str
    question_id: str
    message: str
    processing_started: bool = False  # True = AI analysis has begun in the background


# ── Admin list view ───────────────────────────────────────────────────────────

class SessionSummary(BaseModel):
    """
    A summary row for the Admin Dashboard table.
    Contains just the high-level stats — no per-answer details.
    The full detail view uses SessionDetail below.
    """
    session_id: str
    candidate_name: str
    candidate_email: str
    status: str          # "in_progress" | "processing" | "completed"
    final_score: float   # overall score 0–10 (computed by scoring_service.py)
    category: str        # "Highly Recommended" | "Recommended" | "Average" | "Not Recommended"
    started_at: str      # ISO datetime string (e.g. "2025-03-23T12:00:00")
    completed_at: Optional[str] = None  # None if still in progress
    answer_count: int    # how many questions the candidate has answered


# ── Detailed answer view ──────────────────────────────────────────────────────

class AnswerDetail(BaseModel):
    """
    Full analysis data for one recorded answer.
    Shown in the CandidateDetail and CandidateResults pages.

    Fields populated by different backend services:
      - transcript          ← whisper_service.py  (speech-to-text)
      - emotion_distribution← emotion_service.py  (DeepFace face analysis)
      - nervousness_score   ← scoring_service.py  (derived from emotion data)
      - llm_evaluation      ← llm_service.py      (GPT evaluation dict)
      - answer_final_score  ← scoring_service.py  (weighted composite score)
    """
    question_id: str
    question_text: str
    transcript: Optional[str]              # what the candidate said, word-for-word
    emotion_distribution: Dict[str, float] # e.g. {"happy": 0.4, "neutral": 0.5, "sad": 0.1}
    confidence_index: float                # 0–10 score derived from facial expressions
    nervousness_score: float               # 0–10 score (high nervous emotions → high score)
    hesitation_score: float                # 0–10 score based on pauses detected in speech
    llm_evaluation: Optional[Dict[str, Any]]  # full GPT evaluation object (see llm_service.py)
    answer_final_score: float              # composite score 0–10 for this single answer


class SessionDetail(BaseModel):
    """
    Full session data returned to the admin's CandidateDetail page.
    Contains candidate info + a list of every AnswerDetail.
    """
    session_id: str
    candidate_name: str
    candidate_email: str
    answers: List[AnswerDetail]  # one AnswerDetail per recorded answer
    final_score: float           # average across all answer_final_scores
    category: str                # hiring recommendation verdict
    status: str


class CandidateAnswerFeedback(BaseModel):
    """
    Feedback data returned to the CANDIDATE for one answer.
    Excludes all numeric scores — only shows qualitative AI feedback.
    """
    question_id: str
    question_text: str
    transcript: Optional[str]
    llm_evaluation: Optional[Dict[str, Any]]


class CandidateResultResponse(BaseModel):
    """
    Session result returned to the CANDIDATE (no scores exposed).
    Only includes feedback: strengths, weaknesses, reasoning, and verdict.
    """
    session_id: str
    candidate_name: str
    candidate_email: str
    answers: List[CandidateAnswerFeedback]
    category: str
    status: str
