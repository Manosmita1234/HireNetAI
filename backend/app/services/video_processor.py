"""
services/video_processor.py – Orchestrator that runs the full video pipeline.

Order of operations for each uploaded video:
  1. Extract audio (ffmpeg)
  2. Transcribe + align (WhisperX)
  3. Emotion analysis (OpenCV + DeepFace)
  4. LLM evaluation (OpenAI)
  5. Score calculation
  6. Persist results to MongoDB
"""

import asyncio
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Any, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.config import get_settings
from app.services import whisper_service, emotion_service, llm_service, scoring_service
from app.models.interview import Answer, LLMEvaluation

settings = get_settings()


def _extract_audio_sync(video_path: str, audio_path: str) -> None:
    """Use ffmpeg to extract audio track from video file."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",                  # no video
        "-acodec", "pcm_s16le", # PCM WAV (WhisperX compatible)
        "-ar", "16000",         # 16 kHz sample rate
        "-ac", "1",             # mono
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")


async def process_video(
    session_id: str,
    question_id: str,
    video_path: str,
    question_text: str,
    db: AsyncIOMotorDatabase,
) -> None:
    """
    Full async pipeline for one uploaded video.
    Updates the corresponding Answer sub-document in MongoDB when done.
    """
    # Derive audio path
    video_p = Path(video_path)
    audio_path = str(video_p.with_suffix(".wav"))

    update_fields: Dict[str, Any] = {}

    try:
        # ── Step A: Extract audio ─────────────────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – extracting audio …")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _extract_audio_sync, video_path, audio_path)
        update_fields["answers.$.audio_path"] = audio_path

        # ── Step B: Transcription + alignment ────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – transcribing …")
        whisper_result = await whisper_service.transcribe_audio(audio_path)

        update_fields["answers.$.transcript"] = whisper_result["transcript"]
        update_fields["answers.$.word_timestamps"] = whisper_result["words"]
        update_fields["answers.$.pause_count"] = len(whisper_result["pauses"])
        update_fields["answers.$.long_pauses"] = whisper_result["pauses"]
        update_fields["answers.$.hesitation_score"] = whisper_result["hesitation_score"]

        # ── Step C: Emotion analysis ──────────────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – emotion analysis …")
        emotion_result = await emotion_service.analyze_video_emotions(video_path)

        update_fields["answers.$.frame_emotions"] = emotion_result["frame_emotions"]
        update_fields["answers.$.emotion_distribution"] = emotion_result["emotion_distribution"]
        update_fields["answers.$.confidence_index"] = emotion_result["confidence_index"]
        update_fields["answers.$.nervousness_score"] = emotion_result["nervousness_score"]

        # ── Step D: LLM evaluation ────────────────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – LLM evaluation …")
        llm_eval = await llm_service.evaluate_answer(
            question=question_text,
            transcript=whisper_result["transcript"],
        )
        update_fields["answers.$.llm_evaluation"] = llm_eval.model_dump()

        # ── Step E: Per-answer score ──────────────────────────────────────
        # Build a temporary Answer object to run scoring
        temp_answer = Answer(
            question_id=question_id,
            question_text=question_text,
            confidence_index=emotion_result["confidence_index"],
            hesitation_score=whisper_result["hesitation_score"],
            llm_evaluation=llm_eval,
        )
        answer_score = scoring_service.score_single_answer(temp_answer)
        update_fields["answers.$.answer_final_score"] = answer_score
        update_fields["answers.$.processed"] = True

        # ── Persist to MongoDB ────────────────────────────────────────────
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id), "answers.question_id": question_id},
            {"$set": update_fields},
        )
        print(f"[Pipeline] {session_id}/{question_id} – done ✓ (score={answer_score})")

    except Exception as exc:
        # Mark answer as processed (with error) so it doesn't loop
        print(f"[Pipeline] ERROR in {session_id}/{question_id}: {exc}")
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id), "answers.question_id": question_id},
            {"$set": {"answers.$.processed": True, "answers.$.transcript": f"[ERROR: {str(exc)[:200]}]"}},
        )


async def finalize_session(session_id: str, db: AsyncIOMotorDatabase) -> None:
    """
    After all answers are processed, compute the aggregate session score
    and mark the session as 'completed'.
    """
    from app.models.interview import Answer

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        return

    # Reconstruct Answer objects
    raw_answers = doc.get("answers", [])
    answers = []
    for a in raw_answers:
        llm_data = a.get("llm_evaluation")
        llm_eval = LLMEvaluation(**llm_data) if llm_data else None
        ans = Answer(
            question_id=a.get("question_id", ""),
            question_text=a.get("question_text", ""),
            confidence_index=a.get("confidence_index", 0.0),
            hesitation_score=a.get("hesitation_score", 0.0),
            llm_evaluation=llm_eval,
            answer_final_score=a.get("answer_final_score", 0.0),
        )
        answers.append(ans)

    agg = scoring_service.aggregate_session_score(answers)

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "final_score": agg["final_score"],
                "category": agg["category"],
                "status": "completed",
                "completed_at": datetime.utcnow(),
            }
        },
    )
    print(f"[Pipeline] Session {session_id} finalized – {agg}")
