"""
tests/test_scoring.py – Pure unit tests for the scoring service.

These tests do NOT require a database or HTTP client. They verify the
arithmetic of the scoring engine in isolation.
"""

import pytest
from app.models.interview import Answer, LLMEvaluation
from app.services.scoring_service import score_single_answer, aggregate_session_score


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_answer(
    llm_overall: int = 7,
    comm_level: str = "Medium",
    confidence_index: float = 5.0,
    hesitation_score: float = 2.0,
    answer_final_score: float = 0.0,
) -> Answer:
    """Build an Answer with a synthetic LLMEvaluation for testing."""
    llm = LLMEvaluation(
        clarity_score=7,
        confidence_score=7,
        logic_score=7,
        relevance_score=7,
        communication_level=comm_level,
        overall_score=llm_overall,
        final_verdict="Average",
        reasoning="unit-test",
    )
    return Answer(
        question_id="q1",
        question_text="Test question",
        llm_evaluation=llm,
        confidence_index=confidence_index,
        hesitation_score=hesitation_score,
        answer_final_score=answer_final_score,
    )


# ── score_single_answer tests ─────────────────────────────────────────────────

def test_score_single_answer_formula():
    """Verify weights: 40% LLM + 20% emotion + 20% comm + 20% hesitation-inverted."""
    ans = make_answer(
        llm_overall=10,
        comm_level="High",      # 10 points
        confidence_index=10.0,  # full confidence
        hesitation_score=0.0,   # no hesitation
    )
    score = score_single_answer(ans)
    # Expected: 10*0.4 + 10*0.2 + 10*0.2 + 10*0.2 = 10.0
    assert score == 10.0


def test_score_single_answer_zero_llm():
    """With a 0 LLM score and low confidence, score should still be bounded at 0+."""
    ans = make_answer(
        llm_overall=0,
        comm_level="Low",    # 2 points
        confidence_index=0.0,
        hesitation_score=10.0,   # maximum hesitation → inverted = 0
    )
    score = score_single_answer(ans)
    # 0*0.4 + 0*0.2 + 2*0.2 + 0*0.2 = 0.4
    assert abs(score - 0.40) < 0.01


def test_score_single_answer_no_llm():
    """An answer with no LLM evaluation should still get a non-negative score."""
    ans = Answer(
        question_id="q1",
        question_text="Test",
        confidence_index=5.0,
        hesitation_score=5.0,
    )
    score = score_single_answer(ans)
    assert score >= 0.0


def test_score_capped_at_10():
    """Score must never exceed 10."""
    ans = make_answer(
        llm_overall=10,
        comm_level="High",
        confidence_index=100.0,  # absurdly high – should be clamped
        hesitation_score=0.0,
    )
    score = score_single_answer(ans)
    assert score <= 10.0


# ── aggregate_session_score tests ─────────────────────────────────────────────

def test_aggregate_empty_answers():
    """Empty session should return 0 and 'Not Recommended'."""
    result = aggregate_session_score([])
    assert result["final_score"] == 0.0
    assert result["category"] == "Not Recommended"


def test_aggregate_categories():
    """Test that correct category labels are assigned based on score thresholds."""
    def session_with_score(score: float):
        ans = make_answer(answer_final_score=score)
        ans.answer_final_score = score
        return aggregate_session_score([ans])

    assert session_with_score(9.0)["category"] == "Highly Recommended"
    assert session_with_score(7.0)["category"] == "Recommended"
    assert session_with_score(5.0)["category"] == "Average"
    assert session_with_score(2.0)["category"] == "Not Recommended"


def test_aggregate_averages_scores():
    """Final session score should be the mean of per-answer scores."""
    scores = [4.0, 6.0, 8.0]
    answers = []
    for s in scores:
        ans = make_answer(answer_final_score=s)
        ans.answer_final_score = s
        answers.append(ans)

    result = aggregate_session_score(answers)
    assert abs(result["final_score"] - 6.0) < 0.01
