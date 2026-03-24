"""
routers/admin.py – Admin-only endpoints for managing candidates and generating reports.

URL prefix: /admin
Access:     ALL routes require require_admin dependency (admin JWT only)

Endpoints:
  GET    /admin/candidates                           – Summary list of all sessions
  GET    /admin/session/{id}                         – Full detail for one session
  GET    /admin/session/{id}/video/{question_id}     – Stream the recorded video
  GET    /admin/session/{id}/report                  – Download PDF evaluation report
  DELETE /admin/session/{id}                         – Delete a session permanently
  POST   /admin/seed-questions                       – Populate default question bank

All routes use Depends(require_admin), which:
  1. Reads the Authorization: Bearer <token> header
  2. Decodes and verifies the JWT
  3. Checks that the user's role is "admin"
  4. Returns HTTP 403 Forbidden if any check fails
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse  # for binary (PDF, video) responses
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.database import get_database
from app.utils.auth import require_admin       # enforces admin-only access
from app.utils.helpers import mongo_doc_to_dict
from app.models.interview import InterviewSession, Answer, LLMEvaluation

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/candidates")
async def list_candidates(
    admin: dict = Depends(require_admin),  # ensures only admins can call this
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return a summary list of every candidate session.
    Used to populate the table on the AdminDashboard page.

    Note: We manually build the summary dict rather than returning the full session document
    to keep the response size small (sessions can have large 'answers' arrays with embedded videos).
    """
    cursor = db["sessions"].find({})  # return all sessions, no filter
    results = []
    async for doc in cursor:
        doc = mongo_doc_to_dict(doc)  # convert _id → id
        results.append({
            "session_id":      doc["id"],
            "candidate_id":    doc.get("candidate_id"),
            "candidate_name":  doc.get("candidate_name"),
            "candidate_email": doc.get("candidate_email"),
            "status":          doc.get("status"),
            "final_score":     doc.get("final_score", 0),
            "category":        doc.get("category", "Not Recommended"),
            "started_at":      str(doc.get("started_at", "")),
            "answer_count":    len(doc.get("answers", [])),  # count answers without returning them
        })
    return {"candidates": results}


