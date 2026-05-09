import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()
client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.mongodb_db_name]

async def check():
    cursor = db["sessions"].find({})
    async for doc in cursor:
        rfr = doc.get("role_fit_result")
        rfs = rfr.get("role_fit_score") if rfr else None
        tid = doc.get("transcript_json_path")
        sid = str(doc["_id"])
        print(sid[:12], "| role_fit_score=", rfs, "| hasTranscriptJson=", bool(tid), "| status=", doc.get("status"))

asyncio.run(check())
client.close()
