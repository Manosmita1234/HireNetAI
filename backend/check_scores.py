import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()
client = AsyncIOMotorClient(settings.mongodb_url)
db = client[settings.mongodb_db_name]

async def check():
    cursor = db["sessions"].find({})
    async for doc in cursor:
        sid = str(doc["_id"])
        fs = doc.get("final_score")
        cat = doc.get("category")
        rfr = doc.get("role_fit_result")
        rfs = rfr.get("role_fit_score") if rfr else None
        print(sid[:12], "| final_score=", fs, "| cat=", cat, "| rfs=", rfs)

asyncio.run(check())
client.close()
