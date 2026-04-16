"""
services/scoring_service.py – Score aggregation for interview answers and sessions.

Per-answer score = weighted average of 4 LLM sub-scores with bonuses:
  - clarity_score, confidence_score, logic_score, relevance_score (each 0–10)
  - Bonus for longer, more detailed answers
  - Minimum score of 3.0 for non-empty transcripts (baseline competence)

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

    The score is a weighted average of the 4 LLM sub-scores with adjustments:
      - clarity_score (0–10):    How clearly the candidate expressed their thoughts
      - confidence_score (0–10):  How confident they sounded
      - logic_score (0–10):      How logical and structured their reasoning was
      - relevance_score (0–10):   How on-topic and relevant their answer was

    Adjustments:
      - Length bonus: answers with more words get up to +0.5 bonus
      - Minimum floor: non-empty transcripts get at least 3.0 (baseline)

    Final score is rounded to 2 decimal places.
    """
    # ── Unanswered question: return 0 ───────────────────────────────────────────
    transcript = getattr(answer, 'transcript', None) or ""
    if not transcript.strip():
        return 0.0

    # ── Average the 4 LLM sub-scores ──────────────────────────────────────────
    if not answer.llm_evaluation:
        return 0.0

    llm = answer.llm_evaluation
    total = (
        llm.clarity_score
        + llm.confidence_score
        + llm.logic_score
        + llm.relevance_score
    )
    base_score = total / 4.0

    # ── Length bonus: more detailed answers get a small bonus ─────────────────
    word_count = len(transcript.split())
    length_bonus = min(word_count / 200, 1.0) * 0.5  # up to +0.5 for 200+ word answers

    # ── Calculate final score with minimum floor ────────────────────────────────
    final_score = base_score + length_bonus

    # Apply minimum floor of 3.0 for non-empty transcripts (candidates deserve baseline credit)
    # But cap at 10.0
    final_score = max(3.0, min(10.0, final_score))

    return round(final_score, 2)


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

    # Filter to only answers with actual scores (> 0)
    valid_answers = [a for a in answers if a.answer_final_score > 0]

    # If no valid scores, return worst verdict
    if not valid_answers:
        return {"final_score": 0.0, "category": "Not Recommended"}

    # Sum all per-answer scores and divide by the number of submitted answers
    total = sum(a.answer_final_score for a in valid_answers)
    final_score = round(total / len(valid_answers), 2)

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
