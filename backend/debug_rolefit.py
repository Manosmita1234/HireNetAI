import asyncio
import logging
logging.basicConfig(level=logging.DEBUG)

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pathlib import Path
from app.config import get_settings
from app.services.json_scoring_service import score_from_json

settings = get_settings()
client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.mongodb_db_name]

async def test():
    cursor = db["sessions"].find({"role_fit_result.role_fit_score": 0})
    async for doc in cursor:
        sid = str(doc["_id"])
        json_path = Path(settings.upload_path) / sid / "transcript.json"

        import json
        with open(json_path) as f:
            d = json.load(f)
        print("SID:", sid[:12])
        print("  session_final_score:", d.get("session_final_score"))
        print("  category:", d.get("category"))
        for a in d.get("answers", []):
            print("  ans_score:", a.get("answer_score"), "| transcript:", a.get("transcript", "")[:60])

        result = await score_from_json(json_path)
        print("  Result:", result)
        print()

asyncio.run(test())
client.close()
