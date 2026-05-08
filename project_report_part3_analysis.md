
# CHAPTER 4: SYSTEM ANALYSIS

## 4.1 High-Level System Flowchart

```
                        +---------------------------+
                        |       START               |
                        +------------+--------------+
                                     |
                        +------------v--------------+
                        |  User visits HireNetAI    |
                        +------------+--------------+
                                     |
               +---------------------+--------------------+
               |                                          |
    +----------v-----------+                   +----------v-----------+
    |  Register / Login    |                   |   Upload Resume      |
    |  (JWT Authentication)|                   |   (Anonymous Mode)   |
    +----------+-----------+                   +----------+-----------+
               |                                          |
    +----------v-----------+                   +----------v-----------+
    | Candidate Dashboard  |                   |  Extract Text (PDF/  |
    | Start Interview      |                   |  DOCX) + Detect      |
    +----------+-----------+                   |  Technical Skills    |
               |                               +----------+-----------+
               |                                          |
               +------------------+-----------------------+
                                  |
                     +------------v--------------+
                     |  Generate AI Interview    |
                     |  Questions via GPT-4o-mini|
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |  Candidate Records Video  |
                     |  Answer per Question      |
                     |  (MediaRecorder API)      |
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |  Upload Video to Backend  |
                     |  (Async Background Task)  |
                     +------------+--------------+
                                  |
               +------------------+------------------------+
               |                  |                        |
    +----------v----+   +---------v------+    +-----------v------+
    | FFmpeg Audio  |   | WhisperX ASR   |    | OpenCV Face      |
    | Extraction    |   | Transcription  |    | Detection        |
    | (.wav)        |   | + Hesitation   |    | + DeepFace EMO   |
    +----------+----+   +---------+------+    +-----------+------+
               |                  |                        |
               +------------------+------------------------+
                                  |
                     +------------v--------------+
                     |   GPT-4o-mini LLM         |
                     |   Evaluation (Clarity,    |
                     |   Logic, Relevance etc.)  |
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |   Scoring Engine          |
                     |   (Weighted Average)      |
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |   Session Finalization    |
                     |   Holistic Eval + Role-Fit|
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |  Admin Dashboard          |
                     |  View Results / PDF       |
                     +------------+--------------+
                                  |
                        +---------v---------+
                        |        END        |
                        +-------------------+
```

## 4.2 Entity-Relationship (ER) Diagram

The database comprises four primary collections in MongoDB:

### Collections and Relationships

**users** — stores registered user accounts
- `_id` (ObjectId, Primary Key)
- `full_name` (String)
- `email` (String, Unique)
- `hashed_password` (String)
- `role` (String: "candidate" | "admin")
- `created_at` (DateTime)

**sessions** — stores interview sessions (one per candidate interview attempt)
- `_id` (ObjectId, Primary Key)
- `candidate_id` (String, FK → users._id)
- `candidate_name` (String)
- `candidate_email` (String)
- `role_applied` (String)
- `answers` (Array of embedded Answer documents)
- `final_score` (Float, 0–10)
- `category` (String)
- `status` (String: "in_progress" | "processing" | "completed")
- `holistic_evaluation` (Embedded Document)
- `role_fit_result` (Embedded Document)
- `integrity_events` (Array of IntegrityEvent documents)
- `transcript_json_path` (String)
- `started_at` (DateTime)
- `completed_at` (DateTime)

**questions** — global question bank
- `_id` (ObjectId, Primary Key)
- `text` (String)
- `category` (String)
- `difficulty` (String: "easy" | "medium" | "hard")
- `expected_duration_seconds` (Integer)

**session_questions** — tailored questions generated per session
- `_id` (ObjectId, Primary Key)
- `text` (String)
- `session_id` (String, FK → sessions._id)
- `order` (Integer)
- `category` (String)
- `difficulty` (String)

### Embedded Sub-Documents

Each `answers` element within a session document contains:
- `question_id`, `question_text`, `transcript`
- `hesitation_score`, `pause_count`, `long_pauses`, `word_timestamps`
- `confidence_index`, `nervousness_score`
- `emotion_distribution`, `frame_emotions`
- `face_analytics` (OpenCV results)
- `llm_evaluation` (GPT scores and traits)
- `answer_final_score`, `processed` (Boolean)

## 4.3 Data Flow Diagrams (DFD)

### 4.3.1 Level-0 DFD (Context Diagram)

```
                    Resume File
                    +-----------+
[Candidate] ------->|           |-----> Interview Questions
                    |           |
                    | HireNetAI |
                    |  System   |
                    |           |-----> Score + Category
                    |           |
[Admin]    -------->|           |-----> PDF Report
                    +-----------+
```

### 4.3.2 Level-1 DFD

```
Candidate ---(Resume)---> [1.0 Resume Processing] ---(Skills)---> [2.0 Question Generation]
                                                                           |
                                                                    (Questions)
                                                                           |
Candidate <----(Questions)------[Sessions DB]<--(Store)--[3.0 Session Management]
     |
  (Video Answers)
     |
     v
[4.0 AI Pipeline Orchestrator]
     |         |         |
     v         v         v
[4.1 Audio] [4.2 STT] [4.3 Emotion]
Extraction  WhisperX  + Face Analysis
     |         |         |
     +----+----+---------+
          |
          v
     [4.4 LLM Evaluation]
          |
          v
     [4.5 Scoring Engine]---(Score)--->[Sessions DB]
          |
          v
Admin <---[5.0 Admin Dashboard]<---(Report)---[6.0 PDF Generator]
```

