"""
routers/upload.py – Video answer upload endpoint.

URL prefix: /upload

This is where the actual video files from the InterviewRoom page land.

Full processing pipeline (triggered after each upload):
  1. Receive multipart/form-data POST with: session_id, question_id, question_text, video
  2. Validate the session exists and belongs to the current user
  3. Save the .webm video file to:
       uploads/<session_id>/<question_id>.webm
  4. Insert an Answer "stub" into the session's answers array in MongoDB
     (marked processed=False until AI is done)
  5. Register process_video() as a BackgroundTask so it runs AFTER the response is sent
  6. Return 202 Accepted immediately (so the frontend doesn't have to wait for AI)

Background processing (process_video in video_processor.py):
  - WhisperX: transcribes the video audio to text
  - DeepFace: analyzes facial expressions frame-by-frame → emotion_distribution
  - LLM (GPT): evaluates the transcript → clarity, logic, relevance, personality scores
  - scoring_service: combines all scores into answer_final_score
  - Updates the answer in MongoDB with all results, sets processed=True
"""

import os
import shutil   # used for copying file content (shutil.copyfileobj is efficient for large files)
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.config import get_settings
from app.database import get_database
from app.models.interview import Answer                # Pydantic model for a single answer stub
from app.schemas.interview import UploadAnswerResponse
from app.utils.auth import get_current_user
from app.services.video_processor import process_video

settings = get_settings()
router = APIRouter(prefix="/upload", tags=["Upload"])


def fix_webm_file(video_path: str) -> bool:
    """
    Fix WebM files recorded by MediaRecorder that lack proper metadata (duration, etc.).
    MediaRecorder often creates WebM files that aren't properly finalized, causing
    video players to fail while audio still works.
    
    Uses ffmpeg to re-mux the file with proper WebM headers.
    Returns True if fix was successful, False otherwise.
    """
    try:
        input_path = Path(video_path)
        if not input_path.exists():
            return False
        
        # Create temp file in same directory
        temp_fd, temp_path = tempfile.mkstemp(suffix='.webm', dir=input_path.parent)
        Path(temp_path).unlink()  # Remove the temp file, ffmpeg will create it
        os.close(temp_fd)
        
        # Re-mux the WebM file with proper headers
        cmd = [
            'ffmpeg', '-y',
            '-i', str(input_path),
            '-c', 'copy',
            '-f', 'webm',
            temp_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0 and Path(temp_path).exists():
            # Replace original with fixed version
            shutil.move(temp_path, input_path)
            print(f"[Upload] Fixed WebM file: {video_path}")
            return True
        else:
            print(f"[Upload] Failed to fix WebM: {result.stderr}")
            if Path(temp_path).exists():
                Path(temp_path).unlink()
            return False
            
    except Exception as e:
        print(f"[Upload] Error fixing WebM: {e}")
        return False


@router.post("/answer", response_model=UploadAnswerResponse, status_code=202)
async def upload_answer(
    background_tasks: BackgroundTasks,              # FastAPI injects this to register background work
    session_id: str = Form(...),                    # Form(...) means this field is required in the form data
    question_id: str = Form(...),
    question_text: str = Form(...),
    video: UploadFile = File(...),                  # the .webm video file streamed from the browser
    current_user: dict = Depends(get_current_user), # JWT must be valid
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    """
    Accept a video answer upload, persist the file, and queue AI processing.

    Returns 202 Accepted immediately — processing continues in the background.
    The frontend polls /upload/status/:session_id/:question_id to check completion.
    """
    # ── Validate session exists ────────────────────────────────────────────────
    # Converts the string session_id back to MongoDB's ObjectId type for the query
    session_doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not session_doc:
        raise HTTPException(status_code=404, detail="Session not found")

    # Security check: ensure the uploader is the session owner
    # (prevents one candidate from submitting answers to another's session)
    if session_doc["candidate_id"] != current_user["sub"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # ── Save video file to disk ────────────────────────────────────────────────
    # Build a directory path: uploads/<session_id>/
    session_upload_dir = settings.upload_path / session_id
    session_upload_dir.mkdir(parents=True, exist_ok=True)  # create dirs if they don't exist

    # Sanitize the question_id to only contain safe filename characters
    # This prevents path traversal attacks (e.g. question_id = "../../etc/passwd")
    safe_qid = "".join(c for c in question_id if c.isalnum() or c in "-_")
    video_filename = f"{safe_qid}.webm"
    video_path = session_upload_dir / video_filename

    # Write the uploaded file to disk
    # shutil.copyfileobj copies from the upload file object to our local file in chunks
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    print(f"[Upload] Saved {video_path} ({video_path.stat().st_size} bytes)")

    # Fix WebM file to ensure it's properly finalized (MediaRecorder often creates files without proper headers)
    fix_webm_file(str(video_path))

    # Store absolute path using upload_dir as base (more reliable than CWD-based resolve)
    video_path_abs = (settings.upload_path / session_id / video_filename).resolve()

    # ── Insert Answer stub into the session document ───────────────────────────
    # The stub marks the answer as received but not yet processed (processed=False)
    # MongoDB's $push operator appends to the "answers" array in the session document
    answer = Answer(
        question_id=question_id,
        question_text=question_text,
        video_path=str(video_path_abs),  # absolute path to the .webm file on disk
        processed=False,             # will be set to True after AI pipeline completes
    )
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$push": {"answers": answer.model_dump()},   # append new answer
            "$set":  {"status": "processing"},           # mark session as processing
        },
    )

    # ── Queue background AI processing ────────────────────────────────────────
    # background_tasks.add_task() registers process_video to run AFTER this response is sent.
    # This means the candidate gets their "uploaded!" confirmation instantly,
    # while the heavy AI work (WhisperX + DeepFace + LLM) runs in the background.
    background_tasks.add_task(
        process_video,
        session_id=session_id,
        question_id=question_id,
        video_path=str(video_path_abs),
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
    """
    Poll whether a specific answer has finished AI processing.

    The frontend's polling logic calls this every 8 seconds while the
    CandidateResults page shows "AI Analysis In Progress…".

    MongoDB's positional operator ($) with a filter on "answers.question_id"
    returns only the matching answer sub-document instead of the whole session.
    """
    doc = await db["sessions"].find_one(
        {
            "_id": ObjectId(session_id),
            "answers.question_id": question_id,  # only match sessions that have this answer
        },
        {"answers.$": 1},  # projection: only return the matching answer element, not the whole session
    )
    if not doc or not doc.get("answers"):
        raise HTTPException(status_code=404, detail="Answer not found")

    answer = doc["answers"][0]  # $ operator always returns a single-element list
    return {"processed": answer.get("processed", False), "question_id": question_id}
