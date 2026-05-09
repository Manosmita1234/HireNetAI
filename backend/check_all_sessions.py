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
        rfr = doc.get("role_fit_result")
        rfs = rfr.get("role_fit_score") if rfr else None
        tf = doc.get("transcript_json_path")
        fname = tf.split("/")[-1] if tf else None
        print(sid[:12], "| rfs=", rfs, "| json=", fname)

asyncio.run(check())
client.close()
