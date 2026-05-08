
# CHAPTER 1: INTRODUCTION

## 1.1 Background

The recruitment industry is undergoing a paradigm shift, driven by the proliferation of artificial intelligence and machine learning technologies. Traditional hiring processes, characterized by manual screening of resumes and face-to-face interviews, are often time-consuming, resource-intensive, and susceptible to unconscious bias. As organizations scale globally and the volume of job applications increases exponentially, the demand for automated, objective, and efficient candidate evaluation systems has never been greater.

HireNetAI addresses this critical gap by providing a fully automated video interview platform that evaluates candidates across multiple behavioral and cognitive dimensions using state-of-the-art AI models. Unlike conventional applicant tracking systems that merely parse resumes, HireNetAI conducts live video interviews, transcribes candidate responses, analyzes facial expressions, and evaluates answers using a large language model — all without requiring any human evaluator during the screening phase.

## 1.2 Motivation

The primary motivation for developing HireNetAI stems from three core challenges observed in conventional hiring workflows:

1. **Scalability Problem:** A single recruiter can realistically evaluate only a limited number of candidates per day. HireNetAI can process hundreds of video interviews concurrently using its asynchronous backend pipeline.

2. **Consistency Problem:** Human evaluators are prone to cognitive biases, mood variations, and inconsistent scoring criteria. HireNetAI applies the same algorithmic scoring rubric to every candidate, ensuring a uniform evaluation standard.

3. **Depth of Assessment Problem:** Traditional resume screening captures only a candidate's stated credentials. HireNetAI evaluates actual spoken communication quality, emotional composure, hesitation patterns, and reasoning logic — dimensions that are impossible to assess from a resume alone.

## 1.3 Problem Statement

Organizations struggle to efficiently identify the most suitable candidates from a large applicant pool without investing disproportionate time and human capital in initial screening rounds. The absence of standardized, objective, and automated screening tools results in:

- Prolonged time-to-hire cycles
- High screening costs
- Inconsistent evaluation quality across interviewers
- Loss of qualified candidates due to delayed processing

HireNetAI proposes a technology-driven solution that reduces the human effort in first-round screening while simultaneously increasing the depth and objectivity of candidate evaluation.

## 1.4 Project Overview

HireNetAI is a full-stack web application built on a modern technology stack. The backend is implemented using FastAPI (Python) with an asynchronous design pattern to support concurrent video processing pipelines. The frontend is built with React (Vite) and TailwindCSS, providing a responsive and interactive user experience. All data is persisted in MongoDB via the Motor async driver.

The platform's AI pipeline processes each uploaded video answer through five sequential stages:

1. **Audio Extraction** — FFmpeg converts the .webm browser recording to a 16 kHz mono WAV file.
2. **Speech Transcription** — WhisperX performs word-level transcription and detects hesitation pauses.
3. **Face Presence Analysis** — OpenCV's Haar Cascade classifier detects face absence and multiple-face scenarios.
4. **Emotion Analysis** — DeepFace analyzes facial expressions frame-by-frame to generate emotion distributions.
5. **LLM Evaluation** — OpenAI GPT-4o-mini evaluates the transcript for clarity, logic, relevance, and personality traits.

## 1.5 System Architecture Overview

The HireNetAI platform adopts a client-server architecture with three primary layers:

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| Frontend | React (Vite) + TailwindCSS + Chart.js | User interface, video recording, data visualization |
| Backend | FastAPI (Python) + Uvicorn | API endpoints, AI pipeline orchestration |
| Database | MongoDB (Motor async driver) | Session storage, user management, score persistence |

The backend exposes seven router modules: `auth`, `interview`, `upload`, `admin`, `evaluate`, `resume`, and `candidate`, each handling a distinct functional domain.

---

# CHAPTER 2: OBJECTIVE AND SCOPE OF PROJECT

## 2.1 Primary Objectives

The primary objectives of the HireNetAI project are as follows:

1. **Automate Video Interview Screening:** Enable candidates to record video responses to AI-generated interview questions through a browser-based interface, eliminating the need for a human interviewer during the initial screening round.

