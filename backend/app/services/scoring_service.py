"""
services/scoring_service.py – Score aggregation for interview answers and sessions.

Per-answer score:
  base_score      = (clarity + confidence + logic + relevance) / 4.0
  length_bonus    = min(word_count / 200, 1.0) * 0.5   (max +0.5)
  final_score     = max(3.0, min(10.0, base_score + length_bonus))

Session verdict (average of all valid per-answer scores, score > 0):
  ≥ 8.0 → Highly Recommended
  ≥ 6.0 → Recommended
  ≥ 4.0 → Average
   < 4.0 → Not Recommended
"""

from typing import Dict, Any, List

from app.models.interview import Answer


def score_single_answer(answer: Answer) -> float:
    """
    Compute the final score (0-10) for one recorded answer.

    Formula (per FR-11 and design documentation):
      base_score     = avg of clarity, confidence, logic, relevance (0-10)
      length_bonus   = min(word_count / 200, 1.0) * 0.5   (up to +0.5 for long answers)
      final_score    = max(3.0, min(10.0, base_score + length_bonus))

    If transcript is empty, return 0 immediately.
    """
    transcript = getattr(answer, 'transcript', None) or ""
    if not transcript.strip():
        return 0.0

    if not answer.llm_evaluation:
        return 0.0

    llm = answer.llm_evaluation

    base_score = (
        llm.clarity_score
        + llm.confidence_score
        + llm.logic_score
        + llm.relevance_score
    ) / 4.0

    word_count = len(transcript.split())
    length_bonus = min(word_count / 200.0, 1.0) * 0.5

    final = base_score + length_bonus
    final = max(3.0, min(10.0, final))
    return round(final, 2)


def aggregate_session_score(answers: List[Answer]) -> Dict[str, Any]:
    """
    Average the per-answer scores across all answers (excluding zero scores).

    Session verdict (final score = average of all valid per-answer scores, score > 0):
      ≥ 8.0 → Highly Recommended
      ≥ 6.0 → Recommended
      ≥ 4.0 → Average
       < 4.0 → Not Recommended
    """
    valid = [a.answer_final_score for a in answers if a.answer_final_score > 0]
    if not valid:
        return {"final_score": 0.0, "category": "Not Recommended"}

    total = sum(valid)
    final_score = round(total / len(valid), 2)

    if final_score >= 8.0:
        category = "Highly Recommended"
    elif final_score >= 6.0:
        category = "Recommended"
    elif final_score >= 4.0:
        category = "Average"
    else:
        category = "Not Recommended"

    return {"final_score": final_score, "category": category}
