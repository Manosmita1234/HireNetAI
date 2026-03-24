"""
services/evaluation_service.py – Holistic AI Interview Evaluation Engine.

Unlike llm_service.py which evaluates ONE answer at a time,
this service sends ALL question-answer pairs from the whole interview to GPT
in a single request, giving a bird's-eye holistic assessment.

What it produces:
  - overall_score (0–100):      single composite score (note: 0–100 scale, not 0–10)
  - technical_score (0–100):    depth of technical knowledge shown across all answers
  - communication_score (0–100): clarity and articulation across all answers
  - consistency_score (0–100):  how coherent and consistent the candidate was overall
  - decision:                   "Selected" | "Borderline" | "Rejected"
  - strengths, weaknesses:      observed patterns across ALL answers
  - final_summary:              3–5 line written hiring justification

This is called by finalize_session() in video_processor.py after all answers
are processed and the per-answer scores are already saved.
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

# ── System prompt ──────────────────────────────────────────────────────────────
# This sets the GPT model's "persona" for the entire conversation.
# It is sent as the first message with role="system".
_SYSTEM_PROMPT = (
    "You are the AI Interview Evaluation Engine for HireNetAI. "
    "You have received a completed video interview session with all question-answer pairs. "
    "Each answer was transcribed using WhisperX. "
    "Evaluate the candidate holistically — consider ALL answers before making any judgment. "
    "Return ONLY valid JSON. No markdown. No explanation outside JSON."
)

# ── User prompt template ───────────────────────────────────────────────────────
# Placeholders {candidate_name}, {role_applied}, {count}, {qa_block} are filled in at runtime.
# Double curly braces {{ }} produce literal { } in the f-string output.
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
    """
    Formats all Q&A items into a readable text block to embed in the prompt.

    Example output:
        Q1: Tell me about yourself.
        A: I am a software engineer with 3 years of experience...
           [Emotion: neutral (52%)]

        Q2: Describe a challenge you faced.
        A: I once had to debug a production issue...
    """
    lines = []
    for q in questions:
        lines.append(f"Q{q.question_id}: {q.question_text}")
        lines.append(f"A: {q.answer_text or '[No response]'}")
        if q.emotion_summary:
            # Include the dominant emotion as context for the LLM evaluator
            lines.append(f"   [Emotion: {q.emotion_summary}]")
        lines.append("")  # blank line between Q&A pairs for readability
    return "\n".join(lines)


def _extract_json(text: str) -> Dict[str, Any]:
    """
    Extracts and parses the first JSON object from the LLM's text response.

    GPT sometimes wraps JSON in markdown code fences (```json ... ```).
    The regex \\{[\\s\\S]+\\} finds the outermost { ... } block regardless.

    Raises ValueError if no JSON object can be found.
    """
    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


def _fallback_result(reason: str) -> HolisticEvaluationResult:
    """
    Returns a neutral 50/100 result when the LLM call fails or is not configured.

    This prevents the entire finalization from failing just because the holistic
    evaluation couldn't complete. The per-answer scores are already saved.
    """
    logger.warning("[EvalEngine] Using fallback result. Reason: %s", reason)
    return HolisticEvaluationResult(
        overall_score=50,
        technical_score=50,
        communication_score=50,
        consistency_score=50,
        decision="Borderline",    # neutral verdict when we can't evaluate
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
    Sends the full interview (all Q&A + emotion summaries) to GPT in one call.
    Returns an HolisticEvaluationResult Pydantic model with all holistic scores.

    Fallback cases (returns neutral mid-range scores without crashing):
      - No OpenAI API key configured
      - LLM call fails for any reason (network error, rate limit, etc.)
      - Response cannot be parsed as valid JSON
    """
    # Guard: skip the expensive API call if no key is configured
    if not settings.openai_api_key:
        logger.info("[EvalEngine] No OpenAI API key configured – skipping LLM call.")
        return _fallback_result("LLM not configured")

    # Build the full text block of all questions and answers
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
            base_url=settings.openai_base_url,  # supports local models via compatible APIs
        )
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.2,    # low temperature = more deterministic and structured output
            max_tokens=1024,
        )
        raw = response.choices[0].message.content or ""
        logger.debug("[EvalEngine] Raw LLM response: %s", raw[:500])

        data = _extract_json(raw)

        # Clamp all numeric scores to the valid 0–100 range
        # (GPT occasionally hallucinates values slightly outside the range)
        for field in ("overall_score", "technical_score", "communication_score", "consistency_score"):
            if field in data:
                data[field] = max(0, min(100, int(data[field])))

        # Construct and validate using Pydantic (raises ValidationError on bad structure)
        result = HolisticEvaluationResult(**data)
        logger.info(
            "[EvalEngine] Evaluation complete for '%s' – score=%d decision=%s",
            request.candidate_name, result.overall_score, result.decision,
        )
        return result

    except Exception as exc:
        logger.error("[EvalEngine] LLM call failed: %s", exc)
        return _fallback_result(str(exc)[:200])
