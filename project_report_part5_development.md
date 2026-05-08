
# CHAPTER 6: DEVELOPMENT

## 6.1 Development Environment

### 6.1.1 Hardware Configuration

| Component | Specification |
|-----------|--------------|
| Operating System | Windows 11 / Ubuntu 22.04 LTS |
| Processor | Intel Core i5 / AMD Ryzen 5 (minimum) |
| RAM | 8 GB minimum (16 GB recommended for WhisperX) |
| Storage | 20 GB free disk space |
| GPU | Optional (CUDA GPU for faster WhisperX inference) |
| Browser | Google Chrome 118+ / Microsoft Edge 118+ |

### 6.1.2 Software Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Backend language |
| Node.js | 18+ | Frontend runtime |
| MongoDB | 6.0+ | Primary database |
| FFmpeg | Latest | Audio/video processing |
| Visual Studio Code | Latest | Primary IDE |
| Git | 2.40+ | Version control |
| Docker Desktop | Latest | Containerization |
| Postman / Swagger UI | Latest | API testing |

### 6.1.3 Technology Stack Summary

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Backend Framework | FastAPI | 0.110+ | REST API and async backend |
| ASGI Server | Uvicorn | 0.29+ | ASGI production server |
| Database Driver | Motor | 3.3+ | Async MongoDB client |
| Database | MongoDB | 6.0+ | Document store |
| Authentication | python-jose + passlib | Latest | JWT + bcrypt |
| Speech Model | WhisperX | Latest | ASR transcription |
| Face Detection | OpenCV | 4.9+ | Haar Cascade face detection |
| Emotion AI | DeepFace | Latest | Facial emotion recognition |
| LLM Provider | OpenAI (OpenRouter) | GPT-4o-mini | Answer evaluation + question gen |
| PDF Generator | ReportLab | Latest | PDF report generation |
| Audio Processing | FFmpeg | Latest | Video-to-WAV extraction |
| Settings | pydantic-settings | Latest | Environment variable management |
| Frontend Framework | React | 18 | SPA framework |
| Build Tool | Vite | 5+ | Fast dev server + bundler |
| Styling | TailwindCSS | 3+ | Utility-first CSS |
| Animations | Framer Motion | Latest | UI micro-animations |
| Charts | Chart.js + react-chartjs-2 | Latest | Score visualization |
| HTTP Client | Axios | Latest | API communication |
| Notifications | react-hot-toast | Latest | UI toast messages |
| Icons | lucide-react | Latest | Icon library |
| Containerization | Docker + Docker Compose | Latest | Deployment |

## 6.2 Backend Development

### 6.2.1 Project Structure

```
backend/
├── app/
│   ├── main.py               ← FastAPI entry point, router registration, CORS, lifespan
│   ├── config.py             ← pydantic-settings: all env variables with defaults
│   ├── database.py           ← Motor MongoDB connection (connect_db, close_db, get_database)
│   ├── models/
│   │   ├── user.py           ← User Pydantic model
│   │   ├── interview.py      ← InterviewSession, Answer, LLMEvaluation, IntegrityEvent models
│   │   └── question.py       ← Question Pydantic model
│   ├── schemas/
│   │   ├── auth.py           ← SignupRequest, LoginResponse, TokenData schemas
│   │   ├── interview.py      ← SessionCreate, SessionSummary schemas
│   │   └── evaluation.py     ← EvaluationRequest, HolisticEvaluationResult schemas
│   ├── routers/
│   │   ├── auth.py           ← /auth/signup, /auth/login, /auth/forgot-password
│   │   ├── interview.py      ← /interview/questions, /interview/session/*
│   │   ├── upload.py         ← /upload/answer, /upload/status/*
│   │   ├── admin.py          ← /admin/candidates, /admin/session/*, /admin/seed-questions
│   │   ├── evaluate.py       ← /evaluate/* (holistic evaluation endpoints)
│   │   ├── resume.py         ← /resume/upload (resume parsing + question generation)
│   │   └── candidate.py      ← /candidate/* (candidate self-service endpoints)
│   ├── services/
│   │   ├── whisper_service.py      ← WhisperX transcription + pause detection
│   │   ├── emotion_service.py      ← DeepFace emotion analysis (async thread executor)
│   │   ├── face_analysis_service.py← OpenCV Haar Cascade face detection
│   │   ├── llm_service.py          ← GPT answer evaluation
│   │   ├── scoring_service.py      ← Per-answer + session score aggregation
│   │   ├── evaluation_service.py   ← Holistic GPT evaluation (all Q&A pairs)
│   │   ├── json_scoring_service.py ← JSON transcript export + role-fit GPT scoring
│   │   ├── report_service.py       ← ReportLab PDF generation
│   │   ├── email_service.py        ← SMTP email (password reset)
│   │   └── video_processor.py      ← Pipeline orchestrator (process_video, finalize_session)
│   └── utils/
│       ├── auth.py           ← JWT token creation, verification, get_current_user
│       └── helpers.py        ← MongoDB document helpers (ObjectId to str)
├── requirements.txt
├── Dockerfile
└── .env.example
```

### 6.2.2 Key Code Segments

#### Application Entry Point (main.py)

The FastAPI application is initialized with a lifespan context manager that manages the MongoDB connection lifecycle. Seven routers are registered covering all functional domains.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    yield
    await close_db()

