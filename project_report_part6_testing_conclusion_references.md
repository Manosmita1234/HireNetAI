
# CHAPTER 7: TESTING

## 7.1 Testing Strategy

The testing strategy for HireNetAI follows a multi-level approach aligned with standard industry practices for full-stack AI applications. Due to the asynchronous and multi-service nature of the platform, testing is organized into four levels:

1. **Unit Testing** — Individual service functions tested in isolation
2. **Integration Testing** — API endpoints tested with a real test database
3. **Pipeline Testing** — End-to-end AI processing pipeline tested with sample videos
4. **User Acceptance Testing (UAT)** — Manual functional testing from the end user's perspective

## 7.2 Unit Testing

Unit tests validate individual service functions in isolation using `pytest` with `pytest-asyncio` for async functions. Mock objects are used to isolate the unit under test from its dependencies (database, external APIs, ML models).

### 7.2.1 Scoring Service Unit Tests

| Test Case ID | Test Description | Input | Expected Output | Status |
|-------------|-----------------|-------|-----------------|--------|
| UT-01 | score_single_answer with full LLM scores | clarity=8, confidence=7, logic=9, relevance=8, transcript="Hello world" | Score ≈ 8.01 | Pass |
| UT-02 | score_single_answer with empty transcript | transcript="" | Score = 0.0 | Pass |
| UT-03 | score_single_answer floor enforcement | clarity=1, confidence=1, logic=1, relevance=1, transcript="Yes" | Score = 3.0 (floor) | Pass |
| UT-04 | score_single_answer ceiling cap | clarity=10, confidence=10, logic=10, relevance=10, long transcript | Score = 10.0 (cap) | Pass |
| UT-05 | aggregate_session_score with no answers | answers=[] | {final_score: 0.0, category: "Not Recommended"} | Pass |
| UT-06 | aggregate_session_score with all zeros | all answer_final_score=0.0 | {final_score: 0.0, category: "Not Recommended"} | Pass |
| UT-07 | aggregate_session_score Highly Recommended | avg score=8.5 | category="Highly Recommended" | Pass |
| UT-08 | aggregate_session_score Recommended | avg score=6.5 | category="Recommended" | Pass |
| UT-09 | aggregate_session_score Average | avg score=5.0 | category="Average" | Pass |
| UT-10 | aggregate_session_score Not Recommended | avg score=3.0 | category="Not Recommended" | Pass |

### 7.2.2 Skill Extraction Unit Tests

| Test Case ID | Test Description | Input | Expected Output | Status |
|-------------|-----------------|-------|-----------------|--------|
| UT-11 | extract_skills Python detection | "Python developer with Django" | ["Python", "Django"] in result | Pass |
| UT-12 | extract_skills case-insensitive | "REACT and typescript" | ["React", "TypeScript"] in result | Pass |
| UT-13 | extract_skills returns max 20 | Resume with 30 skills | len(result) <= 20 | Pass |
| UT-14 | extract_skills empty text | "" | [] | Pass |
| UT-15 | extract_skills top skills first | Python appears 5 times, Java 1 time | Python ranks higher than Java | Pass |

### 7.2.3 Emotion Service Unit Tests

| Test Case ID | Test Description | Expected Behavior | Status |
|-------------|-----------------|-------------------|--------|
| UT-16 | confidence_index calculation | happy=60%, neutral=20% → confidence_index = 8.0 | Pass |
| UT-17 | nervousness_score calculation | fear=30%, sad=20%, angry=10% → nervousness_score = 6.0 | Pass |
| UT-18 | Empty frame list | No frames analyzed → return all zeros | Pass |

## 7.3 Integration Testing

Integration tests validate the complete API request-response cycle against a live test MongoDB instance. These tests use `pytest` with `httpx.AsyncClient` and a dedicated test database (`hirenet_test`).

### 7.3.1 Authentication Integration Tests

