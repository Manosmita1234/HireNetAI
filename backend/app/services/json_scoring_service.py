"""
services/json_scoring_service.py – Interview transcript JSON export and role-fit AI scoring.

Inspired by the ISP blueprint (github.com/Imtry100/ISP) which stores transcripts/
alongside processed videos in a flat folder layout.

Two public functions:

  export_session_json(session_id, session_doc, upload_dir)
    ── Builds a well-structured JSON object from the fully-processed session document
       and writes it to:   uploads/<session_id>/transcript.json
    ── Returns the path to the file so subsequent steps can read it directly.

  score_from_json(json_path, role_applied, candidate_name)
    ── Reads transcript.json from disk.
    ── Sends a condensed version to GPT with a role-fit evaluation prompt.
    ── Returns a RoleFitResult dict:
           {
             "role_fit_score":  int (0-100),
             "decision":        "Hire" | "Consider" | "Reject",
             "strengths":       list[str],
             "concerns":        list[str],
             "recommendation":  str  (2-3 sentence written justification)
           }

Saving the JSON to disk means:
  • The transcript is human-readable without querying MongoDB.
  • The file can be opened by any other tool (notebooks, scripts, analytics) independently.
  • Re-scoring is trivial: just call score_from_json() again on the same file.
"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import openai

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── JSON schema builder ────────────────────────────────────────────────────────

def _build_session_json(session_id: str, doc: dict) -> dict:
    """
    Converts a raw MongoDB session document into a clean, human-readable dict
    that will be saved as transcript.json.

    We intentionally exclude raw frame_emotions and word_timestamps (very verbose)
    from the top-level view — they are preserved under each answer for completeness
    but their inclusion is controlled to keep the file a reasonable size.
    """
    answers_out = []
    for idx, a in enumerate(doc.get("answers", []), start=1):
        emotion_dist: dict = a.get("emotion_distribution", {})

        # Find the single most-expressed emotion (the "dominant" one)
        dominant_emotion = (
            max(emotion_dist, key=emotion_dist.get) if emotion_dist else "unknown"
        )

        # Flatten LLM evaluation scores to a simple dict (skip nested personality_traits detail)
        llm_eval = a.get("llm_evaluation") or {}
        llm_scores = {
            "clarity":             llm_eval.get("clarity_score", 0),
            "confidence":          llm_eval.get("confidence_score", 0),
            "logic":               llm_eval.get("logic_score", 0),
            "relevance":           llm_eval.get("relevance_score", 0),
            "communication_level": llm_eval.get("communication_level", "Low"),
            "overall":             llm_eval.get("overall_score", 0),
            "final_verdict":       llm_eval.get("final_verdict", "Not Recommended"),
            "strengths":           llm_eval.get("strengths", []),
            "weaknesses":          llm_eval.get("weaknesses", []),
            "reasoning":           llm_eval.get("reasoning", ""),
            "personality_traits":  llm_eval.get("personality_traits", {}),
        }

        answers_out.append({
            "question_number":    idx,
            "question_id":        a.get("question_id", ""),
            "question":           a.get("question_text", ""),
            "transcript":         a.get("transcript", ""),          # WhisperX text
            "hesitation_score":   a.get("hesitation_score", 0.0),   # 0-10 (lower = better)
            "pause_count":        a.get("pause_count", 0),
            "long_pauses":        a.get("long_pauses", []),          # list of {after_word, duration, at_time}
            "confidence_index":   a.get("confidence_index", 0.0),   # 0-10 (higher = more confident)
            "nervousness_score":  a.get("nervousness_score", 0.0),  # 0-10 (higher = more nervous)
            "emotion_distribution": emotion_dist,                    # {emotion: percentage}
            "dominant_emotion":   dominant_emotion,
            "word_timestamps":    a.get("word_timestamps", []),      # [{word, start, end, score}]
            "llm_scores":         llm_scores,
            "answer_score":       a.get("answer_final_score", 0.0),  # 0-10 weighted score
        })

    return {
        "session_id":       session_id,
        "candidate_name":   doc.get("candidate_name", "Unknown"),
        "candidate_email":  doc.get("candidate_email", ""),
        "role_applied":     doc.get("role_applied", "Not specified"),
        "exported_at":      datetime.now(timezone.utc).isoformat(),
        "session_final_score": doc.get("final_score", 0.0),
        "category":         doc.get("category", "Not Recommended"),
        "answers":          answers_out,
    }


# ── Public: export to disk ─────────────────────────────────────────────────────

def export_session_json(
    session_id: str,
    session_doc: dict,
    upload_dir: Path,
) -> Path:
    """
    Build the transcript JSON and write it to:
        <upload_dir>/<session_id>/transcript.json

    This mirrors the ISP blueprint's folder layout:
        uploads/
          <session_id>/
            q1.webm          ← recorded video (uploaded earlier)
            q1.wav           ← extracted audio
            transcript.json  ← ★ THIS FILE

    The folder must already exist (created by the upload router).
    Returns the Path to the written file.
    """
    session_dir = upload_dir / session_id
    # Ensure the directory exists (it should, but mkdir is idempotent)
    session_dir.mkdir(parents=True, exist_ok=True)

    json_path = session_dir / "transcript.json"

    # Build the structured dict
    payload = _build_session_json(session_id, session_doc)

    # Write with pretty-printing (indent=2) for human readability
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=str)

    logger.info("[JSON] Transcript exported to %s (%d bytes)", json_path, json_path.stat().st_size)
    return json_path


# ── GPT role-fit scoring prompt ────────────────────────────────────────────────

_ROLE_FIT_SYSTEM_PROMPT = """\
You are a senior HR analyst and technical interviewer reviewing a completed job interview.
You will receive a structured JSON summary of a candidate's interview: their transcribed answers,
emotion/confidence data, and per-answer AI scores.

