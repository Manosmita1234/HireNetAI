"""
repair_session.py — Re-run WhisperX transcription and scoring for sessions that
failed due to:
  1. np.float32 numpy types leaking into MongoDB during alignment (caused
     "Invalid document: cannot encode object: np.float32" errors)
  2. mkl_malloc / OpenCV memory errors from passing numpy frames directly
     to DeepFace (fixed by writing frames to temp files instead)

Usage:
  python repair_session.py [session_id]
  python repair_session.py           # repairs ALL sessions with ERROR transcripts
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

from app.config import get_settings
from app.services import whisper_service, emotion_service, llm_service, scoring_service
from app.models.interview import Answer, LLMEvaluation
import numpy as np

settings = get_settings()


def _to_native(value):
    """Convert numpy types to native Python types for MongoDB serialization."""
    import numpy as np
    if isinstance(value, np.ndarray):
        return value.item()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, list):
        return [_to_native(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_native(v) for k, v in value.items()}
    return value


async def repair_session(session_id: str, db, dry_run: bool = False) -> dict:
    """Re-process all ERROR answers for a single session. Returns stats dict."""
    sid = ObjectId(session_id)
    doc = await db.sessions.find_one({"_id": sid})
    if not doc:
        return {"error": "Session not found"}

    results = {"session_id": session_id, "repaired": 0, "failed": 0, "skipped": 0}

    for a in doc.get("answers", []):
        qid = a.get("question_id")
        transcript = str(a.get("transcript", ""))

        # Only repair answers that have ERROR transcripts (not processing failures)
        if "ERROR" not in transcript:
            results["skipped"] += 1
            continue

        print(f"\n[Repair] Session {session_id} | Q{qid}")
        print(f"  Old transcript: {transcript[:120]}")

        # ── Step 1: Audio path ─────────────────────────────────────────────────
        video_path = a.get("video_path")
        audio_path = None

        if video_path:
            vp = Path(video_path)
            if vp.exists():
                audio_path = str(vp.with_suffix(".wav"))
                if not Path(audio_path).exists():
                    print(f"  [Repair] Audio missing, extracting from {vp.name}")
                    import subprocess
                    cmd = [
                        "ffmpeg", "-y", "-i", str(vp),
                        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
                        audio_path,
                    ]
                    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
                    if r.returncode != 0:
                        print(f"  [Repair] ffmpeg failed: {r.stderr[:200]}")
                        audio_path = None
            else:
                print(f"  [Repair] Video file missing: {video_path}")
                audio_path = str(vp.with_suffix(".wav"))
                if not Path(audio_path).exists():
                    audio_path = None

        if not audio_path:
            print(f"  [Repair] Cannot find audio — skipping")
            results["failed"] += 1
            continue

        update_fields = {}

        try:
            # ── Step 2: WhisperX transcription ─────────────────────────────────
            print(f"  [Repair] Transcribing {audio_path} ...")
            whisper_result = await whisper_service.transcribe_audio(audio_path)

            transcript = whisper_result["transcript"]
            print(f"  [Repair] Transcript: {transcript[:80]}...")

            # Convert all numpy types to native Python before writing to MongoDB
            words = _to_native(whisper_result["words"])
            pauses = _to_native(whisper_result["pauses"])
            hesitation_score = _to_native(whisper_result["hesitation_score"])

            update_fields["answers.$.transcript"] = transcript
            update_fields["answers.$.word_timestamps"] = words
            update_fields["answers.$.pause_count"] = len(pauses)
            update_fields["answers.$.long_pauses"] = pauses
            update_fields["answers.$.hesitation_score"] = hesitation_score
            update_fields["answers.$.audio_path"] = audio_path

            # ── Step 3: LLM evaluation ─────────────────────────────────────────
            question_text = a.get("question_text", "")
            if transcript and question_text:
                print(f"  [Repair] Running LLM evaluation ...")
                llm_eval = await llm_service.evaluate_answer(
                    question=question_text,
                    transcript=transcript,
                )
                update_fields["answers.$.llm_evaluation"] = llm_eval.model_dump()

                # ── Step 4: Score ───────────────────────────────────────────────
                temp_answer = Answer(
                    question_id=qid,
                    question_text=question_text,
                    transcript=transcript,
                    confidence_index=a.get("confidence_index", 5.0),
                    hesitation_score=hesitation_score,
                    llm_evaluation=llm_eval,
                )
                answer_score = scoring_service.score_single_answer(temp_answer)
                update_fields["answers.$.answer_final_score"] = answer_score
                print(f"  [Repair] Score: {answer_score}")

            # ── Step 5: Emotion analysis (if video exists) ─────────────────────
            if video_path and Path(video_path).exists():
                print(f"  [Repair] Analyzing emotions ...")
                emotion_result = await emotion_service.analyze_video_emotions(video_path)
                update_fields["answers.$.frame_emotions"] = emotion_result["frame_emotions"]
                update_fields["answers.$.emotion_distribution"] = emotion_result["emotion_distribution"]
                update_fields["answers.$.confidence_index"] = emotion_result["confidence_index"]
                update_fields["answers.$.nervousness_score"] = emotion_result["nervousness_score"]
            else:
                print(f"  [Repair] Skipping emotion analysis (video missing)")

            update_fields["answers.$.processed"] = True

            if not dry_run:
                await db["sessions"].update_one(
                    {"_id": sid, "answers.question_id": qid},
                    {"$set": update_fields},
                )
                print(f"  [Repair] Updated MongoDB for Q{qid}")
            else:
                print(f"  [Repair] DRY RUN — would update with: {list(update_fields.keys())}")

            results["repaired"] += 1

        except Exception as exc:
            print(f"  [Repair] ERROR re-processing Q{qid}: {exc}")
            if not dry_run:
                await db["sessions"].update_one(
                    {"_id": sid, "answers.question_id": qid},
                    {"$set": {
                        "answers.$.transcript": f"[REPAIR_ERROR: {str(exc)[:200]}]",
                        "answers.$.processed": True,
                    }},
                )
            results["failed"] += 1

    return results


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Repair failed session transcripts")
    parser.add_argument("session_id", nargs="?", help="Specific session ID to repair (ObjectId)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be repaired without writing")
    args = parser.parse_args()

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[settings.mongodb_db_name]

    if args.session_id:
        results = await repair_session(args.session_id, db, dry_run=args.dry_run)
        print(f"\nResult: {result}")
        if not args.dry_run and results["repaired"] > 0:
            from app.services import scoring_service
            from app.models.interview import Answer, LLMEvaluation
            from datetime import datetime, timezone
            doc = await db.sessions.find_one({"_id": ObjectId(args.session_id)})
            if doc:
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
                await db.sessions.update_one(
                    {"_id": ObjectId(args.session_id)},
                    {"$set": {"final_score": agg["final_score"], "category": agg["category"], "status": "completed", "completed_at": datetime.now(timezone.utc)}},
                )
                print(f"  Finalized: score={agg['final_score']}, category={agg['category']}")
    else:
        # Find all sessions with ERROR transcripts
        cursor = db.sessions.find({"answers.transcript": {"$regex": "ERROR"}})
        sessions = await cursor.to_list(length=100)
        print(f"Found {len(sessions)} sessions with ERROR transcripts")

        for doc in sessions:
            sid = str(doc["_id"])
            result = await repair_session(sid, db, dry_run=args.dry_run)
            print(f"  Session {sid}: {result}")


if __name__ == "__main__":
    asyncio.run(main())