"""
routers/upload.py – Video answer upload endpoint.

Flow:
  1. Receive multipart video file
  2. Save to uploads/<session_id>/<question_id>.webm
  3. Insert Answer stub into MongoDB
  4. Fire-and-forget: run full processing pipeline in background
"""

import asyncio
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.config import get_settings
from app.database import get_database
from app.models.interview import Answer
from app.schemas.interview import UploadAnswerResponse
from app.utils.auth import get_current_user
from app.services.video_processor import process_video

settings = get_settings()
router = APIRouter(prefix="/upload", tags=["Upload"])


@router.post("/answer", response_model=UploadAnswerResponse, status_code=202)
async def upload_answer(
    background_tasks: BackgroundTasks,
    session_id: str = Form(...),
    question_id: str = Form(...),
    question_text: str = Form(...),
    video: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Accept a video answer upload, persist the file, and queue processing.
    Returns immediately (202 Accepted) while processing continues in background.
    """
    # ── Validate session exists ───────────────────────────────────────────────
    session_doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not session_doc:
        raise HTTPException(status_code=404, detail="Session not found")

    if session_doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # ── Save video file ───────────────────────────────────────────────────────
    session_upload_dir = settings.upload_path / session_id
    session_upload_dir.mkdir(parents=True, exist_ok=True)
    safe_qid = "".join(c for c in question_id if c.isalnum() or c in "-_")
    video_filename = f"{safe_qid}.webm"
    video_path = session_upload_dir / video_filename

    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    print(f"[Upload] Saved {video_path} ({video_path.stat().st_size} bytes)")

    # ── Create Answer stub in session document ────────────────────────────────
    answer = Answer(
        question_id=question_id,
        question_text=question_text,
        video_path=str(video_path),
        processed=False,
    )
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$push": {"answers": answer.model_dump()},
            "$set": {"status": "processing"},
        },
    )

    # ── Kick off background processing ───────────────────────────────────────
    background_tasks.add_task(
        process_video,
        session_id=session_id,
        question_id=question_id,
        video_path=str(video_path),
        question_text=question_text,
        db=db,
    )

    return UploadAnswerResponse(
        session_id=session_id,
        question_id=question_id,
        message="Video uploaded. Processing started in background.",
        processing_started=True,
    )


@router.get("/status/{session_id}/{question_id}")
async def processing_status(
    session_id: str,
    question_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """Poll the processing status of a specific answer."""
    doc = await db["sessions"].find_one(
        {"_id": ObjectId(session_id), "answers.question_id": question_id},
        {"answers.$": 1},
    )
    if not doc or not doc.get("answers"):
        raise HTTPException(status_code=404, detail="Answer not found")

    answer = doc["answers"][0]
    return {"processed": answer.get("processed", False), "question_id": question_id}
