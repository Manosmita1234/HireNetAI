"""
routers/candidate.py – Candidate-specific endpoints (score-hidden from candidates).

URL prefix: /candidate
Access:     ALL routes require candidate JWT (role = "candidate")

Endpoints:
  GET  /candidate/result/{session_id}  – Returns session result with NO scores (feedback only)
  POST /candidate/submit-interview       – Submits interview answers and triggers evaluation
"""

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.database import get_database
from app.schemas.interview import CandidateResultResponse, CandidateAnswerFeedback
from app.utils.auth import get_current_user, require_candidate

router = APIRouter(prefix="/candidate", tags=["Candidate"])


@router.get("/result/{session_id}", response_model=CandidateResultResponse)
async def get_candidate_result(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return the interview result to the CANDIDATE.
    
    CRITICAL SECURITY: This endpoint EXCLUDES all numeric scores.
    Candidates see ONLY:
      - Their answers (transcripts)
      - AI qualitative feedback (strengths, weaknesses, reasoning, verdict)
      - The overall category/verdict (e.g. "Recommended")
    
    Candidates do NOT see:
      - final_score (0-100)
      - answer_final_score (per-answer composite score)
      - clarity_score, logic_score, relevance_score, confidence_score
      - nervousness_score, hesitation_score
    
    Authorization: Only the candidate who owns the session can view their own results.
    Admins use /admin/session/{id} which includes all scores.
    """
    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    if current_user["role"] == "candidate" and doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    answers = []
    for a in doc.get("answers", []):
        llm_eval = a.get("llm_evaluation")
        answers.append(CandidateAnswerFeedback(
            question_id=a.get("question_id", ""),
            question_text=a.get("question_text", ""),
            transcript=a.get("transcript"),
            llm_evaluation=llm_eval,
        ))

    return CandidateResultResponse(
        session_id=str(doc["_id"]),
        candidate_name=doc.get("candidate_name", ""),
        candidate_email=doc.get("candidate_email", ""),
        answers=answers,
        category=doc.get("category", "Not Recommended"),
        status=doc.get("status", "pending"),
    )


@router.post("/submit-interview/{session_id}")
async def submit_interview(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Submit the interview and trigger AI evaluation.
    
    This endpoint:
      1. Marks the session as complete
      2. Triggers background AI processing (WhisperX, DeepFace, LLM)
      3. Returns immediately - processing happens asynchronously
    
    Use GET /candidate/result/{session_id} to poll for results.
    """
    from app.services.video_processor import finalize_session

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    if current_user["role"] == "candidate" and doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    import asyncio
    asyncio.create_task(finalize_session(session_id, db))

    return {"message": "Interview submitted. AI evaluation in progress.", "session_id": session_id}
