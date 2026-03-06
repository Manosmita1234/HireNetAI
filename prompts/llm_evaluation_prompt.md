# LLM Evaluation Prompts

The HireNetAI platform uses two LLM evaluation passes. Both call the same
OpenAI-compatible endpoint (`openai_base_url` in `.env`).

---

## 1. Per-Answer Evaluation  (`services/llm_service.py`)

Called once per uploaded video answer, **immediately after transcription**.

### System Prompt
```
You are an expert HR interviewer and psychologist evaluating a candidate's
video interview response. Evaluate the answer below and return ONLY a valid
JSON object (no markdown, no explanation outside JSON).
```

### User Prompt Template

```
INTERVIEW QUESTION:
{question}

CANDIDATE'S TRANSCRIPT:
{transcript}

Return this exact JSON structure (all scores are integers 0-10):

{
  "clarity_score": <int>,
  "confidence_score": <int>,
  "logic_score": <int>,
  "relevance_score": <int>,
  "communication_level": "<Low | Medium | High>",
  "personality_traits": {
    "leadership": <int>,
    "emotional_stability": <int>,
    "honesty": <int>,
    "confidence": <int>
  },
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "overall_score": <int>,
  "final_verdict": "<Highly Recommended | Recommended | Average | Not Recommended>",
  "reasoning": "<one paragraph>"
}
```

### Parameters
- Model: `openai/gpt-4o-mini` (configurable via `OPENAI_MODEL`)
- Temperature: `0.3`
- Max tokens: `1024`

---

## 2. Holistic Session Evaluation  (`services/evaluation_service.py`)

Called **once per session** after all answers are submitted. The LLM reads the
full interview transcript before making a single holistic judgement.

### System Prompt
```
You are the AI Interview Evaluation Engine for HireNetAI.
You have received a completed video interview session with all question-answer pairs.
Each answer was transcribed using WhisperX.
Evaluate the candidate holistically — consider ALL answers before making any judgment.
Return ONLY valid JSON. No markdown. No explanation outside JSON.
```

### User Prompt Template

```
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

{
  "overall_score": <int>,
  "technical_score": <int>,
  "communication_score": <int>,
  "consistency_score": <int>,
  "decision": "<Selected | Borderline | Rejected>",
  "strengths": ["<string>", "<string>", "<string>"],
  "weaknesses": ["<string>", "<string>", "<string>"],
  "final_summary": "<3-5 line professional hiring justification>"
}
```

### Q&A Block Format

Each answer is formatted as:

```
Q1: <question_text>
A: <transcript or [No response]>
   [Emotion: <dominant> (<pct>)]
   [Confidence: high|medium|low]

Q2: ...
```

### Parameters
- Model: configurable via `OPENAI_MODEL` (default `openai/gpt-4o-mini`)
- Temperature: `0.2`  (lower for more deterministic structured output)
- Max tokens: `1024`

---

## Score Ranges

| Metric | Scale | Notes |
|--------|-------|-------|
| Per-answer scores (clarity, confidence, etc.) | 0 – 10 | |
| Per-answer `overall_score` | 0 – 10 | |
| Holistic scores (overall, technical, etc.) | 0 – 100 | |

### Decision → Category Mapping

| Holistic Decision | Per-answer `final_score` | Category |
|---|---|---|
| Selected | ≥ 8.0 / 10 | Highly Recommended |
| Borderline | ≥ 6.0 / 10 | Recommended |
| Borderline | ≥ 4.0 / 10 | Average |
| Rejected | < 4.0 / 10 | Not Recommended |