2. **Multi-Modal Candidate Assessment:** Evaluate candidates across three independent signal channels — verbal content (transcript quality), vocal patterns (hesitation and pause detection), and visual cues (facial emotion and presence analysis) — to produce a comprehensive multi-dimensional score.

3. **AI-Powered Question Generation:** Automatically generate personalized, role-specific interview questions by parsing the candidate's uploaded resume using NLP-based skill extraction and GPT-4o-mini.

4. **Objective Scoring Framework:** Implement a deterministic, weighted scoring algorithm that aggregates sub-scores from four dimensions — LLM evaluation (40%), emotion confidence (20%), communication level (20%), and hesitation score (20%) — into a final 0–10 score.

5. **Role-Fit Decision Engine:** Generate a structured hiring recommendation (Hire / Consider / Reject) by analyzing the complete interview transcript through a dedicated role-fit AI scoring module.

6. **Automated PDF Reporting:** Produce downloadable PDF evaluation reports for each candidate session, suitable for review by HR personnel and hiring managers.

7. **Secure Role-Based Access:** Implement JWT-based authentication with distinct access levels for Candidate and Administrator roles.

## 2.2 Secondary Objectives

- Develop an admin dashboard for centralized management of all candidate interview sessions.
- Implement AI integrity monitoring to detect cheating events such as face absence, multiple faces in frame, and tab switching.
- Enable anonymous interview participation for candidates without registered accounts.
- Support both PDF and DOCX resume formats for skill extraction.
- Provide a holistic interview evaluation that assesses consistency and coherence across all question-answer pairs.

## 2.3 Scope of the Project

The scope of HireNetAI encompasses the following functional domains:

**In Scope:**
- Resume upload, text extraction, and skill detection (PDF and DOCX)
- AI-powered tailored interview question generation
- Browser-based video recording using the MediaRecorder API
- Complete AI pipeline: audio extraction → transcription → face analysis → emotion analysis → LLM evaluation → scoring
- Per-answer and session-level score aggregation and categorization
- Holistic multi-answer evaluation using GPT
- Role-fit scoring from exported JSON transcripts
- Admin dashboard with candidate management, search, and sort
- Downloadable PDF evaluation reports per session
- JWT-based user registration and login
- Interview integrity event tracking (tab switch, face absence)
- Docker containerization for deployment

**Out of Scope:**
- Integration with third-party HR systems (HRMS/ATS)
- Real-time multi-party video conferencing
- Multi-language interview support (English only in current implementation)
- Mobile native application (iOS/Android)
- Automated job posting or applicant outreach

## 2.4 Expected Outcomes

| Outcome | Metric |
|---------|--------|
| Accurate speech transcription | WhisperX base model, English language |
| Emotion distribution analysis | 7 emotion classes via DeepFace |
| LLM evaluation per answer | 6 score dimensions (clarity, confidence, logic, relevance, overall, communication level) |
| Final session score | Weighted average, 0–10 scale |
| Role-fit decision | Hire / Consider / Reject with confidence score (0–100) |
| PDF report generation | Per session, auto-generated with ReportLab |
| Response time | API endpoints respond within 200ms; video processing runs asynchronously |

---

# CHAPTER 3: SYSTEM STUDY

## 3.1 Study of Existing System

### 3.1.1 Overview of Current Recruitment Tools

Traditional recruitment workflows typically involve three stages: resume screening, telephonic interview, and face-to-face panel interview. Several existing tools partially address the automation of these stages:

- **Applicant Tracking Systems (ATS):** Platforms such as Greenhouse, Workday, and Lever automate resume collection and applicant tracking but do not evaluate communication quality or personality traits.
- **HireVue:** A commercial AI video interview platform that records and analyzes candidate videos, but is proprietary, expensive, and provides limited transparency in its scoring methodology.
- **Pymetrics:** Uses neuroscience-based games to assess personality traits but does not evaluate technical knowledge or verbal communication.
- **LinkedIn Assessments:** Offers skill testing but lacks video-based behavioral evaluation.

### 3.1.2 Drawbacks of Existing Systems