| Test Case ID | Endpoint | Description | Expected Status | Status |
|-------------|----------|-------------|-----------------|--------|
| IT-01 | POST /auth/signup | Register new user with valid data | 200 OK + token | Pass |
| IT-02 | POST /auth/signup | Register with duplicate email | 400 Bad Request | Pass |
| IT-03 | POST /auth/login | Login with correct credentials | 200 OK + JWT | Pass |
| IT-04 | POST /auth/login | Login with wrong password | 401 Unauthorized | Pass |
| IT-05 | GET /interview/questions | Access without JWT | 401 Unauthorized | Pass |
| IT-06 | GET /interview/questions | Access with valid JWT | 200 OK | Pass |

### 7.3.2 Resume Upload Integration Tests

| Test Case ID | Endpoint | Description | Expected Status | Status |
|-------------|----------|-------------|-----------------|--------|
| IT-07 | POST /resume/upload | Upload valid PDF resume | 200 OK + session_id | Pass |
| IT-08 | POST /resume/upload | Upload valid DOCX resume | 200 OK + session_id | Pass |
| IT-09 | POST /resume/upload | Upload unsupported file type (.txt) | 400 Bad Request | Pass |
| IT-10 | POST /resume/upload | Upload file exceeding 10 MB | 400 Bad Request | Pass |
| IT-11 | POST /resume/upload | PDF with detectable skills (Python, React) | skills_detected contains expected skills | Pass |

### 7.3.3 Admin Integration Tests

| Test Case ID | Endpoint | Description | Expected Status | Status |
|-------------|----------|-------------|-----------------|--------|
| IT-12 | GET /admin/candidates | Access with admin JWT | 200 OK | Pass |
| IT-13 | GET /admin/candidates | Access with candidate JWT | 403 Forbidden | Pass |
| IT-14 | GET /admin/session/{id}/report | Valid session with PDF | 200 OK, content-type: application/pdf | Pass |
| IT-15 | DELETE /admin/session/{id} | Delete existing session | 200 OK | Pass |

## 7.4 Pipeline Testing

The AI processing pipeline is tested using a short sample video (5-second .webm recording) to validate the full chain from upload to score generation.

| Stage | Test | Expected Outcome | Status |
|-------|------|-----------------|--------|
| FFmpeg Audio Extraction | Run on 5s .webm | Produces .wav file in correct format (16kHz, mono) | Pass |
| WhisperX Transcription | Run on extracted .wav | Returns non-empty transcript dict | Pass |
| Hesitation Detection | 3 pauses > 2s in audio | hesitation_score = 4.5 | Pass |
| Face Analysis | Video with 1 face always visible | face_attention_score ≈ 10.0 | Pass |
| DeepFace Emotion | Smiling candidate video | happy% > neutral% in distribution | Pass |
| LLM Evaluation | Short transcript sent to GPT mock | Returns valid LLMEvaluation JSON | Pass |
| Score Computation | Pipeline result with base=7.5 | answer_final_score = 7.85 | Pass |
| MongoDB Update | After pipeline runs | answers.$.processed = True in DB | Pass |

## 7.5 Performance Testing

| Metric | Test Condition | Result |
|--------|---------------|--------|
| API Response Time | 100 concurrent GET /health requests | Average < 15ms |
| Resume Upload API | 20 concurrent uploads | All complete within 5s |
| Video Pipeline | 5 concurrent 30s videos (simulated) | All processed within 3 minutes |
| PDF Generation | 10 sessions with 5 answers each | < 1s per report |

## 7.6 User Acceptance Testing (UAT)

UAT was conducted manually by evaluating the complete candidate interview flow and admin review flow:

| Scenario | Steps | Pass/Fail |
|----------|-------|-----------|
| Candidate Resume Upload | Upload PDF → view generated questions → navigate to interview | Pass |
| Complete Interview | Record all 5 answers → submit → view processing status | Pass |
| Admin Review | Login as admin → view candidate list → open detail page → download PDF | Pass |
| Search & Sort | Search by name → sort by score descending → verify ordering | Pass |
| Delete Session | Admin deletes session → session removed from table | Pass |
| Anonymous Flow | Upload resume without login → complete interview | Pass |
| Integrity Alert | Switch browser tab during interview → event logged in session | Pass |

