"""
services/evaluation_service.py – Holistic AI Interview Evaluation Engine.

Reads ALL question-answer pairs from a completed interview session and calls
the LLM once to produce a single, coherent holistic evaluation covering:
  - overall_score (0-100)
  - technical_score (0-100)
  - communication_score (0-100)
  - consistency_score (0-100)
  - decision: "Selected" | "Borderline" | "Rejected"
  - strengths, weaknesses (lists)
  - final_summary (3-5 line hiring justification)
"""

import json
import logging
import re
from typing import Any, Dict, List

import openai

from app.config import get_settings
from app.schemas.evaluation import EvaluationRequest, HolisticEvaluationResult

logger = logging.getLogger(__name__)
settings = get_settings()

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = (
    "You are the AI Interview Evaluation Engine for HireNetAI. "
    "You have received a completed video interview session with all question-answer pairs. "
    "Each answer was transcribed using WhisperX. "
    "Evaluate the candidate holistically — consider ALL answers before making any judgment. "
    "Return ONLY valid JSON. No markdown. No explanation outside JSON."
)

# ── User prompt template ──────────────────────────────────────────────────────
_USER_PROMPT_TEMPLATE = """\
Candidate: {candidate_name}
Role Applied: {role_applied}

COMPLETE INTERVIEW TRANSCRIPT ({count} questions):

{qa_block}

---
Evaluate this candidate holistically across ALL answers above.
Consider:
- Technical knowledge and depth
- Communication clarity and articulation
- Logical thinking and structure
- Emotional stability and composure
- Consistency and coherence across all answers

Return EXACTLY this JSON (all scores are integers 0-100):

{{
  "overall_score": <int>,
  "technical_score": <int>,
  "communication_score": <int>,
  "consistency_score": <int>,
  "decision": "<Selected | Borderline | Rejected>",
  "strengths": ["<string>", "<string>", "<string>"],
  "weaknesses": ["<string>", "<string>", "<string>"],
  "final_summary": "<3-5 line professional hiring justification>"
}}
"""


def _build_qa_block(questions: list) -> str:
    """Format all Q&A items into a readable block for the prompt."""
    lines = []
    for q in questions:
        lines.append(f"Q{q.question_id}: {q.question_text}")
        lines.append(f"A: {q.answer_text or '[No response]'}")
        if q.emotion_summary:
            lines.append(f"   [Emotion: {q.emotion_summary}]")
        lines.append("")  # blank line between pairs
    return "\n".join(lines)


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from the LLM response."""
    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


def _fallback_result(reason: str) -> HolisticEvaluationResult:
    """Return a neutral mid-range result when the LLM call fails."""
    logger.warning("[EvalEngine] Using fallback result. Reason: %s", reason)
    return HolisticEvaluationResult(
        overall_score=50,
        technical_score=50,
        communication_score=50,
        consistency_score=50,
        decision="Borderline",
        strengths=["Evaluation unavailable – see individual answer scores"],
        weaknesses=["Holistic LLM evaluation could not be completed"],
        final_summary=(
            f"Automated holistic evaluation was unavailable ({reason[:120]}). "
            "Please review individual answer scores and transcripts manually "
            "to make a final hiring decision."
        ),
    )


async def run_holistic_evaluation(
    request: EvaluationRequest,
) -> HolisticEvaluationResult:
    """
    Send all Q&A pairs to the LLM in one shot and return a HolisticEvaluationResult.

    Falls back to neutral mid-range scores if:
    - LLM is not configured (no API key)
    - LLM call fails for any reason
    - Response cannot be parsed as valid JSON
    """
    if not settings.openai_api_key:
        logger.info("[EvalEngine] No OpenAI API key configured – skipping LLM call.")
        return _fallback_result("LLM not configured")

    qa_block = _build_qa_block(request.questions)
    user_prompt = _USER_PROMPT_TEMPLATE.format(
        candidate_name=request.candidate_name,
        role_applied=request.role_applied,
        count=len(request.questions),
        qa_block=qa_block,
    )

    try:
        client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,     # low temp for deterministic structured output
            max_tokens=1024,
        )
        raw = response.choices[0].message.content or ""
        logger.debug("[EvalEngine] Raw LLM response: %s", raw[:500])

        data = _extract_json(raw)

        # Clamp all integer scores to 0-100
        for field in ("overall_score", "technical_score", "communication_score",
                      "consistency_score"):
            if field in data:
                data[field] = max(0, min(100, int(data[field])))

        result = HolisticEvaluationResult(**data)
        logger.info(
            "[EvalEngine] Evaluation complete for '%s' – score=%d decision=%s",
            request.candidate_name, result.overall_score, result.decision,
        )
        return result

    except Exception as exc:  # noqa: BLE001
        logger.error("[EvalEngine] LLM call failed: %s", exc)
        return _fallback_result(str(exc)[:200])
