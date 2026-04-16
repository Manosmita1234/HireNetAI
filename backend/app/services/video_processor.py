"""
services/video_processor.py – Orchestrator that runs the full AI pipeline for each uploaded video.

This is the most important backend service. It ties WhisperX, DeepFace, GPT, and scoring together.

Order of operations for EACH uploaded video (process_video):
  A. Extract audio from the .webm video using ffmpeg → produces a .wav file
  B. Transcribe + align the audio with WhisperX → transcript + word timestamps + pauses
  C. Analyze facial emotions with DeepFace → emotion_distribution + confidence_index
  D. Evaluate the transcript with GPT → clarity, logic, relevance, personality scores
  E. Compute the per-answer weighted score using scoring_service
  F. Persist all results back to the MongoDB session document

After ALL answers are done (finalize_session):
  1. Average the per-answer scores → final_score + category
  2. Mark the session status as "completed"
  3. Run a holistic GPT evaluation across ALL Q&A pairs for a bird's-eye assessment
"""

import asyncio
import subprocess                        # used to run ffmpeg as a system command
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

from app.config import get_settings
from app.services import whisper_service, emotion_service, llm_service, scoring_service
from app.models.interview import Answer, LLMEvaluation

settings = get_settings()


def _extract_audio_sync(video_path: str, audio_path: str) -> None:
    """
    Runs ffmpeg (as a subprocess) to extract the audio track from a .webm video
    and save it as a 16 kHz mono WAV file — the format WhisperX expects.

    ffmpeg flags used:
      -y            : overwrite output file if it exists
      -i video_path : input file
      -vn           : disable video (audio only)
      -acodec pcm_s16le : standard uncompressed WAV format
      -ar 16000     : resample to 16,000 Hz (WhisperX's required sample rate)
      -ac 1         : convert to mono (1 channel)

    Raises RuntimeError if ffmpeg exits with a non-zero return code.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-vn",                  # audio only, no video stream
        "-acodec", "pcm_s16le", # PCM WAV: lossless, universally supported
        "-ar", "16000",         # 16 kHz: WhisperX default/required sample rate
        "-ac", "1",             # mono audio
        audio_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:500]}")


async def _update_session_score(session_id: str, db: AsyncIOMotorDatabase) -> None:
    """
    Update the session's final_score and category based on all processed answers.
    Called after each answer is processed to keep the running score up-to-date.
    """
    try:
        doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
        if not doc:
            return

        raw_answers = doc.get("answers", [])
        if not raw_answers:
            return

        # Build Answer objects with stored scores
        from app.models.interview import Answer, LLMEvaluation
        answers = []
        for a in raw_answers:
            llm_data = a.get("llm_evaluation")
            llm_eval = LLMEvaluation(**llm_data) if llm_data else None
            stored_score = a.get("answer_final_score", 0.0)
            ans = Answer(
                question_id=a.get("question_id", ""),
                question_text=a.get("question_text", ""),
                transcript=a.get("transcript"),
                confidence_index=a.get("confidence_index"),
                hesitation_score=a.get("hesitation_score", 0.0),
                llm_evaluation=llm_eval,
                answer_final_score=stored_score,
            )
            answers.append(ans)

        # Compute aggregate score
        agg = scoring_service.aggregate_session_score(answers)

        # Update session
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "final_score": agg["final_score"],
                "category": agg["category"],
            }},
        )
    except Exception as e:
        print(f"[Pipeline] Warning: failed to update session score: {e}")


async def process_video(
    session_id: str,
    question_id: str,
    video_path: str,
    question_text: str,
    db: AsyncIOMotorDatabase,
) -> None:
    """
    Full async AI pipeline for one uploaded video answer.

    Called as a FastAPI BackgroundTask immediately after the video is uploaded.
    Runs outside the HTTP request/response cycle — the candidate already received
    their "Upload successful" response before this function starts.

    On success: updates MongoDB with all AI results, sets answers.$.processed = True
    On failure: writes an error message to the transcript, still sets processed = True
                (so the frontend polling doesn't wait forever)
    """
    # Derive the audio file path from the video path (same dir, .wav extension)
    video_p = Path(video_path)
    audio_path = str(video_p.with_suffix(".wav"))

    # All fields to update in MongoDB at the end of this function
    update_fields: Dict[str, Any] = {}

    try:
        # ── Step A: Extract audio using ffmpeg ────────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – extracting audio …")
        # run_in_executor: run the blocking subprocess call in a thread pool
        # so the event loop isn't blocked while ffmpeg runs
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _extract_audio_sync, video_path, audio_path)
        update_fields["answers.$.audio_path"] = audio_path  # save path for reference

        # ── Step B: Speech-to-text + hesitation detection (WhisperX) ─────────
        print(f"[Pipeline] {session_id}/{question_id} – transcribing …")
        whisper_result = await whisper_service.transcribe_audio(audio_path)
        # The "answers.$." syntax uses MongoDB's positional operator:
        # it updates the specific answer sub-document that matched the query filter
        update_fields["answers.$.transcript"]       = whisper_result["transcript"]
        update_fields["answers.$.word_timestamps"]  = whisper_result["words"]
        update_fields["answers.$.pause_count"]      = len(whisper_result["pauses"])
        update_fields["answers.$.long_pauses"]      = whisper_result["pauses"]
        update_fields["answers.$.hesitation_score"] = whisper_result["hesitation_score"]

        # ── Step C: Facial emotion analysis (DISABLED) ─────────────────────────
        # DeepFace is not available in this deployment.
        # Emotion-related fields remain empty/null.
        update_fields["answers.$.frame_emotions"]       = []
        update_fields["answers.$.emotion_distribution"] = {}
        update_fields["answers.$.confidence_index"]     = None
        update_fields["answers.$.nervousness_score"]     = None

        # ── Step D: LLM evaluation (GPT) ──────────────────────────────────────
        print(f"[Pipeline] {session_id}/{question_id} – LLM evaluation …")
        llm_eval = await llm_service.evaluate_answer(
            question=question_text,
            transcript=whisper_result["transcript"],  # what the candidate actually said
        )
        # model_dump() converts the Pydantic model to a plain dict for MongoDB storage
        update_fields["answers.$.llm_evaluation"] = llm_eval.model_dump()

        # ── Step E: Per-answer weighted score ────────────────────────────────
        # Build a temporary Answer object to pass to scoring_service
        temp_answer = Answer(
            question_id=question_id,
            question_text=question_text,
            transcript=whisper_result["transcript"],
            confidence_index=None,
            hesitation_score=whisper_result["hesitation_score"],
            llm_evaluation=llm_eval,
        )
        answer_score = scoring_service.score_single_answer(temp_answer)
        update_fields["answers.$.answer_final_score"] = answer_score
        update_fields["answers.$.processed"] = True  # marks this answer as fully analyzed

        # ── Step F: Persist all results to MongoDB ────────────────────────────
        # The filter finds the specific answer inside the session using MongoDB's
        # positional operator ($): "answers.question_id": question_id targets the right element
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id), "answers.question_id": question_id},
            {"$set": update_fields},   # $set updates only the specified fields
        )

        # Update session's running final score immediately
        # This ensures final_score is never stale even if finalize_session isn't called
        await _update_session_score(session_id, db)

        print(f"[Pipeline] {session_id}/{question_id} – done ✓ (score={answer_score})")

    except Exception as exc:
        # Even on failure, mark as processed so polling stops waiting
        # Store the error in 'transcript' so admins can see what went wrong
        print(f"[Pipeline] ERROR in {session_id}/{question_id}: {exc}")
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id), "answers.question_id": question_id},
            {"$set": {
                "answers.$.processed": True,
                "answers.$.transcript": f"[ERROR: {str(exc)[:200]}]",
            }},
        )


async def finalize_session(session_id: str, db: AsyncIOMotorDatabase) -> None:
    """
    Called after ALL answers are uploaded (by the /session/:id/complete endpoint).

    Step 1: Average the per-answer scores → session final_score + category verdict
            → sets status = "completed"

    Step 2: Run a holistic GPT evaluation across ALL Q&A pairs at once.
            This gives a bird's-eye view of the candidate's overall performance.
            The holistic_evaluation is stored separately on the session document.
    """
    # Lazy imports to avoid circular dependency issues at module load time
    from app.models.interview import Answer
    from app.schemas.evaluation import EvaluationRequest, QuestionAnswerInput
    from app.services.evaluation_service import run_holistic_evaluation
    from datetime import timezone

    doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not doc:
        return  # session was deleted before finalization completed

    # ── Wait for all answers to finish AI processing ───────────────────────────
    # Each answer is processed by a separate BackgroundTask (process_video).
    # finalize_session can be triggered while those tasks are still running.
    # We poll MongoDB every 5 seconds (up to 10 minutes) until all answers
    # have processed=True before computing scores or exporting the JSON.
    expected_count = len(doc.get("answers", []))
    print(f"[Pipeline] Session {session_id} – waiting for {expected_count} answers to finish processing …")
    for attempt in range(120):  # 120 × 5s = 10 minutes max
        fresh = await db["sessions"].find_one({"_id": ObjectId(session_id)})
        if not fresh:
            return
        raw = fresh.get("answers", [])
        done = sum(1 for a in raw if a.get("processed", False))
        if done >= expected_count:
            print(f"[Pipeline] Session {session_id} – all {done}/{expected_count} answers processed ✓")
            doc = fresh  # use the freshest data
            break
        print(f"[Pipeline] Session {session_id} – {done}/{expected_count} processed, waiting 5s …")
        await asyncio.sleep(5)
    else:
        print(f"[Pipeline] Session {session_id} – timed out waiting for answers; proceeding with partial data")
        doc = await db["sessions"].find_one({"_id": ObjectId(session_id)}) or doc

    # ── Step 1: Aggregate per-answer scores ────────────────────────────────────
    raw_answers = doc.get("answers", [])
    answers = []

    # Re-build Answer Pydantic objects from the raw MongoDB dicts.
    # IMPORTANT: If a stored answer_final_score is 0.0 but LLM evaluation data
    # exists, recompute the score now. This handles the race condition where
    # finalize_session ran before process_video finished saving its scores.
    for a in raw_answers:
        llm_data = a.get("llm_evaluation")
        llm_eval = LLMEvaluation(**llm_data) if llm_data else None
        stored_score = a.get("answer_final_score", 0.0)

        ans = Answer(
            question_id=a.get("question_id", ""),
            question_text=a.get("question_text", ""),
            confidence_index=a.get("confidence_index"),
            hesitation_score=a.get("hesitation_score", 0.0),
            llm_evaluation=llm_eval,
            answer_final_score=stored_score,
        )

        # Recompute if score is 0 but we have LLM data (indicates stale zero from race condition)
        if stored_score == 0.0 and llm_eval is not None:
            recomputed = scoring_service.score_single_answer(ans)
            ans.answer_final_score = recomputed
            print(f"[Pipeline] Re-scored {a.get('question_id')} → {recomputed} (was 0.0)")
            # Write corrected score back to MongoDB
            await db["sessions"].update_one(
                {"_id": ObjectId(session_id), "answers.question_id": a.get("question_id")},
                {"$set": {"answers.$.answer_final_score": recomputed}},
            )

        answers.append(ans)

    # Compute average score and hiring category
    agg = scoring_service.aggregate_session_score(answers)

    # Update the session document with the final verdict
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "final_score":  agg["final_score"],   # e.g. 7.25
                "category":     agg["category"],      # e.g. "Recommended"
                "status":       "completed",           # marks session as done
                "completed_at": datetime.utcnow(),     # timestamp for the admin dashboard
            }
        },
    )
    print(f"[Pipeline] Session {session_id} finalized – {agg}")

    # ── Step 2: Holistic AI evaluation across all Q&A pairs ───────────────────
    # This sends ALL questions + answers + emotion summaries to GPT in one call
    # for an overall written assessment of the candidate.
    print(f"[Pipeline] Session {session_id} – running holistic evaluation …")
    try:
        qa_items = []
        for idx, a in enumerate(raw_answers, start=1):
            emotion_dist: dict = a.get("emotion_distribution", {})
            if emotion_dist:
                # Find the emotion with the highest percentage ("dominant emotion")
                dominant = max(emotion_dist, key=emotion_dist.get)
                emotion_summary = f"{dominant} ({emotion_dist[dominant]:.0%})"
            else:
                emotion_summary = ""

            conf_idx: float = a.get("confidence_index", 0.0)
            # Convert numeric confidence_index (0–10) to human-readable label
            conf_str = "high" if conf_idx >= 7 else ("medium" if conf_idx >= 4 else "low")

            qa_items.append(
                QuestionAnswerInput(
                    question_id=idx,
                    question_text=a.get("question_text", f"Question {idx}"),
                    answer_text=a.get("transcript") or "",
                    emotion_summary=emotion_summary,
                    confidence_indicator=conf_str,
                )
            )

        eval_request = EvaluationRequest(
            candidate_name=doc.get("candidate_name", "Unknown"),
            role_applied=doc.get("role_applied", "Not specified"),
            questions=qa_items,
        )

        # Send the full interview to GPT for an overall written assessment
        holistic = await run_holistic_evaluation(eval_request)

        # Store the result on the session document
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "holistic_evaluation":   holistic.model_dump(),
                    "holistic_evaluated_at": datetime.now(timezone.utc),
                }
            },
        )
        print(
            f"[Pipeline] Session {session_id} – holistic eval done "
            f"(score={holistic.overall_score}, decision={holistic.decision})"
        )

    except Exception as exc:
        # Log the error but don't fail the whole finalization
        # The per-answer scores are already saved; holistic is a bonus feature
        print(f"[Pipeline] WARNING: Holistic evaluation failed for {session_id}: {exc}")

    # ── Step 3: Export transcript.json to disk ────────────────────────────────
    # Saves a human-readable JSON file alongside the .webm video files at:
    #   uploads/<session_id>/transcript.json
    # This mirrors the ISP blueprint (github.com/Imtry100/ISP) approach of keeping
    # transcripts/ next to the video/ folder for easy offline access and re-processing.
    print(f"[Pipeline] Session {session_id} – exporting transcript.json …")
    json_path = None
    try:
        from app.services.json_scoring_service import export_session_json

        # Re-fetch the session with the latest completed data for the JSON
        refreshed_doc = await db["sessions"].find_one({"_id": ObjectId(session_id)})
        if refreshed_doc:
            json_path = export_session_json(
                session_id=session_id,
                session_doc=refreshed_doc,
                upload_dir=settings.upload_path,  # returns Path object from config
            )
            # Persist the JSON file path back to MongoDB so admins can download it
            await db["sessions"].update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {"transcript_json_path": str(json_path)}},
            )
            print(f"[Pipeline] Session {session_id} – transcript.json saved to {json_path}")
    except Exception as exc:
        print(f"[Pipeline] WARNING: JSON export failed for {session_id}: {exc}")

    # ── Step 4: AI role-fit scoring from the JSON file ────────────────────────
    # Reads transcript.json and asks GPT: "Is this candidate a fit for the role?"
    # Returns: { role_fit_score (0-100), decision, strengths, concerns, recommendation }
    # Stored on the session as session.role_fit_result.
    if json_path is not None:
        print(f"[Pipeline] Session {session_id} – running role-fit scoring from JSON …")
        try:
            from app.services.json_scoring_service import score_from_json

            role_fit = await score_from_json(json_path)

            await db["sessions"].update_one(
                {"_id": ObjectId(session_id)},
                {
                    "$set": {
                        "role_fit_result":     role_fit,
                        "role_fit_scored_at":  datetime.now(timezone.utc),
                    }
                },
            )
            print(
                f"[Pipeline] Session {session_id} – role-fit done "
                f"({role_fit.get('decision')} | score={role_fit.get('role_fit_score')})"
            )
        except Exception as exc:
            print(f"[Pipeline] WARNING: Role-fit scoring failed for {session_id}: {exc}")

