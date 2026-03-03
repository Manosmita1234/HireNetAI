"""
routers/evaluate.py – Holistic AI evaluation endpoints.

Endpoints:
  POST /evaluate                         – Evaluate from a raw JSON payload (admin)
  POST /evaluate/session/{session_id}    – Evaluate an existing DB session (admin)
"""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.schemas.evaluation import (
    EvaluationRequest,
    HolisticEvaluationResult,
    QuestionAnswerInput,
)
from app.services import evaluation_service
from app.utils.auth import require_admin
from app.utils.helpers import mongo_doc_to_dict

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/evaluate", tags=["Evaluation"])


# ── 1. Direct evaluation from payload ────────────────────────────────────────

@router.post(
    "",
    response_model=HolisticEvaluationResult,
    summary="Holistic evaluation from raw Q&A payload",
)
async def evaluate_from_payload(
    body: EvaluationRequest,
    admin: dict = Depends(require_admin),
) -> HolisticEvaluationResult:
    """
    Accept a full interview payload (candidate name, role, 10 Q&A dicts)
    and return a holistic evaluation result.

    The LLM reads ALL answers before scoring — no partial evaluations.
    """
    logger.info(
        "[Evaluate] Direct payload evaluation for '%s' (%d questions)",
        body.candidate_name, len(body.questions),
    )
    result = await evaluation_service.run_holistic_evaluation(body)
    return result


# ── 2. Evaluate an existing session stored in MongoDB ────────────────────────

@router.post(
    "/session/{session_id}",
    response_model=HolisticEvaluationResult,
    summary="Run holistic evaluation on a completed DB session",
)
async def evaluate_session(
    session_id: str,
    admin: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> HolisticEvaluationResult:
    """
    Read a completed interview session from MongoDB, build the evaluation
    payload from stored transcripts and emotion data, call the holistic
    evaluation engine, save the result back to the session document, and
    return the evaluation.
    """
    # ── Fetch session ─────────────────────────────────────────────────────────
    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id format")

    doc = await db["sessions"].find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    doc = mongo_doc_to_dict(doc)

    answers_raw = doc.get("answers", [])
    if not answers_raw:
        raise HTTPException(status_code=422, detail="Session has no answers to evaluate")

    # ── Build payload from stored data ────────────────────────────────────────
    qa_items = []
    for idx, a in enumerate(answers_raw, start=1):
        # Build a readable emotion summary from stored distribution
        emotion_dist: dict = a.get("emotion_distribution", {})
        if emotion_dist:
            dominant = max(emotion_dist, key=emotion_dist.get)
            emotion_summary = f"{dominant} ({emotion_dist[dominant]:.0%})"
        else:
            emotion_summary = a.get("emotion_summary", "")

        qa_items.append(
            QuestionAnswerInput(
                question_id=idx,
                question_text=a.get("question_text", f"Question {idx}"),
                answer_text=a.get("transcript") or "",
                emotion_summary=emotion_summary,
            )
        )

    request = EvaluationRequest(
        candidate_name=doc.get("candidate_name", "Unknown"),
        role_applied=doc.get("role_applied", "Not specified"),
        questions=qa_items,
    )

    logger.info(
        "[Evaluate] Session %s – running holistic eval for '%s'",
        session_id, request.candidate_name,
    )

    # ── Call evaluation engine ────────────────────────────────────────────────
    result = await evaluation_service.run_holistic_evaluation(request)

    # ── Persist to MongoDB ────────────────────────────────────────────────────
    await db["sessions"].update_one(
        {"_id": oid},
        {
            "$set": {
                "holistic_evaluation": result.model_dump(),
                "holistic_evaluated_at": datetime.now(timezone.utc),
            }
        },
    )
    logger.info("[Evaluate] Session %s – holistic_evaluation saved to DB.", session_id)

    return result
