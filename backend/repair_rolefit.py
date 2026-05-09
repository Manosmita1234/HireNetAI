"""
repair_rolefit.py – Fix role_fit_score=0 sessions by re-exporting transcript.json
with fresh per-answer scores and re-running GPT role-fit evaluation.
Run with: python repair_rolefit.py
"""
import asyncio
import json
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pathlib import Path

from app.config import get_settings
from app.models.interview import Answer, LLMEvaluation
from app.services.json_scoring_service import export_session_json, score_from_json

settings = get_settings()


async def main():
    client = AsyncIOMotorClient(settings.mongodb_url)
    db = client[settings.mongodb_db_name]

    fixed = 0
    errors = []

    cursor = db["sessions"].find({"status": "completed"})
    async for doc in cursor:
        session_id = str(doc["_id"])
        rfr = doc.get("role_fit_result")
        role_fit_score = rfr.get("role_fit_score") if rfr else None

        if role_fit_score == 0:
            print(f"Fixing {session_id[:12]}... (role_fit_score was 0)")

            # Re-export transcript.json with fresh scores from DB
            refreshed = await db["sessions"].find_one({"_id": ObjectId(session_id)})
            if not refreshed:
                print(f"  [SKIP] Session not found")
                continue

            try:
                json_path = export_session_json(
                    session_id=session_id,
                    session_doc=refreshed,
                    upload_dir=settings.upload_path,
                )
                print(f"  [JSON] Re-exported to {json_path.name}")

                # Re-run GPT role-fit scoring
                role_fit = await score_from_json(json_path)
                new_score = role_fit.get("role_fit_score", 0)
                new_decision = role_fit.get("decision", "Consider")

                await db["sessions"].update_one(
                    {"_id": ObjectId(session_id)},
                    {"$set": {
                        "role_fit_result":    role_fit,
                        "transcript_json_path": str(json_path),
                    }},
                )
                print(f"  [OK] role_fit_score={new_score}, decision={new_decision}")
                fixed += 1

            except Exception as e:
                errors.append(f"{session_id}: {e}")
                print(f"  [ERROR] {e}")

    print(f"\nDone. Fixed {fixed} session(s).")
    if errors:
        print("Errors:", errors)

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
