"""
services/llm_service.py – LLM-based interview answer evaluation using OpenAI's GPT.

What this module does:
  - Sends the interview question + the candidate's transcript to a GPT model
  - The model acts as an expert HR interviewer and returns structured evaluation data
  - We parse the JSON response into a typed LLMEvaluation Pydantic model

Evaluation dimensions the LLM scores:
  - clarity_score (0-10):        How clearly the candidate expressed their thoughts
  - confidence_score (0-10):     How confident they sounded in their answer
  - logic_score (0-10):          How logical and structured was their reasoning
  - relevance_score (0-10):      How on-topic and relevant their answer was
  - communication_level:         "Low" | "Medium" | "High"
  - personality_traits:          leadership, emotional_stability, honesty, confidence (0-10 each)
  - strengths, weaknesses:       lists of observed traits
  - overall_score (0-10):        single composite score
  - final_verdict:               recommendation category
  - reasoning:                   one-paragraph written evaluation

Fallback behavior:
  - Empty transcript → returns zeroed-out evaluation immediately (no API call wasted)
  - LLM error →      returns mid-range (5/10) neutral scores so the pipeline continues
"""

import json
import re
from typing import Any, Dict

import openai
from app.config import get_settings
from app.models.interview import LLMEvaluation  # Pydantic model the parsed JSON maps to

settings = get_settings()

# ── System prompt template ─────────────────────────────────────────────────────
# The {question} and {transcript} placeholders are filled in at runtime.
# Double curly braces {{ }} are Python's way to include literal { } in f-strings.
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
    """
    Extracts and parses the first JSON object from the LLM's raw text response.

    Even when we ask for "only JSON", GPT sometimes wraps the JSON in markdown
    code fences like ```json ... ```. This regex finds the outermost { ... }
    block regardless of surrounding text.

    Raises ValueError if no JSON object is found.
    """
    match = re.search(r"\{[\s\S]+\}", text)  # [\s\S]+ matches newlines too
    if match:
        return json.loads(match.group())
    raise ValueError(f"No JSON found in LLM response: {text[:300]}")


async def evaluate_answer(question: str, transcript: str) -> LLMEvaluation:
    """
    Send one question + transcript to the LLM and parse the evaluation response.

    Args:
        question:   the interview question that was asked
        transcript: what the candidate said (from WhisperX)

    Returns:
        LLMEvaluation Pydantic model with all scores and insights

    Error handling:
        - Empty transcript → return zeroed evaluation (skip API call)
        - Any exception    → return neutral mid-range evaluation (pipeline continues)
    """
    # ── Guard: skip API call if nothing was transcribed ─────────────────────
    if not transcript or not transcript.strip():
        # Return all-zero scores since there was no answer to evaluate
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

    # Fill in the prompt template with the actual question and transcript
    prompt = EVALUATION_PROMPT.format(question=question, transcript=transcript)

    try:
        # Create an async OpenAI client (supports both OpenAI and compatible APIs like Ollama)
        client = openai.AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,  # can point to a local model server
        )

        response = await client.chat.completions.create(
            model=settings.openai_model,  # e.g. "gpt-4o-mini"
            messages=[
                {"role": "system", "content": "You are an expert interview evaluator. Return only JSON."},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.3,  # low temperature = more consistent, deterministic scores
            max_tokens=1024,  # enough room for the full JSON response
        )

        # Extract the text content from the first response choice
        raw = response.choices[0].message.content or ""
        # Parse the JSON string → Python dict → Pydantic model (validates field types)
        data = _extract_json(raw)
        return LLMEvaluation(**data)

    except Exception as exc:
        # Log but don't crash — return neutral mid-range scores as a fallback
        # so the rest of the pipeline (scoring, saving to DB) can still complete
        print(f"[LLM] Evaluation failed: {exc}")
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