app = FastAPI(title="HireNetAI – Video Interview Platform", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins_list, ...)
```

#### WhisperX Transcription Service (whisper_service.py)

WhisperX is loaded once and cached globally to avoid repeated model initialization overhead. The transcription pipeline runs in a thread pool executor to prevent blocking the FastAPI event loop.

```python
async def transcribe_audio(audio_path: str) -> Dict[str, Any]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _transcribe_sync, audio_path)
```

Hesitation Score Formula:
```python
LONG_PAUSE_THRESHOLD = 2.0   # seconds
hesitation_score = min(len(pauses) * 1.5, 10.0)
```

#### OpenCV Face Analysis (face_analysis_service.py)

FFmpeg extracts one JPEG frame every 2 seconds. The Haar Cascade classifier processes each frame to count faces:

```python
FACE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

# Face Attention Score Formula:
face_present_ratio = 1.0 - face_absent_ratio
penalty = multiple_face_ratio * 3.0
score = max(0.0, min(10.0, (face_present_ratio * 10.0) - penalty))
```

#### DeepFace Emotion Analysis (emotion_service.py)

DeepFace analyzes every 5th frame for emotion distribution:

```python
# Confidence Index (positive emotions → higher confidence)
confidence_index = round(min((happy% + neutral%) / 100 * 10, 10), 2)

# Nervousness Score (negative emotions → higher nervousness)
nervousness_score = round(min((fear% + sad% + angry%) / 100 * 10, 10), 2)
```

#### LLM Evaluation (llm_service.py)

Each answer is evaluated by GPT-4o-mini with a structured prompt requesting a JSON response with 10 fields including clarity_score, logic_score, personality_traits, and reasoning.

#### Scoring Engine (scoring_service.py)

```python
def score_single_answer(answer: Answer) -> float:
    base_score = (clarity + confidence + logic + relevance) / 4.0
    length_bonus = min(word_count / 200, 1.0) * 0.5
    return round(max(3.0, min(10.0, base_score + length_bonus)), 2)
```

#### PDF Report Generation (report_service.py)

ReportLab flowables build the PDF from a list of Paragraphs, Tables, Spacers, and HRFlowables. The color palette follows HireNetAI's brand: Indigo-600 (#4F46E5) as primary, Violet-600 (#7C3AED) as secondary.

## 6.3 Frontend Development

### 6.3.1 Project Structure

```
frontend/
├── src/
│   ├── App.jsx               ← React Router routes and auth guards
│   ├── main.jsx              ← React DOM root + AuthProvider + Router
│   ├── index.css             ← Global CSS, design tokens, custom utilities
│   ├── context/
│   │   └── AuthContext.jsx   ← Global auth state (user, token, login, logout)
│   ├── pages/
│   │   ├── LandingPage.jsx   ← Public homepage
│   │   ├── LoginPage.jsx     ← JWT login form
│   │   ├── SignupPage.jsx    ← Registration form
│   │   ├── CandidateDashboard.jsx ← Candidate session history
│   │   ├── InterviewRoom.jsx ← Video recording interface
│   │   ├── AdminDashboard.jsx     ← Admin session table + search
│   │   ├── CandidateDetail.jsx    ← Full session breakdown + charts
│   │   ├── ForgotPasswordPage.jsx ← Password reset request
│   │   └── ResetPasswordPage.jsx  ← New password entry
│   ├── components/
│   │   └── SkeletonLoader.jsx     ← Loading skeleton components
│   ├── hooks/                ← Custom React hooks
│   └── services/
│       └── api.js            ← Axios instance + all API call functions
├── package.json
├── vite.config.js
└── tailwind.config.js
```

### 6.3.2 Authentication Flow

The `AuthContext` provides global authentication state using React Context API. The JWT token is stored in `localStorage` and attached to all API requests via an Axios interceptor:

```javascript
// api.js - Axios request interceptor
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### 6.3.3 Video Recording (InterviewRoom.jsx)

The MediaRecorder API captures webcam video in .webm format. Each answer is recorded independently:

```javascript
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
recorder.ondataavailable = (e) => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  uploadVideoAnswer(blob, sessionId, questionId, questionText);
};
```

### 6.3.4 Score Visualization (CandidateDetail.jsx)

Chart.js renders radar charts for emotion distribution and bar charts for LLM evaluation scores. The holistic evaluation and role-fit panels display structured data with color-coded decision badges.

## 6.4 Docker Deployment

### 6.4.1 docker-compose.yml Services

```yaml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      - MONGODB_URL=mongodb://mongo:27017
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - uploads:/app/uploads

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    depends_on: [backend]

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    ports: ["27017:27017"]
```

### 6.4.2 Backend Dependencies (requirements.txt)

| Package | Purpose |
|---------|---------|
| fastapi, uvicorn | Web framework and ASGI server |
| motor, pymongo | Async MongoDB driver |
| passlib[bcrypt], python-jose | Password hashing and JWT |
| whisperx | Speech-to-text with word alignment |
| deepface, opencv-python | Facial emotion and presence analysis |
| openai | GPT API client |
| reportlab | PDF generation |
| ffmpeg-python | Audio extraction |
| pdfplumber, PyPDF2, pdfminer | Resume text extraction (PDF) |
| python-docx | Resume text extraction (DOCX) |
| pydantic-settings | Environment variable management |

### 6.4.3 Frontend Dependencies (package.json)

| Package | Purpose |
|---------|---------|
| react, react-dom | Core React library |
| react-router-dom | Client-side routing |
| tailwindcss | Utility-first CSS framework |
| framer-motion | Animation library |
| axios | HTTP client |
| chart.js, react-chartjs-2 | Data visualization |
| react-hot-toast | Toast notification system |
| lucide-react | Icon components |
