/**
 * services/api.js – Central place for ALL communication with the backend server.
 *
 * WHY THIS EXISTS:
 *   Instead of writing the server URL and auth token in every page component,
 *   this file creates a single pre-configured Axios instance ("api") that
 *   all pages import and use.
 *
 * HOW IT WORKS:
 *   1. Every request automatically gets the JWT token attached in the header.
 *   2. If the server returns 401 Unauthorized (token expired/invalid),
 *      the user is automatically logged out and sent to /login.
 *   3. All API functions are grouped by feature (auth, interview, upload, etc.)
 */

import axios from 'axios'   // HTTP client library (like fetch, but more powerful)

// ── Create the shared Axios instance ─────────────────────────────────────────
const api = axios.create({
    baseURL: '/api',    // All requests go to /api/... which Vite proxies to http://localhost:8000
    timeout: 60000,     // Give up if server doesn't respond in 60 seconds
    headers: { 'Content-Type': 'application/json' },  // Tell server we're sending JSON
})

// ── Request Interceptor: automatically attach the user's JWT token ────────────
// This runs before EVERY request is sent — no need to add the token manually each time.
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')   // get saved login token
    if (token) config.headers.Authorization = `Bearer ${token}`  // attach it as Bearer auth
    return config   // continue sending the request
})

// ── Response Interceptor: handle authentication errors globally ───────────────
// This runs after EVERY response comes back from the server.
api.interceptors.response.use(
    (res) => res,   // If response is OK (2xx), just pass it through unchanged
    (err) => {
        // If the server says 401 Unauthorized (e.g., token expired or missing)…
        if (err.response?.status === 401) {
            localStorage.removeItem('token')    // clear the bad token
            localStorage.removeItem('user')     // clear user data
            window.location.href = '/login'     // force redirect to login page
        }
        // For all other errors, pass them along so the calling code can handle them
        return Promise.reject(err)
    }
)


// ── Auth API ──────────────────────────────────────────────────────────────────
// Functions for user registration, login, and password reset.
export const authAPI = {
    // POST /auth/signup → create a new account → returns JWT token
    signup: (data) => api.post('/auth/signup', data),

    // POST /auth/login → sign in with email+password → returns JWT token
    login: (data) => api.post('/auth/login', data),

    // POST /auth/forgot-password → send reset email to user
    forgotPassword: (data) => api.post('/auth/forgot-password', data),

    // POST /auth/reset-password → update password using one-time token
    resetPassword: (data) => api.post('/auth/reset-password', data),
}


// ── Interview API ─────────────────────────────────────────────────────────────
// Functions for managing interview sessions and questions.
export const interviewAPI = {
    // GET /interview/questions → returns the global question bank list
    getQuestions: () => api.get('/interview/questions'),

    // GET /interview/session/:id/questions → returns questions tailored to this session
    getSessionQuestions: (sessionId) => api.get(`/interview/session/${sessionId}/questions`),

    // POST /interview/session/start → creates a new interview session, returns session_id
    startSession: () => api.post('/interview/session/start'),

    // POST /interview/session/:id/complete → marks session done, triggers AI scoring
    completeSession: (sessionId) => api.post(`/interview/session/${sessionId}/complete`),

    // GET /interview/my-sessions → returns all past sessions for the logged-in candidate
    getMySessions: () => api.get('/interview/my-sessions'),

    // GET /interview/session/:id → returns full data for one specific session
    getSession: (sessionId) => api.get(`/interview/session/${sessionId}`),
}


// ── Upload API ────────────────────────────────────────────────────────────────
// Functions for uploading recorded video answers.
export const uploadAPI = {
    // POST /upload/answer → uploads a recorded WebM video file for one question
    // Uses multipart/form-data (not JSON) because it sends binary video data
    uploadAnswer: (formData) =>
        api.post('/upload/answer', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,   // 2 minutes — large video files need more time
        }),

    // GET /upload/status/:sessionId/:questionId → check if a video has been processed yet
    getStatus: (sessionId, questionId) =>
        api.get(`/upload/status/${sessionId}/${questionId}`),
}


// ── Resume API ────────────────────────────────────────────────────────────────
// Functions for uploading a CV/resume to generate tailored interview questions.
export const resumeAPI = {
    // POST /resume/upload → sends PDF/DOCX, returns detected skills + generated questions
    uploadResume: (formData) =>
        api.post('/resume/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,   // 2 minutes — AI question generation can take time
        }),
}


// ── Admin API ─────────────────────────────────────────────────────────────────
// Functions only usable by admin users (protected by the backend as well).
export const adminAPI = {
    // GET /admin/candidates → returns list of all candidate sessions with scores
    listCandidates: () => api.get('/admin/candidates'),

    // GET /admin/session/:id → full session detail including all answers and evaluations
    getSession: (sessionId) => api.get(`/admin/session/${sessionId}`),

    // Returns a URL string (not a fetch call) to stream a video in <video src="…">
    getVideoUrl: (sessionId, questionId) => `/api/admin/session/${sessionId}/video/${questionId}`,

    // GET /admin/session/:id/report → downloads the PDF evaluation report as a file blob
    downloadReport: (sessionId) => api.get(`/admin/session/${sessionId}/report`, { responseType: 'blob' }),

    // DELETE /admin/session/:id → permanently removes a session and its data
    deleteSession: (sessionId) => api.delete(`/admin/session/${sessionId}`),

    // POST /admin/seed-questions → adds default interview questions to the database (first-time setup)
    seedQuestions: () => api.post('/admin/seed-questions'),

    // GET /admin/session/:id/transcript-json → downloads the transcript.json file written to disk
    // Contains all WhisperX transcripts, emotion data, and LLM scores for the session
    downloadTranscriptJson: (sessionId) =>
        api.get(`/admin/session/${sessionId}/transcript-json`),

    // POST /admin/session/:id/rescore → re-runs AI role-fit scoring from the existing transcript.json
    // Useful when GPT was unavailable at interview completion time, or to refresh the decision
    rescoreSession: (sessionId) =>
        api.post(`/admin/session/${sessionId}/rescore`),
}

// Export the raw axios instance in case a component needs it directly
export default api
