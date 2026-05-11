import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

from app.config import get_settings
from app.services.json_scoring_service import export_session_json, score_from_json

settings = get_settings()

async def fix_session(sid: str):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client[settings.mongodb_db_name]

    doc = await db.sessions.find_one({"_id": ObjectId(sid)})
    if not doc:
        print(f"Session {sid} not found")
        return

    print(f"Session {sid}: status={doc.get('status')}, final_score={doc.get('final_score')}")

    # Export transcript.json
    print("Exporting transcript.json...")
    json_path = export_session_json(
        session_id=sid,
        session_doc=doc,
        upload_dir=settings.upload_path,
    )
    print(f"Written to {json_path}")

    # Save path to MongoDB
    await db.sessions.update_one(
        {"_id": ObjectId(sid)},
        {"$set": {"transcript_json_path": str(json_path)}},
    )

    # Run role-fit scoring
    print("Running role-fit scoring...")
    role_fit = await score_from_json(json_path)
    print(f"Role-fit result: decision={role_fit.get('decision')}, score={role_fit.get('role_fit_score')}")

    # Save to MongoDB
    await db.sessions.update_one(
        {"_id": ObjectId(sid)},
        {"$set": {
            "role_fit_result": role_fit,
            "role_fit_scored_at": __import__('datetime').datetime.now(__import__('datetime').timezone.utc),
        }},
    )
    print(f"Done! {sid} -> {role_fit}")

async def main():
    await fix_session("69ff0be9559db3c904d71e7a")

asyncio.run(main())