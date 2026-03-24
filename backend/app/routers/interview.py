"""
routers/interview.py – Candidate-facing interview session management endpoints.

URL prefix: /interview

Endpoints:
  GET  /interview/questions                      – All questions in the global bank
  GET  /interview/session/{id}/questions         – Questions for a specific session (tailored or fallback)
  POST /interview/session/start                  – Create a new blank session
  GET  /interview/session/{id}                   – Get session details (candidate or admin)
  POST /interview/session/{id}/complete          – Mark session done and trigger AI processing
  GET  /interview/my-sessions                    – All sessions for the current candidate
"""

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId                # MongoDB's document ID type

from app.database import get_database
from app.models.interview import InterviewSession
from app.schemas.interview import StartSessionResponse
from app.utils.auth import get_current_user   # dependency: verifies JWT and returns user payload
from app.utils.helpers import mongo_doc_to_dict  # converts MongoDB _id → string id

router = APIRouter(prefix="/interview", tags=["Interview"])


@router.get("/questions")
async def get_questions(db: AsyncIOMotorDatabase = Depends(get_database)):
    """Return all questions in the global question bank (no auth required)."""
    cursor = db["questions"].find({})   # {} = no filter → return all documents
    questions = []
    # `async for` iterates the MongoDB cursor one document at a time
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)    # convert _id → id for JSON serialization
        questions.append(doc)
    return {"questions": questions}


@router.get("/session/{session_id}/questions")
async def get_session_questions(
    session_id: str,
    current_user: dict = Depends(get_current_user),  # must be logged in to start an interview
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return questions for a specific session.

    Priority:
      1. session_questions collection (tailored questions generated from the resume upload)
      2. global questions collection (fallback if no tailored questions exist)

    The tailored questions are sorted by their 'order' field (1, 2, 3…) so they
    appear in the same order the LLM generated them.
    """
    # First look for tailored questions linked to this specific session
    # .limit(5) → only return the first 5 questions (sorted by order)
    cursor = db["session_questions"].find({"session_id": session_id}).sort("order", 1).limit(5)
    questions = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)
        questions.append(doc)

    # If no tailored questions were found, fall back to the global question bank
    if not questions:
        cursor = db["questions"].find({}).limit(5)  # cap at 5 for speed
        async for doc in cursor:
            doc = mongo_doc_to_dict(doc)
            questions.append(doc)

    return {"questions": questions}


@router.post("/session/start", response_model=StartSessionResponse, status_code=201)
async def start_session(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Create a new blank interview session for the logged-in candidate.
    Called when a candidate starts an interview WITHOUT uploading a resume.
    (The resume upload route /resume/upload creates its own session automatically.)
    """
    # Fetch the user's full name and email from the database using their ID from the JWT
    user_doc = await db["users"].find_one({"_id": ObjectId(current_user["sub"])})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Build the InterviewSession model with default values
    session = InterviewSession(
        candidate_id=current_user["sub"],
        candidate_name=user_doc["full_name"],
        candidate_email=user_doc["email"],
    )

    # Insert into the "sessions" collection; exclude id since MongoDB generates _id
    result = await db["sessions"].insert_one(session.model_dump(exclude={"id"}))
    session_id = str(result.inserted_id)
    return StartSessionResponse(session_id=session_id, message="Session started")


@router.get("/session/{session_id}")
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return full session details including all answers and AI scores.

    Authorization rules:
      - Candidates can only view sessions they own (candidate_id must match their user ID)
      - Admins can view any session
    """
    # Find the session by its MongoDB _id (must convert string → ObjectId for MongoDB query)
    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Enforce ownership: a candidate can't see another candidate's session
    if current_user["role"] == "candidate" and doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    doc = mongo_doc_to_dict(doc)  # convert _id → id
    return doc


@router.post("/session/{session_id}/complete")
async def complete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Mark a session as fully completed and trigger the final AI scoring.

    Called by the frontend after ALL video answers have been uploaded.
    This kicks off finalize_session() in the background (non-blocking),
    which:
      - waits for each answer to finish WhisperX + DeepFace processing
      - calls scoring_service to compute the final_score and category
      - updates the session status from 'processing' → 'completed'
    """
    # Lazy import to avoid circular dependency at module load time
    from app.services.video_processor import finalize_session

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Both the session owner AND admins can complete a session
    if doc["candidate_id"] != current_user["sub"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    # asyncio.create_task → runs finalize_session in the event loop background
    # The HTTP response is returned IMMEDIATELY while finalize_session runs in the background.
    import asyncio
    asyncio.create_task(finalize_session(session_id, db))

    return {"message": "Session marked as complete. Final scoring in progress."}


@router.get("/my-sessions")
async def my_sessions(
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return all interview sessions belonging to the currently logged-in candidate.
    Used by the CandidateDashboard to show the 'Past Sessions' list.
    """
    # Filter sessions by candidate_id from the JWT ("sub" field = user ID)
    cursor = db["sessions"].find({"candidate_id": current_user["sub"]})
    sessions = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)
        sessions.append(doc)
    return {"sessions": sessions}
