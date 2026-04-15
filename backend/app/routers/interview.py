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

    For resume-uploaded sessions, returns all available tailored questions (up to 10).
    For sessions without resume, returns up to 5 general questions from the global bank.
    """
    # First look for tailored questions linked to this specific session
    # Return all available tailored questions (up to 10), sorted by order
    cursor = db["session_questions"].find({"session_id": session_id}).sort("order", 1).limit(10)
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

    return {"questions": questions, "is_personalized": len(questions) > 0 and questions[0].get("category") == "tailored"}


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

    Authorization: ADMIN ONLY. Candidates must use GET /candidate/result/{session_id}
    which returns the same data but with all scores excluded.

    This endpoint exposes per-answer composite scores (answer_final_score) and
    LLM evaluation scores, so it is restricted to admin users only.
    """
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Use GET /candidate/result/{id} to view your results (scores hidden). Admin access required for full scores."
        )

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    doc = mongo_doc_to_dict(doc)
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


@router.post("/session/{session_id}/integrity-event")
async def record_integrity_event(
    session_id: str,
    event_data: dict,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Record an integrity event during an interview (tab switch, face absent, no voice, etc.).
    
    Event types:
      - tab_switch: candidate switched browser tabs
      - face_absent: no face detected in video for > threshold seconds
      - no_voice: prolonged silence (no speech detected)
      - multiple_faces: more than one face detected
    """
    from datetime import datetime, timezone
    from bson import ObjectId

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify the user owns this session
    if doc["candidate_id"] != current_user["sub"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    event = {
        "event_type": event_data.get("event_type"),
        "question_id": event_data.get("question_id"),
        "timestamp": datetime.now(timezone.utc),
        "duration_seconds": event_data.get("duration_seconds"),
        "details": event_data.get("details"),
    }

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {"$push": {"integrity_events": event}},
    )

    return {"message": "Event recorded"}


@router.post("/session/{session_id}/integrity-events")
async def batch_record_integrity_events(
    session_id: str,
    events_data: list,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Record multiple integrity events at once (e.g., at end of interview).
    """
    from datetime import datetime, timezone
    from bson import ObjectId

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    if doc["candidate_id"] != current_user["sub"] and current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    events = [
        {
            "event_type": e.get("event_type"),
            "question_id": e.get("question_id"),
            "timestamp": datetime.now(timezone.utc),
            "duration_seconds": e.get("duration_seconds"),
            "details": e.get("details"),
        }
        for e in events_data
    ]

    if events:
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {"$push": {"integrity_events": {"$each": events}}},
        )

    return {"message": f"Recorded {len(events)} events"}


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
