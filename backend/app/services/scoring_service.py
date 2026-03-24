"""
services/scoring_service.py – Weighted score aggregation for interview answers and sessions.

This module is the final step of the AI pipeline. It takes the raw scores
produced by WhisperX (hesitation), DeepFace (confidence_index), and GPT (llm_evaluation)
and combines them into a single readable score.

Score Weights (per answer):
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Component              │ Source           │ Weight │ Note           │
  ├─────────────────────────────────────────────────────────────────────┤
  │ LLM overall_score      │ GPT evaluation   │  40%   │ most important │
  │ Emotion confidence     │ DeepFace         │  20%   │                │
  │ Communication level    │ GPT evaluation   │  20%   │ Low/Med/High   │
  │ Hesitation (inverted)  │ WhisperX pauses  │  20%   │ lower = better │
  └─────────────────────────────────────────────────────────────────────┘

Session verdict thresholds:
  ≥ 8.0 → Highly Recommended
  ≥ 6.0 → Recommended
  ≥ 4.0 → Average
   < 4.0 → Not Recommended
"""

from typing import Dict, Any, List

from app.models.interview import Answer  # Pydantic model with all answer fields


def _communication_score_from_level(level: str) -> float:
    """
    Converts the LLM's textual communication level to a numeric 0–10 score.

    "High"   → 10.0 (excellent communicator)
    "Medium" → 6.0  (average communicator)
    "Low"    → 2.0  (poor communicator)
    Unknown  → 5.0  (neutral fallback)
    """
    mapping = {"High": 10.0, "Medium": 6.0, "Low": 2.0}
    return mapping.get(level, 5.0)


def score_single_answer(answer: Answer) -> float:
    """
    Compute the weighted final score (0–10) for one recorded answer.

    Each component contributes a fraction of the total score:

      LLM component (40%):
        llm_evaluation.overall_score × 0.40
        e.g. GPT score = 8.0 → contributes 3.2

      Emotion confidence component (20%):
        confidence_index × 0.20
        e.g. confidence_index = 7.0 → contributes 1.4

      Communication component (20%):
        _communication_score_from_level(communication_level) × 0.20
        e.g. "High" → 10.0 × 0.20 = 2.0

      Hesitation component (20%) — INVERTED:
        (10.0 - hesitation_score) × 0.20
        e.g. hesitation_score = 3.0 → (10-3) × 0.20 = 1.4
        (lower hesitation = more fluent = higher score)

    Final score is capped at 10.0 and rounded to 2 decimal places.
    """
    # ── LLM component (40%) ────────────────────────────────────────────────────
    llm_score = 0.0
    if answer.llm_evaluation:
        llm_score = float(answer.llm_evaluation.overall_score)
    llm_component = llm_score * 0.40

    # ── Emotion confidence component (20%) ─────────────────────────────────────
    # confidence_index comes from DeepFace emotion analysis (happy + neutral %)
    emotion_component = answer.confidence_index * 0.20

    # ── Communication level component (20%) ────────────────────────────────────
    comm_level = "Low"  # default if LLM evaluation is unavailable
    if answer.llm_evaluation:
        comm_level = answer.llm_evaluation.communication_level
    comm_score = _communication_score_from_level(comm_level)
    comm_component = comm_score * 0.20

    # ── Hesitation component (20%) — inverted ──────────────────────────────────
    # hesitation_score is 0–10 where 10 = very hesitant (many long pauses)
    # We invert it so that low hesitation produces a high score component
    # max(0.0, ...) ensures the value never goes negative (in case hesitation_score > 10)
    hesitation_inverted = max(0.0, 10.0 - answer.hesitation_score)
    hesitation_component = hesitation_inverted * 0.20

    # ── Final weighted sum ─────────────────────────────────────────────────────
    final = llm_component + emotion_component + comm_component + hesitation_component
    return round(min(final, 10.0), 2)  # cap at 10, round to 2 decimal places


def aggregate_session_score(answers: List[Answer]) -> Dict[str, Any]:
    """
    Average the per-answer scores across all answers to get the session's final score.
    Then maps the score to a hiring recommendation category.

    Args:
        answers: list of Answer objects that already have answer_final_score populated

    Returns:
        {
            "final_score": float,   # 0–10 average across all answers
            "category": str         # hiring recommendation verdict
        }
    """
    # Edge case: if no answers were submitted, default to the worst verdict
    if not answers:
        return {"final_score": 0.0, "category": "Not Recommended"}

    # Sum all per-answer scores and divide by the number of answers
    total = sum(a.answer_final_score for a in answers)
    final_score = round(total / len(answers), 2)

    # ── Map score → hiring verdict ─────────────────────────────────────────────
    if final_score >= 8.0:
        category = "Highly Recommended"  # exceptional candidate
    elif final_score >= 6.0:
        category = "Recommended"         # solid candidate, worth interviewing further
    elif final_score >= 4.0:
        category = "Average"             # borderline — might need more review
    else:
        category = "Not Recommended"     # poor performance across answers

    return {"final_score": final_score, "category": category}