YOUR TASK:
Evaluate whether this candidate is a fit for the role they applied for.

SCORING SCALE (role_fit_score 0–100):
  80–100 → Hire      (strong candidate, clearly qualified, confident communicator)
  50–79  → Consider  (mixed signals, some strengths, needs further evaluation)
  0–49   → Reject    (significant gaps, poor communication, or lack of substance)

RETURN ONLY this exact JSON object — no markdown, no explanation outside JSON:
{
  "role_fit_score": <int 0-100>,
  "decision": "<Hire | Consider | Reject>",
  "strengths": ["<observed strength 1>", "<observed strength 2>", "<observed strength 3>"],
  "concerns":  ["<concern 1>", "<concern 2>"],
  "recommendation": "<2-3 sentence professional hiring justification>"
}
"""

_ROLE_FIT_USER_TEMPLATE = """\
CANDIDATE: {candidate_name}
ROLE APPLIED: {role_applied}
SESSION SCORE: {session_final_score}/10  |  CATEGORY: {category}

INTERVIEW SUMMARY ({answer_count} questions):

{qa_summary}

---
Based on the interview above, provide your role-fit evaluation as JSON.
"""


def _build_qa_summary(answers: List[dict]) -> str:
    """
    Builds a compact text block from the answers list.
    Each entry shows the question, transcript, key emotion data, and LLM scores.
    We keep it compact to avoid exceeding GPT token limits.
    """
    lines = []
    for a in answers:
        lines.append(f"Q{a['question_number']}: {a['question']}")
        lines.append(f"  Answer: {(a['transcript'] or '[no response]')[:600]}")  # cap at 600 chars

        # Emotion summary in one line
        dominant = a.get("dominant_emotion", "unknown")
        conf = a.get("confidence_index", 0.0)
        hes = a.get("hesitation_score", 0.0)
        lines.append(f"  Emotion: {dominant} | Confidence: {conf:.1f}/10 | Hesitation: {hes:.1f}/10")

        # LLM score summary
        ls = a.get("llm_scores", {})
        lines.append(
            f"  LLM Scores → Clarity:{ls.get('clarity',0)} Logic:{ls.get('logic',0)} "
            f"Relevance:{ls.get('relevance',0)} Overall:{ls.get('overall',0)}/10"
        )
        lines.append(f"  Answer Score: {a.get('answer_score', 0.0):.2f}/10")
        lines.append("")  # blank line between answers
    return "\n".join(lines)


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from the LLM response."""
    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


def _fallback_role_fit(reason: str) -> Dict[str, Any]:
    """Returns a neutral fallback when the LLM call fails."""
    logger.warning("[JSON Scoring] Using fallback role-fit result. Reason: %s", reason)
    return {
        "role_fit_score": 50,
        "decision":       "Consider",
        "strengths":      ["See individual answer scores for details"],
        "concerns":       ["Role-fit AI scoring unavailable"],
        "recommendation": (
            f"Automated role-fit scoring was unavailable ({reason[:120]}). "
            "Please review the transcript.json file and individual scores manually."
        ),
    }


# ── Public: score from JSON file ───────────────────────────────────────────────

async def score_from_json(json_path: Path) -> Dict[str, Any]:
    """
    Reads transcript.json from disk and calls GPT to determine role fit.

    Args:
        json_path: Path to the transcript.json file written by export_session_json()

    Returns:
        dict with keys: role_fit_score, decision, strengths, concerns, recommendation

    This function is separate from export_session_json() so it can be called independently
    by the /admin/session/{id}/rescore endpoint without re-exporting the JSON.
    """
    # ── Read the transcript file ───────────────────────────────────────────────
    if not json_path.exists():
        return _fallback_role_fit(f"transcript.json not found at {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    candidate_name     = data.get("candidate_name", "Unknown")
    role_applied       = data.get("role_applied", "Not specified")
    session_final_score = data.get("session_final_score", 0.0)
    category           = data.get("category", "Unknown")
    answers            = data.get("answers", [])

    # ── Guard: skip GPT if no API key ─────────────────────────────────────────
    if not settings.openai_api_key:
        logger.info("[JSON Scoring] No OpenAI API key – returning fallback.")
        return _fallback_role_fit("OpenAI API key not configured")

    qa_summary = _build_qa_summary(answers)

    user_prompt = _ROLE_FIT_USER_TEMPLATE.format(
        candidate_name=candidate_name,
        role_applied=role_applied,
        session_final_score=session_final_score,
        category=category,
        answer_count=len(answers),
        qa_summary=qa_summary,
    )

    try:
        client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _ROLE_FIT_SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.2,    # low temp → consistent, deterministic output
            max_tokens=800,
        )

        raw = response.choices[0].message.content or ""
        logger.debug("[JSON Scoring] Raw LLM response: %s", raw[:500])
        result = _extract_json(raw)

        # Validate and clamp the score
        result["role_fit_score"] = max(0, min(100, int(result.get("role_fit_score", 50))))

        # Ensure decision is one of the three valid values
        if result.get("decision") not in ("Hire", "Consider", "Reject"):
            score = result["role_fit_score"]
            result["decision"] = "Hire" if score >= 80 else ("Consider" if score >= 50 else "Reject")

        logger.info(
            "[JSON Scoring] Role-fit done for '%s' → %s (score=%d)",
            candidate_name, result.get("decision"), result.get("role_fit_score", 0),
        )
        return result

    except Exception as exc:
        logger.error("[JSON Scoring] LLM call failed: %s", exc)
        return _fallback_role_fit(str(exc)[:200])
