"""
services/llm_service.py – LLM-based interview answer evaluation.

Sends (question + transcript) to an OpenAI-compatible chat model and
parses the structured JSON response into an LLMEvaluation object.
"""

import asyncio
import json
import re
from typing import Any, Dict

import openai
from app.config import get_settings
from app.models.interview import LLMEvaluation

settings = get_settings()

# ── Prompt template ──────────────────────────────────────────────────────────
EVALUATION_PROMPT = """
You are an expert HR interviewer and psychologist evaluating a candidate's
video interview response. Evaluate the answer below and return ONLY a valid
JSON object (no markdown, no explanation outside JSON).

INTERVIEW QUESTION:
{question}

CANDIDATE'S TRANSCRIPT:
{transcript}

Return this exact JSON structure (all scores are integers 0-10):

{{
  "clarity_score": <int>,
  "confidence_score": <int>,
  "logic_score": <int>,
  "relevance_score": <int>,
  "communication_level": "<Low | Medium | High>",
  "personality_traits": {{
    "leadership": <int>,
    "emotional_stability": <int>,
    "honesty": <int>,
    "confidence": <int>
  }},
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "overall_score": <int>,
  "final_verdict": "<Highly Recommended | Recommended | Average | Not Recommended>",
  "reasoning": "<one paragraph>"
}}
"""


def _extract_json(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from the model response."""
    # Try to find JSON block
    match = re.search(r"\{[\s\S]+\}", text)
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


async def evaluate_answer(question: str, transcript: str) -> LLMEvaluation:
    """
    Call the LLM to evaluate a single answer.
    Returns an LLMEvaluation Pydantic model.
    Falls back to a default evaluation on error.
    """
    if not transcript or not transcript.strip():
        # No speech detected → lowest scores
        return LLMEvaluation(
            clarity_score=0,
            confidence_score=0,
            logic_score=0,
            relevance_score=0,
            communication_level="Low",
            personality_traits={"leadership": 0, "emotional_stability": 0, "honesty": 0, "confidence": 0},
            strengths=[],
            weaknesses=["No spoken content detected"],
            overall_score=0,
            final_verdict="Not Recommended",
            reasoning="The candidate did not provide a spoken answer.",
        )

    prompt = EVALUATION_PROMPT.format(question=question, transcript=transcript)

    try:
        client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        )
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": "You are an expert interview evaluator. Return only JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1024,
        )
        raw = response.choices[0].message.content or ""
        data = _extract_json(raw)
        return LLMEvaluation(**data)

    except Exception as exc:
        print(f"[LLM] Evaluation failed: {exc}")
        # Return a neutral fallback so the pipeline does not break
        return LLMEvaluation(
            clarity_score=5,
            confidence_score=5,
            logic_score=5,
            relevance_score=5,
            communication_level="Medium",
            personality_traits={"leadership": 5, "emotional_stability": 5, "honesty": 5, "confidence": 5},
            strengths=["Unable to evaluate (LLM error)"],
            weaknesses=[],
            overall_score=5,
            final_verdict="Average",
            reasoning=f"LLM evaluation unavailable: {str(exc)[:200]}",
        )