| Drawback | Description |
|----------|-------------|
| High Cost | Enterprise AI interview platforms charge per-interview fees, making them inaccessible for small and medium enterprises |
| Proprietary Black Box | Scoring algorithms are opaque; candidates and employers cannot understand the basis of evaluation |
| No Technical Skill Integration | Existing tools do not parse resumes to generate skill-specific questions |
| Limited Emotion Analysis | Most tools rely on acoustic analysis only and do not perform facial emotion classification |
| No Role-Fit JSON Export | Results are locked inside vendor platforms without API or transcript export capabilities |
| No Integrity Monitoring | Face absence and multiple-face detection are not universally implemented |

## 3.2 Proposed System

HireNetAI proposes a transparent, open-source-inspired, and fully integrated AI interview platform that addresses each identified drawback:

| Feature | HireNetAI Approach |
|---------|--------------------|
| Cost | Open-source stack with self-hosting option; only GPT API usage incurs cost |
| Transparency | Scores, weights, transcripts, and reasoning are all stored and accessible |
| Skill-Based Questions | Resume parsing + GPT generates 5 role-specific questions per candidate |
| Emotion Analysis | Frame-level DeepFace analysis across 7 emotion categories |
| JSON Export | Full transcript.json exported per session for external analysis |
| Integrity Monitoring | OpenCV face detection, tab-switch event logging |

### 3.2.1 Proposed System Workflow

```
Resume Upload → Skill Extraction → Question Generation
        ↓
Candidate Interview (Browser Video Recording)
        ↓
Video Upload per Answer → AI Pipeline (Async Background Task)
        ↓
FFmpeg Audio Extraction → WhisperX Transcription
        ↓
OpenCV Face Analysis → DeepFace Emotion Analysis
        ↓
GPT-4o-mini LLM Evaluation
        ↓
Scoring Engine → MongoDB Storage
        ↓
Session Finalization → Holistic Evaluation → Role-Fit Scoring
        ↓
PDF Report Generation → Admin Dashboard
```

## 3.3 Feasibility Study

### 3.3.1 Technical Feasibility

All technologies employed by HireNetAI are production-grade, open-source, and well-documented:

| Component | Technology | Maturity |
|-----------|-----------|----------|
| Web Framework | FastAPI 0.110+ | Production-ready |
| Speech Model | WhisperX (OpenAI Whisper enhanced) | Research-grade, widely adopted |
| Face Detection | OpenCV Haar Cascade | Industry standard |
| Emotion Analysis | DeepFace | Open-source, GPU/CPU compatible |
| LLM | GPT-4o-mini via OpenRouter | Commercially available |
| Database | MongoDB 6+ with Motor | Production-ready |
| Frontend | React 18 + Vite | Industry standard |
| Containerization | Docker + Docker Compose | Industry standard |

All libraries are installable via pip and npm without proprietary licenses. The system is designed to run on CPU, making it accessible on standard cloud VMs without GPU requirements.

### 3.3.2 Operational Feasibility

HireNetAI is designed for adoption by:
- University departments conducting technical interviews for internship or placement
- Small and medium enterprises screening candidates for technical roles
- EdTech platforms assessing student communication and presentation skills

The admin dashboard requires no technical training; administrators can view results, download reports, and manage sessions through an intuitive web interface.

### 3.3.3 Economic Feasibility

| Cost Component | Estimated Cost |
|----------------|----------------|
| Server (VPS / Cloud VM) | ₹500–₹2,000/month |
| MongoDB Atlas (M0 Free Tier) | ₹0 (up to 512 MB) |
| OpenAI/OpenRouter API | ~₹0.01 per interview session |
| Domain + SSL | ₹500–₹1,500/year |
| Development Tools | Free (VS Code, Git) |

The total operational cost for a small-scale deployment (up to 500 interviews/month) is estimated at under ₹3,000 per month, which is significantly lower than commercial alternatives.

### 3.3.4 Feasibility Summary

| Feasibility Dimension | Assessment | Justification |
|----------------------|------------|---------------|
| Technical | High | All components are mature, documented, and open-source |
| Operational | High | Simple admin UI; minimal training required |
| Economic | High | Low ongoing cost; no per-seat licensing fees |
| Time | Moderate | Full pipeline development requires 3–4 months |
| Legal | High | No proprietary dependencies; GDPR-compliant data handling possible |