@router.get("/session/{session_id}")
async def get_session_detail(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Return the FULL session document including all answer details, AI scores,
    emotion data, transcripts, and LLM evaluations.
    Used by the CandidateDetail page in the admin panel.
    """
    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = mongo_doc_to_dict(doc)  # convert ObjectId → string
    return doc


@router.get("/session/{session_id}/video/{question_id}")
async def stream_video(
    session_id: str,
    question_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Stream a recorded video answer to the admin's browser.

    How it works:
      - Finds the answer document inside the session using MongoDB's positional operator
      - Reads the video file path from the answer (stored at upload time)
      - Uses StreamingResponse with a generator to send the file in 64 KB chunks
        (more memory-efficient than reading the entire file at once)

    The <video> element in CandidateDetail.jsx uses this URL as its src.
    """
    # Find only the matching answer sub-document (not the whole session)
    # "answers.$": 1 projection returns only the first answer matching the filter
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

    # Generator function: yields 64 KB chunks of the video file one at a time
    # This avoids loading the entire video into memory before sending
    def iter_file():
        with open(p, "rb") as f:
            while chunk := f.read(64 * 1024):  # walrus operator (:=) reads AND checks for EOF
                yield chunk

    return StreamingResponse(iter_file(), media_type="video/webm")


@router.get("/session/{session_id}/report")
async def download_report(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Generate and return a PDF evaluation report for the given session.

    Steps:
      1. Fetch the raw session document from MongoDB
      2. Re-construct typed Python objects (InterviewSession, Answer, LLMEvaluation)
         from the raw dict so report_service.py gets structured data
      3. Call generate_pdf_report() which uses reportlab to build the PDF bytes
      4. Return the bytes as a downloadable file via Response with Content-Disposition header
    """
    # Lazy import to keep startup fast (reportlab is a heavy dependency)
    from app.services.report_service import generate_pdf_report

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    doc = mongo_doc_to_dict(doc)

    # ── Re-build typed model objects from the raw dict ─────────────────────────
    # MongoDB returns everything as plain dicts; we re-construct Pydantic models
    # so report_service.py can use dot-notation (e.g. session.candidate_name)
    answers = []
    for a in doc.get("answers", []):
        llm_raw = a.get("llm_evaluation")
        # LLMEvaluation model validates and structures the GPT output dict
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

    # Generate the PDF as raw bytes
    pdf_bytes = generate_pdf_report(session)
    filename = f"report_{session_id[:12]}.pdf"  # use first 12 chars of ID for the filename

    # Return the bytes as a binary response with download prompt
    # Content-Disposition: attachment causes the browser to download instead of display
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
    """Permanently delete a session and all its embedded answer data."""
    result = await db["sessions"].delete_one({"_id": ObjectId(session_id)})
    # deleted_count = 0 means no document matched the given _id
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}


@router.post("/seed-questions")
async def seed_questions(
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Populate the question bank with a default set of general interview questions.

    Idempotent: if questions already exist, this returns early without adding duplicates.
    Call once during initial platform setup from the AdminDashboard sidebar.
    After seeding, admins can add custom questions via POST /admin/questions.
    """
    # Check if any questions already exist to avoid duplicates
    existing = await db["questions"].count_documents({})
    if existing > 0:
        return {"message": f"Already have {existing} questions. Skipping seed."}

    # Default question set: covers general behavioural, situational, and motivational categories
    default_questions = [
        {"text": "Tell me about yourself and your professional background.",          "category": "general",      "difficulty": "easy"},
        {"text": "What is your greatest professional achievement and why?",            "category": "behavioural",  "difficulty": "medium"},
        {"text": "Describe a challenging situation you faced at work. How did you handle it?", "category": "behavioural", "difficulty": "medium"},
        {"text": "Where do you see yourself in 5 years?",                             "category": "general",      "difficulty": "easy"},
        {"text": "Why do you want to work for our company?",                          "category": "motivational", "difficulty": "medium"},
        {"text": "Describe a time when you had to work with a difficult team member.", "category": "behavioural",  "difficulty": "hard"},
        {"text": "What are your greatest strengths and weaknesses?",                  "category": "general",      "difficulty": "easy"},
        {"text": "Tell me about a time you demonstrated leadership.",                  "category": "behavioural",  "difficulty": "hard"},
        {"text": "How do you prioritize tasks when you have multiple deadlines?",      "category": "situational",  "difficulty": "medium"},
        {"text": "What motivates you to perform your best at work?",                  "category": "motivational", "difficulty": "easy"},
    ]

    # insert_many() is more efficient than calling insert_one() ten times
    await db["questions"].insert_many(default_questions)
    return {"message": f"Seeded {len(default_questions)} questions successfully."}


@router.get("/session/{session_id}/transcript-json")
async def download_transcript_json(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Download the transcript.json file that was written to disk after the interview.

    The file is stored at: uploads/<session_id>/transcript.json
    It contains all WhisperX transcripts, emotion data, and LLM scores for the session.

    Returns the raw JSON as a downloadable file attachment.
    If the JSON hasn't been generated yet (session still processing), returns 404.
    """
    from pathlib import Path
    from app.config import get_settings
    settings = get_settings()

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check if the transcript JSON path was stored in MongoDB
    json_path_str = doc.get("transcript_json_path")
    if not json_path_str:
        # Try the standard expected path even if not stored in DB
        json_path_str = str(settings.upload_path / session_id / "transcript.json")

    json_path = Path(json_path_str)
    if not json_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Transcript JSON not yet generated. The session may still be processing."
        )

    # Read and return the JSON file as a downloadable attachment
    with open(json_path, "r", encoding="utf-8") as f:
        content = f.read()

    filename = f"transcript_{session_id[:12]}.json"
    return Response(
        content=content.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/session/{session_id}/rescore")
async def rescore_session(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Re-run the AI role-fit scoring from the existing transcript.json file.

    Useful when:
      - OpenAI was unavailable at interview completion time
      - You want to re-evaluate with updated scoring logic
      - The role_fit_result was missing for any reason

    This is fast (< 5 seconds) because WhisperX and DeepFace don't re-run —
    it only sends the pre-built transcript.json to GPT.
    """
    from pathlib import Path
    from datetime import datetime, timezone
    from app.config import get_settings
    from app.services.json_scoring_service import export_session_json, score_from_json

    settings = get_settings()

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Determine the JSON file path: use stored path or derive from session_id
    json_path_str = doc.get("transcript_json_path")
    json_path = Path(json_path_str) if json_path_str else None

    # If the JSON file doesn't exist yet, re-export it from the DB data
    if json_path is None or not json_path.exists():
        print(f"[Rescore] transcript.json missing — re-exporting for session {session_id}")
        json_path = export_session_json(
            session_id=session_id,
            session_doc=doc,
            upload_dir=settings.upload_path,
        )
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"transcript_json_path": str(json_path)}},
        )

    # Run role-fit scoring from the JSON file
    role_fit = await score_from_json(json_path)

    # Persist the new result
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "role_fit_result":    role_fit,
                "role_fit_scored_at": datetime.now(timezone.utc),
            }
        },
    )

    return {
        "message":      "Role-fit re-scoring complete",
        "session_id":   session_id,
        "role_fit":     role_fit,
    }


@router.post("/session/{session_id}/reaggregate")
async def reaggregate_session(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Recompute per-answer scores and the session aggregate for a session
    whose answers all have answer_final_score=0.0 (race condition artifact).

    Steps:
      1. For each answer that has LLM evaluation data but score=0.0,
         recompute the weighted score using scoring_service and write it back.
      2. Recompute final_score + category across all corrected answer scores.
      3. Return the updated session summary.

    This fixes sessions that were finalized too early (before WhisperX/LLM finished).
    """
    from app.services import scoring_service
    from app.models.interview import LLMEvaluation, Answer

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    raw_answers = doc.get("answers", [])
    answers = []
    recomputed_count = 0

    for a in raw_answers:
        llm_data = a.get("llm_evaluation")
        llm_eval = LLMEvaluation(**llm_data) if llm_data else None
        stored_score = a.get("answer_final_score", 0.0)

        ans = Answer(
            question_id=a.get("question_id", ""),
            question_text=a.get("question_text", ""),
            confidence_index=a.get("confidence_index", 0.0),
            hesitation_score=a.get("hesitation_score", 0.0),
            llm_evaluation=llm_eval,
            answer_final_score=stored_score,
        )

        # Recompute score if it's 0 but LLM data exists
        if stored_score == 0.0 and llm_eval is not None:
            new_score = scoring_service.score_single_answer(ans)
            ans.answer_final_score = new_score
            recomputed_count += 1
            await db["sessions"].update_one(
                {"_id": ObjectId(session_id), "answers.question_id": a.get("question_id")},
                {"$set": {"answers.$.answer_final_score": new_score}},
            )

        answers.append(ans)

    # Recompute the session aggregate
    agg = scoring_service.aggregate_session_score(answers)
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {
            "final_score": agg["final_score"],
            "category":    agg["category"],
        }},
    )

    return {
        "message":           f"Re-aggregated: {recomputed_count} answer(s) rescored",
        "session_id":        session_id,
        "final_score":       agg["final_score"],
        "category":          agg["category"],
        "answers_rescored":  recomputed_count,
    }
