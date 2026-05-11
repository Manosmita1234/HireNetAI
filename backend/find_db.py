import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()

async def check():
    for db_name in ["hirenet", "hirenet_ai", "video_interview", "interview"]:
        client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=3000)
        try:
            db = client[db_name]
            colls = await db.list_collection_names()
            print(f"{db_name}: collections={colls}")
            for c in colls:
                cnt = await db[c].count_documents({})
                print(f"  {c}: {cnt} docs")
        except Exception as e:
            print(f"{db_name}: {e}")
        client.close()

asyncio.run(check())
