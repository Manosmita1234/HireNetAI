"""
routers/admin.py – Admin-only endpoints for viewing candidates and reports.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.database import get_database
from app.utils.auth import require_admin
from app.utils.helpers import mongo_doc_to_dict
from app.models.interview import InterviewSession, Answer, LLMEvaluation

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/candidates")
async def list_candidates(
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return a summary list of all candidates who have at least one session.
    """
    cursor = db["sessions"].find({})
    results = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)
        results.append({
            "session_id": doc["id"],
            "candidate_id": doc.get("candidate_id"),
            "candidate_name": doc.get("candidate_name"),
            "candidate_email": doc.get("candidate_email"),
            "status": doc.get("status"),
            "final_score": doc.get("final_score", 0),
            "category": doc.get("category", "Not Recommended"),
            "started_at": str(doc.get("started_at", "")),
            "answer_count": len(doc.get("answers", [])),
        })
    return {"candidates": results}


@router.get("/session/{session_id}")
async def get_session_detail(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Return full session detail including all answer analysis data."""
    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = mongo_doc_to_dict(doc)
    return doc


@router.get("/session/{session_id}/video/{question_id}")
async def stream_video(
    session_id: str,
    question_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Stream the recorded video for a specific answer."""
    doc = await db["sessions"].find_one(
        {"_id": ObjectId(session_id), "answers.question_id": question_id},
        {"answers.$": 1},
    )
    if not doc or not doc.get("answers"):
        raise HTTPException(status_code=404, detail="Answer not found")

    answer = doc["answers"][0]
    video_path = answer.get("video_path")
    if not video_path:
        raise HTTPException(status_code=404, detail="Video not available")

    from pathlib import Path
    p = Path(video_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    def iter_file():
        with open(p, "rb") as f:
            while chunk := f.read(64 * 1024):
                yield chunk

    return StreamingResponse(iter_file(), media_type="video/webm")


@router.get("/session/{session_id}/report")
async def download_report(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Generate and download a PDF report for the given session."""
    from app.services.report_service import generate_pdf_report

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    doc = mongo_doc_to_dict(doc)

    # Reconstruct session model
    answers = []
    for a in doc.get("answers", []):
        llm_raw = a.get("llm_evaluation")
        llm_eval = LLMEvaluation(**llm_raw) if llm_raw else None
        ans = Answer(
            question_id=a.get("question_id", ""),
            question_text=a.get("question_text", ""),
            transcript=a.get("transcript"),
            emotion_distribution=a.get("emotion_distribution", {}),
            confidence_index=a.get("confidence_index", 0.0),
            nervousness_score=a.get("nervousness_score", 0.0),
            pause_count=a.get("pause_count", 0),
            long_pauses=a.get("long_pauses", []),
            hesitation_score=a.get("hesitation_score", 0.0),
            llm_evaluation=llm_eval,
            answer_final_score=a.get("answer_final_score", 0.0),
        )
        answers.append(ans)

    session = InterviewSession(
        id=doc["id"],
        candidate_id=doc.get("candidate_id", ""),
        candidate_name=doc.get("candidate_name", "Unknown"),
        candidate_email=doc.get("candidate_email", ""),
        answers=answers,
        final_score=doc.get("final_score", 0.0),
        category=doc.get("category", "Not Recommended"),
        status=doc.get("status", "completed"),
    )

    pdf_bytes = generate_pdf_report(session)
    filename = f"report_{session_id[:12]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Delete a session and all its data (admin only)."""
    result = await db["sessions"].delete_one({"_id": ObjectId(session_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@router.post("/seed-questions")
async def seed_questions(
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Seed the question bank with default interview questions.
    Safe to run multiple times (checks for existing data).
    """
    existing = await db["questions"].count_documents({})
    if existing > 0:
        return {"message": f"Already have {existing} questions. Skipping seed."}

    default_questions = [
        {"text": "Tell me about yourself and your professional background.", "category": "general", "difficulty": "easy"},
        {"text": "What is your greatest professional achievement and why?", "category": "behavioural", "difficulty": "medium"},
        {"text": "Describe a challenging situation you faced at work. How did you handle it?", "category": "behavioural", "difficulty": "medium"},
        {"text": "Where do you see yourself in 5 years?", "category": "general", "difficulty": "easy"},
        {"text": "Why do you want to work for our company?", "category": "motivational", "difficulty": "medium"},
        {"text": "Describe a time when you had to work with a difficult team member.", "category": "behavioural", "difficulty": "hard"},
        {"text": "What are your greatest strengths and weaknesses?", "category": "general", "difficulty": "easy"},
        {"text": "Tell me about a time you demonstrated leadership.", "category": "behavioural", "difficulty": "hard"},
        {"text": "How do you prioritize tasks when you have multiple deadlines?", "category": "situational", "difficulty": "medium"},
        {"text": "What motivates you to perform your best at work?", "category": "motivational", "difficulty": "easy"},
    ]

    await db["questions"].insert_many(default_questions)
    return {"message": f"Seeded {len(default_questions)} questions successfully."}
