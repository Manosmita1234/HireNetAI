"""
services/scoring_service.py – Score aggregation for interview answers and sessions.

Per-answer score = average of 4 LLM sub-scores + length_bonus:
  - clarity_score, confidence_score, logic_score, relevance_score (each 0–10)
  - length_bonus = min(word_count / 200, 1.0) * 0.5  (up to +0.5 for long answers)
  - floor = 3.0 for non-empty transcripts

Session verdict (final score = average of all answer scores):
  ≥ 8.0 → Highly Recommended
  ≥ 6.0 → Recommended
  ≥ 4.0 → Average
   < 4.0 → Not Recommended
"""

from typing import Dict, Any, List

from app.models.interview import Answer


def score_single_answer(answer: Answer) -> float:
    """
    Compute the final score (0–10) for one recorded answer.

    The score is a weighted average of the 4 LLM sub-scores plus a length bonus:
      - clarity_score (0–10):    How clearly the candidate expressed their thoughts
      - confidence_score (0–10): How confident they sounded
      - logic_score (0–10):      How logical and structured their reasoning was
      - relevance_score (0–10):  How on-topic and relevant their answer was
      - length_bonus:            up to +0.5 for answers with 200+ words

    Floor = 3.0 (non-empty transcript minimum, per report specification).
    Ceiling = 10.0.

    If the candidate did not provide an answer (empty transcript), return 0 immediately.
    """
    transcript = getattr(answer, 'transcript', None) or ""
    if not transcript.strip():
        return 0.0

    if not answer.llm_evaluation:
        return 0.0

    base_score = (
        answer.llm_evaluation.clarity_score
        + answer.llm_evaluation.confidence_score
        + answer.llm_evaluation.logic_score
        + answer.llm_evaluation.relevance_score
    ) / 4.0

    word_count = len(transcript.split())
    length_bonus = min(word_count / 200.0, 1.0) * 0.5

    final = base_score + length_bonus
    final = max(3.0, min(10.0, final))
    return round(final, 2)


def aggregate_session_score(answers: List[Answer]) -> Dict[str, Any]:
    """
    Average the per-answer scores across all answers to get the session's final score.
    Then maps the score to a hiring recommendation category.
    """
    if not answers:
        return {"final_score": 0.0, "category": "Not Recommended"}

    total = sum(a.answer_final_score for a in answers)
    final_score = round(total / len(answers), 2)

    if final_score >= 8.0:
        category = "Highly Recommended"
    elif final_score >= 6.0:
        category = "Recommended"
    elif final_score >= 4.0:
        category = "Average"
    else:
        category = "Not Recommended"

    return {"final_score": final_score, "category": category}
