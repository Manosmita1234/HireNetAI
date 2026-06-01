"""
services/adaptive_difficulty_service.py – Adaptive question difficulty selection.

After each answer, the frontend reports simple performance signals:
  - response_duration_seconds: how long the video answer is
  - time_used_ratio: response_duration / expected_duration (0-1+)
  - hesitations: number of pauses detected (if available)

Performance scoring (proxy for LLM evaluation during interview):
  - Strong (>70% time used, adequate duration): +1 to cumulative score
  - Average (40-70% time used): 0 change
  - Weak (<40% time used, very short): -1 to cumulative score

Difficulty bands based on cumulative score:
  - score <= -2: easy
  - -1 to 1: medium
  - score >= 2: hard

Interview ends after MAX_QUESTIONS (5) questions.

Question selection priority:
  1. Unexplored tailored session_questions (if available)
  2. Global questions at target difficulty (not yet used in this session)
  3. Any available global question as fallback
"""

from typing import Dict, Any, Optional, List

MAX_QUESTIONS = 5
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId


DIFFICULTY_ORDER = ["easy", "medium", "hard"]

DIFFICULTY_BANDS = {
    "easy": lambda score: score <= -2,
    "medium": lambda score: -1 <= score <= 1,
    "hard": lambda score: score >= 2,
}


def compute_answer_signal(
    response_duration_seconds: float,
    expected_duration_seconds: float = 120,
    hesitations: int = 0,
) -> int:
    """
    Compute a delta to add to the cumulative performance score
    based on how the candidate performed on this answer.

    Returns: +1 (strong), 0 (average), -1 (weak)
    """
    if expected_duration_seconds <= 0:
        expected_duration_seconds = 120

    time_ratio = response_duration_seconds / expected_duration_seconds

    if time_ratio > 0.7 and response_duration_seconds >= 30:
        return 1
    elif time_ratio < 0.3 or response_duration_seconds < 20:
        return -1
    else:
        return 0


def get_target_difficulty(cumulative_score: int) -> str:
    """
    Map cumulative performance score to a difficulty level.
    """
    if cumulative_score <= -2:
        return "easy"
    elif cumulative_score >= 2:
        return "hard"
    else:
        return "medium"


async def get_next_question(
    session_id: str,
    db: AsyncIOMotorDatabase,
    performance_delta: int,
    previous_difficulty: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Select the next question based on cumulative performance.

    Args:
        session_id: The interview session ID
        db: MongoDB database instance
        performance_delta: +1, 0, or -1 from the last answer
        previous_difficulty: difficulty of the previous question (for tracking)
    """
    session = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not session:
        return {"error": "Session not found"}

    answered_count = len([a for a in session.get("answers", []) if a.get("question_id")])
    if answered_count >= MAX_QUESTIONS:
        return {"done": True, "message": f"Maximum of {MAX_QUESTIONS} questions reached"}

    answers = session.get("answers", [])
    answered_ids = [a.get("question_id") for a in answers if a.get("question_id")]

    used_question_texts = set(session.get("used_question_texts", []))
    if not used_question_texts and answered_ids:
        used_question_texts = set()

    used_question_texts.update([a.get("question_text", "") for a in answers if a.get("question_text")])

    cumulative_score = session.get("adaptive_score", 0) + performance_delta

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "adaptive_score": cumulative_score,
                "used_question_texts": list(used_question_texts),
            }
        },
    )

    target_difficulty = get_target_difficulty(cumulative_score)

    tailored_cursor = db["session_questions"].find({
        "session_id": session_id,
        "text": {"$nin": list(used_question_texts)},
    }).sort("order", 1)

    tailored_question = None
    async for doc in tailored_cursor:
        tailored_question = doc
        break

    if tailored_question:
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {"$addToSet": {"used_question_texts": tailored_question["text"]}},
        )
        return {
            "question": {
                "id": str(tailored_question.get("_id", "")),
                "text": tailored_question["text"],
                "category": tailored_question.get("category", "general"),
                "difficulty": tailored_question.get("difficulty", "medium"),
                "expected_duration_seconds": tailored_question.get("expected_duration_seconds", 120),
            },
            "is_adaptive": True,
            "target_difficulty": target_difficulty,
            "cumulative_score": cumulative_score,
            "is_personalized": True,
        }

    global_cursor = db["questions"].find({
        "difficulty": target_difficulty,
        "text": {"$nin": list(used_question_texts)},
    }).limit(10)

    global_question = None
    async for doc in global_cursor:
        global_question = doc
        break

    if not global_question:
        global_cursor = db["questions"].find({
            "text": {"$nin": list(used_question_texts)},
        }).limit(10)
        async for doc in global_cursor:
            global_question = doc
            break

    if not global_question:
        return {"done": True, "message": "No more questions available"}

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {"$addToSet": {"used_question_texts": global_question["text"]}},
    )

    return {
        "question": {
            "id": str(global_question.get("_id", "")),
            "text": global_question["text"],
            "category": global_question.get("category", "general"),
            "difficulty": global_question.get("difficulty", "medium"),
            "expected_duration_seconds": global_question.get("expected_duration_seconds", 120),
        },
        "is_adaptive": True,
        "target_difficulty": target_difficulty,
        "cumulative_score": cumulative_score,
        "is_personalized": False,
    }


async def initialize_session_adaptive(session_id: str, db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Initialize adaptive tracking on a session and return the first question.
    """
    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "adaptive_score": 0,
                "used_question_texts": [],
            }
        },
        upsert=True,
    )

    session = await db["sessions"].find_one({"_id": ObjectId(session_id)})
    if not session:
        return {"error": "Session not found"}

    tailored_cursor = db["session_questions"].find(
        {"session_id": session_id}
    ).sort("order", 1).limit(1)

    tailored_question = None
    async for doc in tailored_cursor:
        tailored_question = doc
        break

    if tailored_question:
        await db["sessions"].update_one(
            {"_id": ObjectId(session_id)},
            {"$addToSet": {"used_question_texts": tailored_question["text"]}},
        )
        return {
            "question": {
                "id": str(tailored_question.get("_id", "")),
                "text": tailored_question["text"],
                "category": tailored_question.get("category", "general"),
                "difficulty": tailored_question.get("difficulty", "medium"),
                "expected_duration_seconds": tailored_question.get("expected_duration_seconds", 120),
            },
            "is_adaptive": True,
            "target_difficulty": "medium",
            "cumulative_score": 0,
            "is_personalized": True,
        }

    global_cursor = db["questions"].find({}).limit(1)
    global_question = None
    async for doc in global_cursor:
        global_question = doc
        break

    if not global_question:
        return {"done": True, "message": "No questions available"}

    await db["sessions"].update_one(
        {"_id": ObjectId(session_id)},
        {"$addToSet": {"used_question_texts": global_question["text"]}},
    )

    return {
        "question": {
            "id": str(global_question.get("_id", "")),
            "text": global_question["text"],
            "category": global_question.get("category", "general"),
            "difficulty": global_question.get("difficulty", "medium"),
            "expected_duration_seconds": global_question.get("expected_duration_seconds", 120),
        },
        "is_adaptive": True,
        "target_difficulty": "medium",
        "cumulative_score": 0,
        "is_personalized": False,
    }