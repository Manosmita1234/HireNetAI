"""
schemas/evaluation.py – Request/Response schemas for the holistic evaluation engine.
"""

from typing import List, Literal
from pydantic import BaseModel, Field


class QuestionAnswerInput(BaseModel):
    question_id: int
    question_text: str
    answer_text: str
    emotion_summary: str = ""


class EvaluationRequest(BaseModel):
    candidate_name: str
    role_applied: str
    questions: List[QuestionAnswerInput] = Field(
        ..., min_length=1, max_length=20,
        description="All question-answer pairs from the completed interview session."
    )


class HolisticEvaluationResult(BaseModel):
    overall_score: int = Field(..., ge=0, le=100)
    technical_score: int = Field(..., ge=0, le=100)
    communication_score: int = Field(..., ge=0, le=100)
    consistency_score: int = Field(..., ge=0, le=100)
    decision: Literal["Selected", "Borderline", "Rejected"]
    strengths: List[str]
    weaknesses: List[str]
    final_summary: str
