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
        rfr = doc.get("role_fit_result")
        rfs = rfr.get("role_fit_score") if rfr else None
        if rfs == 0:
            print(f"SID: {sid}")
            print(f"  final_score={fs}, rfs={rfs}")
            for a in doc.get("answers", []):
                llm = a.get("llm_evaluation") or {}
                tid = a.get("transcript") or ""
                print(f"  Q{a.get('question_number')}: transcript={tid[:60]}, llm_cl={llm.get('clarity_score')}, ans_score={a.get('answer_final_score')}")

asyncio.run(check())
client.close()
