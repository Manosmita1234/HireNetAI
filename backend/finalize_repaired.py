"""
finalize_repaired.py — Recompute session final_score + category for repaired sessions.
Run AFTER repair_session.py has fixed all ERROR transcripts.
"""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime, timezone

from app.config import get_settings
from app.services import scoring_service
from app.models.interview import Answer, LLMEvaluation

settings = get_settings()


async def finalize_session(session_id: str, db) -> dict:
    doc = await db.sessions.find_one({"_id": ObjectId(session_id)})
    if not doc:
        return {"error": "Session not found"}

    raw_answers = doc.get("answers", [])
    answers = []

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

        if stored_score == 0.0 and llm_eval is not None:
            recomputed = scoring_service.score_single_answer(ans)
            ans.answer_final_score = recomputed
            await db["sessions"].update_one(
                {"_id": ObjectId(session_id), "answers.question_id": a.get("question_id")},
                {"$set": {"answers.$.answer_final_score": recomputed}},
            )

        answers.append(ans)

    agg = scoring_service.aggregate_session_score(answers)

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "final_score":  agg["final_score"],
                "category":     agg["category"],
                "status":       "completed",
                "completed_at": datetime.now(timezone.utc),
            }
        },
    )

    print(f"[Finalize] Session {session_id}: score={agg['final_score']}, category={agg['category']}")
    return {"session_id": session_id, "final_score": agg["final_score"], "category": agg["category"]}


async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Finalize repaired sessions")
    parser.add_argument("session_id", nargs="?", help="Specific session ID")
    args = parser.parse_args()

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[settings.mongodb_db_name]

    if args.session_id:
        await finalize_session(args.session_id, db)
    else:
        cursor = db.sessions.find({"status": {"$in": ["processing", "completed"]}, "answers.transcript": {"$not": {"$regex": "ERROR"}}})
        sessions = await cursor.to_list(length=100)
        # Filter sessions with any 0-score answers (likely failed)
        for doc in sessions:
            sid = str(doc["_id"])
            has_zero = any(a.get("answer_final_score", 0) == 0 for a in doc.get("answers", []))
            if has_zero:
                print(f"[Check] Session {sid} has 0-score answers, finalizing...")
                await finalize_session(sid, db)
            else:
                print(f"[Skip] Session {sid} already has all scores, status={doc.get('status')}")

if __name__ == "__main__":
    asyncio.run(main())