## 7.7 Test Results Summary

| Test Category | Total Tests | Passed | Failed | Pass Rate |
|--------------|-------------|--------|--------|-----------|
| Unit Tests (Scoring) | 10 | 10 | 0 | 100% |
| Unit Tests (Skill Extraction) | 5 | 5 | 0 | 100% |
| Unit Tests (Emotion) | 3 | 3 | 0 | 100% |
| Integration Tests (Auth) | 6 | 6 | 0 | 100% |
| Integration Tests (Resume) | 5 | 5 | 0 | 100% |
| Integration Tests (Admin) | 4 | 4 | 0 | 100% |
| Pipeline Tests | 8 | 8 | 0 | 100% |
| UAT Scenarios | 7 | 7 | 0 | 100% |
| **TOTAL** | **48** | **48** | **0** | **100%** |

---

# CHAPTER 8: CONCLUSION

## 8.1 Findings

HireNetAI successfully demonstrates that a fully automated, multi-modal AI interview platform can be developed using open-source tools and affordable cloud APIs. The key findings of the project are:

1. **WhisperX Accuracy:** The WhisperX base model achieves acceptable transcription accuracy for clear, English-language speech in quiet recording conditions. Word-level timestamps enable precise hesitation detection, a feature not available in standard Whisper.

2. **DeepFace Emotion Reliability:** Frame-level DeepFace analysis produces meaningful emotion distributions when the candidate's face is well-lit and centered. The 7-emotion classification (happy, sad, angry, fear, disgust, surprise, neutral) provides sufficient granularity for confidence and nervousness scoring.

3. **OpenCV Face Detection Performance:** The Haar Cascade classifier provides fast, CPU-efficient face detection suitable for real-time monitoring. The face attention score effectively penalizes candidates who leave the camera frame or have additional faces visible.

4. **LLM Evaluation Quality:** GPT-4o-mini consistently returns structured JSON evaluations with logically sound scores when given clear transcripts. The four-dimension scoring (clarity, confidence, logic, relevance) aligns well with standard HR interview rubrics.

5. **Scoring Reliability:** The weighted average scoring formula with a 3.0 floor ensures no candidate with a meaningful response receives an arbitrarily low score. Category assignment maps naturally to hiring decision thresholds.

6. **Role-Fit Scoring:** The secondary GPT role-fit analysis from the exported JSON transcript provides an additional signal that correlates with the per-answer scores while incorporating cross-answer reasoning.

7. **System Performance:** The asynchronous pipeline architecture allows multiple interview sessions to be processed concurrently without API blocking, making the system practically scalable.

## 8.2 Limitations

| Limitation | Description | Impact |
|------------|-------------|--------|
| WhisperX Accuracy | Base model struggles with strong accents, background noise, and non-English speech | Incorrect transcripts lead to lower LLM scores |
| DeepFace Latency | Processing every 5th frame is still CPU-intensive for long videos | Slow pipeline on low-RAM VMs |
| OpenAI API Cost | Each interview session consumes approximately 3–5 GPT API calls | Scales linearly with user volume |
| Local Video Storage | Videos stored on local disk; no cloud storage integration | Not suitable for multi-server deployments |
| No Real-Time Analysis | AI pipeline runs post-upload; no live feedback during recording | Candidates cannot get immediate hints |
| Single Language | WhisperX configured for English only in current implementation | Non-English candidates disadvantaged |
| No A/V Quality Check | System does not validate minimum video/audio quality before processing | Poor recordings enter the pipeline |
| No Interview Proctoring | Tab-switch is logged but not enforced (no session termination on violation) | Limited deterrent effect |

