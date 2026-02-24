# 🎯 HireNetAI – AI-Powered Video Interview & Personality Pre-Selection Platform

A fully featured AI-driven video interview system analyzing **speech**, **emotion**, **personality traits**, and **communication skills** using cutting-edge ML models.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        HireNetAI Stack                          │
├────────────────┬────────────────────────────────────────────────┤
│   Frontend     │  React (Vite) + TailwindCSS + Chart.js         │
│                │  MediaRecorder API for webcam capture           │
├────────────────┼────────────────────────────────────────────────┤
│   Backend      │  FastAPI (Python) + async endpoints            │
│   Pipeline     │  WhisperX → DeepFace → OpenAI LLM → PDF       │
├────────────────┼────────────────────────────────────────────────┤
│   Database     │  MongoDB (Motor async driver)                   │
│   Auth         │  JWT (python-jose) + bcrypt (passlib)          │
└────────────────┴────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
HireNetAI/
├── backend/
│   ├── app/
│   │   ├── main.py              ← FastAPI entry point
│   │   ├── config.py            ← Settings (pydantic-settings)
│   │   ├── database.py          ← Motor/MongoDB connection
│   │   ├── models/              ← Pydantic DB models
│   │   ├── schemas/             ← Request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py          ← Signup / login
│   │   │   ├── interview.py     ← Sessions / questions
│   │   │   ├── upload.py        ← Video file upload
│   │   │   └── admin.py         ← Admin CRUD + PDF report
│   │   ├── services/
│   │   │   ├── whisper_service.py   ← WhisperX transcription
│   │   │   ├── emotion_service.py   ← DeepFace emotion analysis
│   │   │   ├── llm_service.py       ← OpenAI evaluation
│   │   │   ├── scoring_service.py   ← Final score engine
│   │   │   ├── report_service.py    ← ReportLab PDF
│   │   │   └── video_processor.py  ← Pipeline orchestrator
│   │   ├── utils/
│   │   │   ├── auth.py          ← JWT + password utils
│   │   │   └── helpers.py       ← Mongo doc helpers
│   │   └── uploads/             ← Video storage
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── SignupPage.jsx
│   │   │   ├── CandidateDashboard.jsx
│   │   │   ├── InterviewRoom.jsx    ← MediaRecorder webcam
│   │   │   ├── AdminDashboard.jsx
│   │   │   └── CandidateDetail.jsx ← Charts + PDF download
│   │   ├── context/AuthContext.jsx
│   │   ├── services/api.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
└── docker-compose.yml
```

---

## ⚡ Quick Start – Local Development

### Prerequisites

| Requirement | Version    |
|-------------|------------|
| Python      | ≥ 3.11     |
| Node.js     | ≥ 18       |
| MongoDB     | ≥ 6        |
| ffmpeg      | latest     |

### 1. Clone & Setup Environment

```bash
git clone <your-repo-url>
cd HireNetAI
```

### 2. Backend Setup

```bash
cd backend

# Copy and fill in environment variables
cp .env.example .env
# Edit .env:
#   OPENAI_API_KEY=sk-...
#   SECRET_KEY=<64 random chars>

# Create virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# Install PyTorch (CPU) first  
pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu

# Install WhisperX from GitHub
pip install git+https://github.com/m-bain/whisperX.git

# Install remaining deps
pip install -r requirements.txt

# Run backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Seed Question Bank (one-time)

After starting the backend, create an admin account via signup, then call:

```bash
curl -X POST http://localhost:8000/admin/seed-questions \
  -H "Authorization: Bearer <YOUR_ADMIN_JWT>"
```

Or use the "Seed Questions" button in the Admin Dashboard UI.

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: **http://localhost:5173**  
Backend API at: **http://localhost:8000**

---

## 🐳 Docker Deployment

```bash
# Copy and configure environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your actual values

# Build and start all services
docker-compose up --build

# In a new terminal – seed questions
docker-compose exec backend python -c "
import asyncio
from app.database import connect_db, get_database

async def seed():
    await connect_db()
    db = get_database()
    questions = [
        {'text': 'Tell me about yourself.', 'category': 'general', 'difficulty': 'easy'},
        # Add more...
    ]
    await db['questions'].insert_many(questions)
    print('Seeded!')

asyncio.run(seed())
"
```

Services:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- MongoDB: localhost:27017

---

## 🔐 Authentication & Roles

