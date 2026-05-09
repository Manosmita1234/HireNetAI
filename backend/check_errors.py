import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from app.config import get_settings

settings = get_settings()
client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.mongodb_db_name]

async def check():
    # Check 69fea2b which has ERROR transcripts
    doc = await db["sessions"].find_one({})
    # Find sessions with ERROR in transcript
    cursor = db["sessions"].find({})
    async for doc in cursor:
        sid = str(doc["_id"])
        for a in doc.get("answers", []):
            t = a.get("transcript", "")
            if "ERROR" in t or t.startswith("["):
                print(sid[:12], "| transcript:", t[:80])

asyncio.run(check())
client.close()