## 8.3 Future Scope

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| Multi-language Support | Configure WhisperX for auto-language detection and support Hindi, French, Spanish | High |
| Cloud Video Storage | Integrate AWS S3 or Google Cloud Storage for scalable video storage | High |
| Real-Time Streaming Analysis | Analyze video in real-time using WebRTC and server-sent events | Medium |
| Voice Tone Analysis | Add prosody analysis (pitch, tempo, energy) using librosa or pyannote | Medium |
| ATS Integration | Export evaluation results via standard API to LinkedIn, Greenhouse, Workday | Medium |
| Mobile Application | Build React Native app for mobile interview participation | Low |
| Bias Audit Module | Periodically audit LLM scoring patterns for demographic bias | High |
| Interviewer Panel Mode | Allow human interviewers to join and ask follow-up questions live | Medium |
| Multi-Round Interviews | Support multiple interview rounds with different question banks per round | Medium |
| Candidate Feedback | Send automated personalized feedback emails to candidates after evaluation | Low |

## 8.4 Summary

HireNetAI represents a significant step toward democratizing AI-powered recruitment tools. By combining a modern asynchronous backend (FastAPI + MongoDB), state-of-the-art speech recognition (WhisperX), computer vision (OpenCV + DeepFace), and large language model evaluation (GPT-4o-mini), the platform delivers a comprehensive, transparent, and cost-effective alternative to expensive commercial AI interview solutions. The modular service-layer architecture ensures that individual AI components can be upgraded or replaced independently, making HireNetAI a maintainable and extensible foundation for future development.

---

# CHAPTER 9: REFERENCES

1. Radford, A., Kim, J. W., Xu, T., Brockman, G., McLeavey, C., & Sutskever, I. (2022). *Robust Speech Recognition via Large-Scale Weak Supervision*. OpenAI Technical Report.

2. Bain, M., Huh, J., Han, T., & Zisserman, A. (2023). *WhisperX: Time-Accurate Speech Transcription of Long-Form Audio*. arXiv preprint arXiv:2303.00747.

3. Serengil, S. I., & Ozpinar, A. (2020). *LightFace: A Hybrid Deep Face Recognition Framework*. 2020 Innovations in Intelligent Systems and Applications Conference (ASYU). IEEE.

4. Bradski, G. (2000). *The OpenCV Library*. Dr. Dobb's Journal of Software Tools.

5. Brown, T., Mann, B., Ryder, N., et al. (2020). *Language Models are Few-Shot Learners*. Advances in Neural Information Processing Systems (NeurIPS), 33, 1877–1901.

6. Pantic, M., & Rothkrantz, L. J. M. (2000). *Automatic Analysis of Facial Expressions: The State of the Art*. IEEE Transactions on Pattern Analysis and Machine Intelligence, 22(12), 1424–1445.

7. Ekman, P., & Friesen, W. V. (1978). *Facial Action Coding System: A Technique for the Measurement of Facial Movement*. Consulting Psychologists Press.

8. FastAPI Documentation. (2024). *FastAPI – Modern, Fast (High-Performance) Web Framework for Building APIs*. Retrieved from https://fastapi.tiangolo.com

9. MongoDB Documentation. (2024). *MongoDB Manual – The MongoDB Database Manual*. Retrieved from https://www.mongodb.com/docs

10. React Documentation. (2024). *React – The Library for Web and Native User Interfaces*. Retrieved from https://react.dev

11. Vite Documentation. (2024). *Vite – Next Generation Frontend Tooling*. Retrieved from https://vitejs.dev

12. Lajtha, C., & Leva, C. (2023). *AI-Powered Interview Assessment: Challenges and Opportunities in Human Resource Management*. International Journal of Human-Computer Studies, 178, 103–115.

13. Docker Documentation. (2024). *Docker – Containerize Your Applications*. Retrieved from https://docs.docker.com

14. OpenAI Documentation. (2024). *OpenAI API Reference*. Retrieved from https://platform.openai.com/docs

15. TailwindCSS Documentation. (2024). *Utility-First CSS Framework*. Retrieved from https://tailwindcss.com/docs

16. Framer Motion Documentation. (2024). *Animation Library for React*. Retrieved from https://www.framer.com/motion

17. ReportLab Documentation. (2024). *ReportLab – PDF Generation with Python*. Retrieved from https://www.reportlab.com/docs

18. Pydantic Documentation. (2024). *Data Validation Using Python Type Hints*. Retrieved from https://docs.pydantic.dev