| Role      | Access                                  |
|-----------|------------------------------------------|
| Candidate | Register, take interview, view own sessions |
| Admin     | View all sessions, watch videos, download reports |

**Admin account**: Register with role = `admin` via `/auth/signup`.

---

## 🧪 API Reference

### Auth
| Method | Endpoint         | Description     |
|--------|-----------------|-----------------|
| POST   | /auth/signup    | Register user   |
| POST   | /auth/login     | Login → JWT     |

### Interview (Candidate)
| Method | Endpoint                             | Description               |
|--------|--------------------------------------|---------------------------|
| GET    | /interview/questions                 | Get question bank         |
| POST   | /interview/session/start             | Start new session         |
| POST   | /interview/session/{id}/complete     | Finalize + trigger scoring|
| GET    | /interview/my-sessions               | List own sessions         |

### Upload
| Method | Endpoint                               | Description              |
|--------|----------------------------------------|--------------------------|
| POST   | /upload/answer                         | Upload video answer      |
| GET    | /upload/status/{sessionId}/{questionId}| Poll processing status   |

### Admin
| Method | Endpoint                               | Description              |
|--------|----------------------------------------|--------------------------|
| GET    | /admin/candidates                      | All candidate sessions   |
| GET    | /admin/session/{id}                    | Full session detail      |
| GET    | /admin/session/{id}/video/{qid}        | Stream video answer      |
| GET    | /admin/session/{id}/report             | Download PDF report      |
| DELETE | /admin/session/{id}                    | Delete session           |
| POST   | /admin/seed-questions                  | Seed question bank       |

Interactive docs available at: **http://localhost:8000/docs**

---

## 🧠 AI Pipeline

```
Video Upload
     │
     ▼
ffmpeg ────────► WAV audio
     │
     ▼
WhisperX ──────► Transcript + Word timestamps + Pause detection
     │
     ▼
OpenCV + DeepFace ► Frame emotions → Distribution + Nervousness + Confidence
     │
     ▼
OpenAI LLM ────► Clarity, Logic, Confidence, Relevance, Traits, Verdict
     │
     ▼
Scoring Engine (40% LLM + 20% Emotion + 20% Comm + 20% Hesitation)
     │
     ▼
MongoDB Storage + PDF Report
```

### Final Score Weights

| Component            | Weight |
|----------------------|--------|
| LLM Evaluation       | 40%    |
| Emotion Confidence   | 20%    |
| Communication Level  | 20%    |
| Hesitation (inverted)| 20%    |

### Score → Category

| Score   | Category           |
|---------|--------------------|
| ≥ 8.0   | Highly Recommended |
| ≥ 6.0   | Recommended        |
| ≥ 4.0   | Average            |
| < 4.0   | Not Recommended    |

---

## 🌐 Production Deployment

### Option A: VPS / Cloud VM

```bash
# Install nginx
sudo apt install nginx

# Configure nginx as reverse proxy for backend (port 8000)
# Build frontend production bundle
cd frontend && npm run build

# Serve frontend dist/ via nginx
# Configure SSL with certbot/Let's Encrypt
```

### Option B: Cloud Platforms

- **Railway**: Connect GitHub repo → set env vars → deploy
- **Render**: Use Web Service for backend + Static Site for frontend
- **AWS**: EC2 + DocumentDB (MongoDB-compatible) + S3 for video uploads

### Environment Variables for Production

```env
MONGODB_URL=mongodb+srv://...               # MongoDB Atlas URI
SECRET_KEY=<64-char-random-hex>
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://yourdomain.com
UPLOAD_DIR=/var/hirenet/uploads             # Persistent volume
```

---

## 📋 Requirements Summary

**Backend** (`requirements.txt`):
- `fastapi`, `uvicorn` – Web framework
- `motor`, `pymongo` – Async MongoDB
- `passlib[bcrypt]`, `python-jose` – Auth
- `whisperx` – Speech transcription
- `deepface`, `opencv-python` – Emotion AI
- `openai` – LLM evaluation
- `reportlab` – PDF generation
- `ffmpeg-python` – Audio extraction

**Frontend** (`package.json`):
- `react`, `react-dom`, `react-router-dom`
- `tailwindcss`, `framer-motion`
- `axios`, `chart.js`, `react-chartjs-2`
- `react-hot-toast`, `lucide-react`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

MIT License – see [LICENSE](LICENSE) for details.

---

Built with ❤️ by the HireNetAI team · Powered by OpenAI, WhisperX, and DeepFace
