"""
repair_scores.py – Standalone script to fix all zero-scored answers in MongoDB.
Run with: python repair_scores.py
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings
from app.models.interview import Answer, LLMEvaluation
from app.services.scoring_service import score_single_answer, aggregate_session_score

settings = get_settings()


async def main():
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]

    sessions_fixed = 0
    answers_rescored = 0
    errors = []

    cursor = db["sessions"].find({})
    async for doc in cursor:
        session_id = str(doc["_id"])
        raw_answers = doc.get("answers", [])
        if not raw_answers:
            continue

        session_changed = False
        for a in raw_answers:
            llm_data = a.get("llm_evaluation")
            if not llm_data:
                continue
            llm_eval = LLMEvaluation(**llm_data)
            stored_score = a.get("answer_final_score", 0.0)

            ans = Answer(
                question_id=a.get("question_id", ""),
                question_text=a.get("question_text", ""),
                transcript=a.get("transcript"),
                confidence_index=a.get("confidence_index", 0.0),
                hesitation_score=a.get("hesitation_score", 0.0),
                llm_evaluation=llm_eval,
                answer_final_score=stored_score,
                face_analytics=a.get("face_analytics"),
            )

            if stored_score == 0.0:
                try:
                    new_score = score_single_answer(ans)
                    await db["sessions"].update_one(
                        {"_id": doc["_id"], "answers.question_id": a.get("question_id")},
                        {"$set": {"answers.$.answer_final_score": new_score}},
                    )
                    answers_rescored += 1
                    session_changed = True
                    print(f"  [FIXED] {session_id}/{a.get('question_id')} -> {new_score}")
                except Exception as e:
                    errors.append(f"{session_id}/{a.get('question_id')}: {e}")

        if session_changed:
            # Re-aggregate session score (only valid scores > 0)
            fresh = await db["sessions"].find_one({"_id": doc["_id"]})
            if fresh:
                raw = fresh.get("answers", [])
                answers = []
                for a in raw:
                    llm_d = a.get("llm_evaluation")
                    llm_e = LLMEvaluation(**llm_d) if llm_d else None
                    answers.append(Answer(
                        question_id=a.get("question_id", ""),
                        question_text=a.get("question_text", ""),
                        transcript=a.get("transcript"),
                        confidence_index=a.get("confidence_index", 0.0),
                        hesitation_score=a.get("hesitation_score", 0.0),
                        llm_evaluation=llm_e,
                        answer_final_score=a.get("answer_final_score", 0.0),
                        face_analytics=a.get("face_analytics"),
                    ))
                agg = aggregate_session_score(answers)
                await db["sessions"].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"final_score": agg["final_score"], "category": agg["category"]}},
                )
                sessions_fixed += 1
                print(f"  [SESSION] {session_id} -> final_score={agg['final_score']}, category={agg['category']}")

    print(f"\nDone. Fixed {answers_rescored} answer(s) across {sessions_fixed} session(s).")
    if errors:
        print("Errors:", errors)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
