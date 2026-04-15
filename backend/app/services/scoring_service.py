"""
services/scoring_service.py – Score aggregation for interview answers and sessions.

Per-answer score = average of 4 LLM sub-scores:
  - clarity_score, confidence_score, logic_score, relevance_score (each 0–10)

Session verdict (final score = average of all answer scores):
  ≥ 8.0 → Highly Recommended
  ≥ 6.0 → Recommended
  ≥ 4.0 → Average
   < 4.0 → Not Recommended
"""

from typing import Dict, Any, List

from app.models.interview import Answer  # Pydantic model with all answer fields


def score_single_answer(answer: Answer) -> float:
    """
    Compute the final score (0–10) for one recorded answer.

    The score is a simple average of the 4 LLM sub-scores:
      - clarity_score (0–10):    How clearly the candidate expressed their thoughts
      - confidence_score (0–10): How confident they sounded
      - logic_score (0–10):      How logical and structured their reasoning was
      - relevance_score (0–10):  How on-topic and relevant their answer was

    If the candidate did not provide an answer (empty transcript), return 0 immediately.

    Emotion confidence, communication level, and hesitation are shown separately
    in the UI for transparency but do not affect this score.

    Final score is rounded to 2 decimal places.
    """
    # ── Unanswered question: return 0 ───────────────────────────────────────────
    transcript = getattr(answer, 'transcript', None) or ""
    if not transcript.strip():
        return 0.0

    # ── Average the 4 LLM sub-scores ──────────────────────────────────────────
    if not answer.llm_evaluation:
        return 0.0

    total = (
        answer.llm_evaluation.clarity_score
        + answer.llm_evaluation.confidence_score
        + answer.llm_evaluation.logic_score
        + answer.llm_evaluation.relevance_score
    )
    return round(total / 4.0, 2)


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