## 4.4 Functional Requirements

| Req. ID | Module | Requirement Description | Priority |
|---------|--------|------------------------|----------|
| FR-01 | Auth | Users shall register with full name, email, and password | High |
| FR-02 | Auth | Users shall login and receive a JWT access token (24h expiry) | High |
| FR-03 | Auth | Admins shall have elevated access to all session data | High |
| FR-04 | Resume | System shall accept PDF and DOCX files up to 10 MB | High |
| FR-05 | Resume | System shall extract readable text from uploaded resume | High |
| FR-06 | Resume | System shall detect up to 20 technical skills using regex pattern matching | High |
| FR-07 | Resume | System shall generate 5 tailored interview questions using GPT-4o-mini | High |
| FR-08 | Interview | Candidates shall record video answers using the browser MediaRecorder API | High |
| FR-09 | Upload | Each video answer shall be uploaded and processed asynchronously | High |
| FR-10 | Pipeline | System shall extract audio from video using FFmpeg | High |
| FR-11 | Pipeline | System shall transcribe audio to text with word-level timestamps using WhisperX | High |
| FR-12 | Pipeline | System shall detect hesitation pauses (> 2 seconds) and compute a hesitation score | Medium |
| FR-13 | Pipeline | System shall detect face presence and multiple faces using OpenCV | High |
| FR-14 | Pipeline | System shall analyze facial emotions using DeepFace across 7 emotion categories | High |
| FR-15 | Pipeline | System shall evaluate transcripts using GPT for clarity, logic, relevance, confidence | High |
| FR-16 | Scoring | System shall compute per-answer weighted scores (0–10) | High |
| FR-17 | Scoring | System shall aggregate session scores and assign a hiring category | High |
| FR-18 | Evaluation | System shall run a holistic multi-answer evaluation via GPT | Medium |
| FR-19 | Evaluation | System shall generate a role-fit score (0–100) and Hire/Consider/Reject decision | Medium |
| FR-20 | Report | System shall generate a downloadable PDF report per session | High |
| FR-21 | Admin | Admins shall view all candidate sessions with search and sort | High |
| FR-22 | Admin | Admins shall stream candidate video answers | Medium |
| FR-23 | Integrity | System shall log tab-switch events during interviews | Medium |
| FR-24 | Auth | System shall support password reset via email token | Low |

## 4.5 Non-Functional Requirements

| Req. ID | Category | Requirement Description | Target |
|---------|----------|------------------------|--------|
| NFR-01 | Performance | Video processing pipeline shall run asynchronously without blocking HTTP responses | Async (BackgroundTask) |
| NFR-02 | Performance | API endpoints shall respond within 300ms under normal load | < 300ms |
| NFR-03 | Scalability | System shall support concurrent interview sessions | Multi-process via Uvicorn |
| NFR-04 | Reliability | Pipeline failures per answer shall not abort other answers | Graceful error handling |
| NFR-05 | Security | All passwords shall be hashed using bcrypt | passlib[bcrypt] |
| NFR-06 | Security | All API endpoints (except auth and health) shall require JWT | python-jose |
| NFR-07 | Security | CORS policy shall restrict origins to configured domains | FastAPI CORSMiddleware |
| NFR-08 | Usability | Interview room UI shall display recording status and countdown | React state management |
| NFR-09 | Maintainability | Codebase shall follow modular service-layer architecture | Enforced by directory structure |
| NFR-10 | Portability | System shall be containerized using Docker Compose | docker-compose.yml |
| NFR-11 | Availability | Transcript JSON shall be exported to disk for offline access | json_scoring_service.py |
| NFR-12 | Storage | Video files shall be stored in a structured session directory | uploads/{session_id}/ |

## 4.6 LLM Evaluation Dimensions

| Dimension | Scale | Description |
|-----------|-------|-------------|
| Clarity Score | 0–10 | How clearly the candidate articulated their thoughts |
| Confidence Score | 0–10 | Confidence inferred from language and tone |
| Logic Score | 0–10 | Structured reasoning and argument quality |
| Relevance Score | 0–10 | On-topic alignment with the question |
| Communication Level | Low/Medium/High | Overall communication proficiency |
| Personality Traits | 0–10 each | Leadership, emotional stability, honesty, confidence |
| Overall Score | 0–10 | Composite LLM score |
| Final Verdict | Category | Highly Recommended / Recommended / Average / Not Recommended |

## 4.7 Score-to-Category Mapping

| Final Score Range | Hiring Category | Interpretation |
|-------------------|----------------|----------------|
| ≥ 8.0 | Highly Recommended | Exceptional candidate; strong across all dimensions |
| ≥ 6.0 | Recommended | Solid candidate; worth advancing to next round |
| ≥ 4.0 | Average | Borderline; may require additional review |
| < 4.0 | Not Recommended | Significant gaps in communication or knowledge |

## 4.8 Scoring Weight Formula

The per-answer score is computed as follows:

```
base_score  = (clarity + confidence + logic + relevance) / 4.0
length_bonus = min(word_count / 200, 1.0) × 0.5        [max +0.5]
final_score  = max(3.0, min(10.0, base_score + length_bonus))
```

Session final score = average of all valid (score > 0) per-answer scores.
