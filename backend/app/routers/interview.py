"""
routers/interview.py – Candidate-facing interview session management.
"""

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.database import get_database
from app.models.interview import InterviewSession, Answer
from app.schemas.interview import StartSessionResponse, SessionDetail, AnswerDetail
from app.utils.auth import get_current_user
from app.utils.helpers import mongo_doc_to_dict

router = APIRouter(prefix="/interview", tags=["Interview"])


@router.get("/questions")
async def get_questions(db: AsyncIOMotorDatabase = Depends(get_database)):
    """Return all questions from the question bank."""
    cursor = db["questions"].find({})
    questions = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)
        questions.append(doc)
    return {"questions": questions}


@router.post("/session/start", response_model=StartSessionResponse, status_code=201)
async def start_session(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Create a new interview session for the authenticated candidate."""
    user_doc = await db["users"].find_one({"_id": ObjectId(current_user["sub"])})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    session = InterviewSession(
        candidate_id=current_user["sub"],
        candidate_name=user_doc["full_name"],
        candidate_email=user_doc["email"],
    )
    result = await db["sessions"].insert_one(session.model_dump(exclude={"id"}))
    session_id = str(result.inserted_id)
    return StartSessionResponse(session_id=session_id, message="Session started")


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Return session details for the current user (or admin)."""
    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Candidates can only view their own sessions
    if current_user["role"] == "candidate" and doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    doc = mongo_doc_to_dict(doc)
    return doc


@router.post("/session/{session_id}/complete")
async def complete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Mark a session as complete and trigger final scoring.
    Called by the candidate after all answers are submitted.
    """
    from app.services.video_processor import finalize_session

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    if doc["candidate_id"] != current_user["sub"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    # Finalize the session asynchronously (non-blocking)
    import asyncio
    asyncio.create_task(finalize_session(session_id, db))

    return {"message": "Session marked as complete. Final scoring in progress."}


@router.get("/my-sessions")
async def my_sessions(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Return all sessions belonging to the current candidate."""
    cursor = db["sessions"].find({"candidate_id": current_user["sub"]})
    sessions = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)
        sessions.append(doc)
    return {"sessions": sessions}
