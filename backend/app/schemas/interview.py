"""
schemas/interview.py – Request/Response schemas for interview endpoints.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class StartSessionResponse(BaseModel):
    session_id: str
    message: str


class UploadAnswerResponse(BaseModel):
    session_id: str
    question_id: str
    message: str
    processing_started: bool = False


class SessionSummary(BaseModel):
    session_id: str
    candidate_name: str
    candidate_email: str
    status: str
    final_score: float
    category: str
    started_at: str
    completed_at: Optional[str] = None
    answer_count: int


class AnswerDetail(BaseModel):
    question_id: str
    question_text: str
    transcript: Optional[str]
    emotion_distribution: Dict[str, float]
    confidence_index: float
    nervousness_score: float
    hesitation_score: float
    llm_evaluation: Optional[Dict[str, Any]]
    answer_final_score: float


class SessionDetail(BaseModel):
    session_id: str
    candidate_name: str
    candidate_email: str
    answers: List[AnswerDetail]
    final_score: float
    category: str
    status: str
