
# CHAPTER 5: SYSTEM DESIGN

## 5.1 Screen Design

### 5.1.1 Landing Page

The landing page is the public entry point of HireNetAI. It features:

- A hero section with the platform tagline and two call-to-action buttons: "Start Interview" (navigates to resume upload) and "Admin Login"
- Feature highlights section describing AI capabilities (Speech Analysis, Emotion Detection, Personality Profiling)
- Animated gradient background using CSS keyframe animations
- Navigation bar with Login and Signup links

**Design Specifications:**
- Font: Inter (Google Fonts)
- Primary color: Indigo-600 (#4F46E5)
- Accent color: Violet-600 (#7C3AED)
- Background: Dark animated gradient (indigo to purple)
- Animation: Framer Motion fade-in transitions

### 5.1.2 Interview Room Screen

The Interview Room is the most critical user-facing screen. It includes:

- **Question Display Panel:** Shows the current interview question prominently
- **Video Preview:** Live webcam feed using the browser MediaRecorder API
- **Recording Controls:** Start/Stop recording buttons with visual indicators
- **Progress Tracker:** Shows current question number and total question count
- **Status Badges:** "Recording", "Processing", "Done" states per answer
- **Navigation:** "Next Question" button enabled after recording stops
- **Integrity Monitor:** Tab-switch detection runs as a background event listener

**MediaRecorder Configuration:**
```
MIME Type: video/webm;codecs=vp8,opus
Timeslice: Continuous streaming chunks
Upload: Per-answer, triggered on recording stop
```

### 5.1.3 Admin Dashboard Screen

The Admin Dashboard provides a centralized control panel for HR administrators:

- **Statistics Cards:** Total Candidates count; Recommended count
- **Sortable Data Table:** Columns include Candidate Name, Status, Answer Count, Final Score (0–10), Verdict badge
- **Search Bar:** Real-time filter by name, email, or verdict
- **Action Buttons Per Row:** View Detail (eye icon), Delete Session (trash icon)
- **Seed Questions Button:** One-time action to populate the global question bank
- **Verdict Color Coding:**
  - Highly Recommended → Emerald green badge
  - Recommended → Blue badge
  - Average → Amber badge
  - Not Recommended → Red badge

### 5.1.4 Candidate Detail Screen

The Candidate Detail page (accessed by admins) presents a full breakdown of one interview session:

- **Session Header:** Candidate name, email, role applied, session status, timestamps
- **Final Score Box:** Circular score gauge with color-coded recommendation
- **Holistic Evaluation Panel:** Overall score, technical score, communication score, consistency score, decision
- **Role-Fit Panel:** Role-fit score (0–100), Hire/Consider/Reject decision, strengths and concerns
- **Per-Answer Cards (Accordion):**
  - Question text and transcript
  - Emotion distribution radar/pie chart (Chart.js)
  - LLM evaluation scores bar chart
  - Hesitation score, pause count, confidence index
  - GPT-generated strengths, weaknesses, reasoning
- **Action Buttons:** Download PDF Report, Re-score (admin only), Stream Video

## 5.2 Database Design

### 5.2.1 Collections Summary

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `users` | User accounts (candidates and admins) | email, hashed_password, role |
| `sessions` | Interview session records | candidate_id, answers[], final_score, category |
| `questions` | Global question bank | text, category, difficulty |
| `session_questions` | Per-session tailored questions | text, session_id, order |
| `password_resets` | Password reset tokens | email, token, expires_at |

### 5.2.2 Session Document Schema (MongoDB)

```json
{
  "_id": "ObjectId",
  "candidate_id": "string",
  "candidate_name": "string",
  "candidate_email": "string",
  "role_applied": "string",
  "status": "in_progress | processing | completed",
  "final_score": 7.45,
  "category": "Recommended",
  "answers": [
    {
      "question_id": "string",
      "question_text": "string",
      "transcript": "string",
      "hesitation_score": 1.5,
      "pause_count": 1,
      "confidence_index": 7.2,
      "nervousness_score": 2.1,
      "emotion_distribution": { "happy": 42.5, "neutral": 38.1, "fear": 12.0 },
      "face_analytics": {
        "total_frames_analyzed": 30,
        "face_absent_ratio": 0.03,
        "multiple_face_ratio": 0.0,
        "face_attention_score": 9.7
      },
      "llm_evaluation": {
        "clarity_score": 8,
        "confidence_score": 7,
        "logic_score": 8,
        "relevance_score": 9,
        "communication_level": "High",
        "personality_traits": { "leadership": 7, "honesty": 8 },
        "overall_score": 8,
        "final_verdict": "Recommended",
        "reasoning": "string"
      },
      "answer_final_score": 7.85,
      "processed": true
    }
  ],
  "holistic_evaluation": {
    "overall_score": 76,
    "technical_score": 72,
    "communication_score": 80,
    "consistency_score": 74,
    "decision": "Selected"
  },
  "role_fit_result": {
    "role_fit_score": 78,
    "decision": "Consider",
    "strengths": [],
    "concerns": [],
    "recommendation": "string"
  },
  "integrity_events": [],
  "transcript_json_path": "app/uploads/{session_id}/transcript.json",
  "started_at": "ISO datetime",
  "completed_at": "ISO datetime"
}
```

## 5.3 API Design (I/O Form Design)

### 5.3.1 Authentication Endpoints

| Method | Endpoint | Request Body | Response |
|--------|----------|--------------|----------|
| POST | /auth/signup | `{ full_name, email, password, role }` | `{ access_token, token_type, user }` |
| POST | /auth/login | `{ email, password }` | `{ access_token, token_type }` |
| POST | /auth/forgot-password | `{ email }` | `{ message }` |
| POST | /auth/reset-password | `{ token, new_password }` | `{ message }` |

### 5.3.2 Resume Endpoints

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /resume/upload | Multipart: `resume` (PDF/DOCX file) | `{ session_id, skills_detected, generated_questions, questions_count }` |

### 5.3.3 Interview Endpoints

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| GET | /interview/questions | JWT Header | List of question objects |
| POST | /interview/session/start | `{ role_applied }` | `{ session_id }` |
| POST | /interview/session/{id}/complete | JWT Header | `{ message }` |
| GET | /interview/my-sessions | JWT Header | List of session summaries |

### 5.3.4 Upload Endpoints

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /upload/answer | Multipart: `file`, `session_id`, `question_id`, `question_text` | `{ message, session_id, question_id }` |
| GET | /upload/status/{session_id}/{question_id} | JWT Header | `{ processed: bool, score }` |

### 5.3.5 Admin Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | /admin/candidates | List all candidate sessions | `{ candidates: [] }` |
| GET | /admin/session/{id} | Full session detail | Session document |
| GET | /admin/session/{id}/report | Download PDF report | Binary PDF |
| GET | /admin/session/{id}/video/{qid} | Stream video answer | Video stream |
| DELETE | /admin/session/{id} | Delete session | `{ message }` |
| POST | /admin/seed-questions | Populate question bank | `{ message }` |
| POST | /admin/session/{id}/rescore | Re-run role-fit scoring | Role-fit result |

## 5.4 AI Pipeline Design

### 5.4.1 Processing Pipeline per Video Answer

```
Input: .webm video file (browser recording)
          |
    +-----v------+    Command: ffmpeg -vn -acodec pcm_s16le -ar 16000 -ac 1
    |  FFmpeg    |    Output: .wav (16kHz, mono)
    | Audio      |
    | Extraction |
    +-----+------+
          |
    +-----v------+    Model: whisperx (base, CPU, int8)
    | WhisperX   |    Output: transcript text, word timestamps, long_pauses[]
    | ASR        |    Hesitation formula: min(len(pauses) × 1.5, 10.0)
    +-----+------+
          |
    +-----v----------+  Tool: OpenCV haarcascade_frontalface_default.xml
    | Face Analysis  |  Sample: 1 frame per 2 seconds
    | (OpenCV Haar   |  Metrics: face_absent_ratio, multiple_face_ratio
    |  Cascade)      |  Score: (face_present_ratio × 10) - (multi_ratio × 3)
    +-----+----------+
          |
    +-----v------+    Tool: DeepFace (7 emotion classes)
    | DeepFace   |    Sample: every 5th frame
    | Emotion    |    Output: emotion_distribution{}, confidence_index, nervousness_score
    | Analysis   |    confidence_index = (happy% + neutral%) / 100 × 10
    +-----+------+
          |
    +-----v------+    Model: GPT-4o-mini (via OpenRouter)
    | LLM        |    Input: question text + transcript
    | Evaluation |    Output: clarity, confidence, logic, relevance (0-10 each)
    | (GPT)      |           personality_traits, strengths, weaknesses, reasoning
    +-----+------+
          |
    +-----v------+    Formula: (clarity+confidence+logic+relevance)/4 + length_bonus
    | Scoring    |    Floor: 3.0 (non-empty transcript minimum)
    | Engine     |    Ceiling: 10.0
    +-----+------+
          |
    MongoDB Update: answers.$.answer_final_score, answers.$.processed = true
```

### 5.4.2 Session Finalization Pipeline

After all answers are processed:

1. **Wait for all answers** — polls MongoDB every 5 seconds (max 10 minutes) until all `processed = True`
2. **Aggregate scores** — averages all per-answer scores → `final_score` and `category`
3. **Holistic evaluation** — sends all Q&A pairs to GPT in one call for cross-answer assessment
4. **JSON export** — writes `transcript.json` to `uploads/{session_id}/` directory
5. **Role-fit scoring** — reads `transcript.json` and asks GPT for Hire/Consider/Reject decision
