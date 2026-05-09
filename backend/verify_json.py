import asyncio
import json
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()

json_path = Path(settings.upload_path) / "69fea6e6dffa888081475def" / "transcript.json"
with open(json_path) as f:
    d = json.load(f)
print("session_final_score:", d["session_final_score"])
print("category:", d["category"])
for a in d["answers"]:
    print(f"  Q{a['question_number']}: score={a['answer_score']} transcript={a['transcript'][:50]}")
