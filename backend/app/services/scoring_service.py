"""
services/scoring_service.py – Final score aggregation engine.

Weights:
  - LLM Score           : 40 %
  - Emotion Confidence  : 20 %
  - Communication Score : 20 %
  - Hesitation Score    : 20 %   (inverted — lower hesitation → higher score)
"""

from typing import Dict, Any, List

from app.models.interview import Answer


def _communication_score_from_level(level: str) -> float:
    """Convert communication level string to a 0-10 numeric score."""
    mapping = {"High": 10.0, "Medium": 6.0, "Low": 2.0}
    return mapping.get(level, 5.0)


def score_single_answer(answer: Answer) -> float:
    """
    Compute the weighted final score (0-10) for a single answer.
    """
    # ── LLM component (40 %) ─────────────────────────────────────────────────
    llm_score = 0.0
    if answer.llm_evaluation:
        llm_score = float(answer.llm_evaluation.overall_score)
    llm_component = llm_score * 0.40

    # ── Emotion confidence component (20 %) ──────────────────────────────────
    emotion_component = answer.confidence_index * 0.20

    # ── Communication component (20 %) ───────────────────────────────────────
    comm_level = "Low"
    if answer.llm_evaluation:
        comm_level = answer.llm_evaluation.communication_level
    comm_score = _communication_score_from_level(comm_level)
    comm_component = comm_score * 0.20

    # ── Hesitation component (20 %) — inverted ───────────────────────────────
    # hesitation_score is 0-10 where 10 = very hesitant → bad
    hesitation_inverted = max(0.0, 10.0 - answer.hesitation_score)
    hesitation_component = hesitation_inverted * 0.20

    final = llm_component + emotion_component + comm_component + hesitation_component
    return round(min(final, 10.0), 2)


def aggregate_session_score(answers: List[Answer]) -> Dict[str, Any]:
    """
    Average the per-answer scores across all answers in a session.
    Returns final_score (0-10) and category string.
    """
    if not answers:
        return {"final_score": 0.0, "category": "Not Recommended"}

    total = sum(a.answer_final_score for a in answers)
    final_score = round(total / len(answers), 2)

    # ── Category mapping ─────────────────────────────────────────────────────
    if final_score >= 8.0:
        category = "Highly Recommended"
    elif final_score >= 6.0:
        category = "Recommended"
    elif final_score >= 4.0:
        category = "Average"
    else:
        category = "Not Recommended"

    return {"final_score": final_score, "category": category}
