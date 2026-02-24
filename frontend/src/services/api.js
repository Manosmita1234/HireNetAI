/**
 * services/api.js – Centralised Axios instance and all API call functions.
 */

import axios from 'axios'

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
    baseURL: '/api',          // proxied to http://localhost:8000 by Vite
    timeout: 60000,           // 60 s – some processing requests may be slow
    headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// ── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('token')
            localStorage.removeItem('user')
            window.location.href = '/login'
        }
        return Promise.reject(err)
    }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
    signup: (data) => api.post('/auth/signup', data),
    login: (data) => api.post('/auth/login', data),
}

// ── Interview ─────────────────────────────────────────────────────────────────
export const interviewAPI = {
    getQuestions: () => api.get('/interview/questions'),
    startSession: () => api.post('/interview/session/start'),
    completeSession: (sessionId) => api.post(`/interview/session/${sessionId}/complete`),
    getMySessions: () => api.get('/interview/my-sessions'),
    getSession: (sessionId) => api.get(`/interview/session/${sessionId}`),
}

// ── Upload ────────────────────────────────────────────────────────────────────
export const uploadAPI = {
    uploadAnswer: (formData) =>
        api.post('/upload/answer', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,   // 2 min for large video uploads
        }),
    getStatus: (sessionId, questionId) =>
        api.get(`/upload/status/${sessionId}/${questionId}`),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminAPI = {
    listCandidates: () => api.get('/admin/candidates'),
    getSession: (sessionId) => api.get(`/admin/session/${sessionId}`),
    getVideoUrl: (sessionId, questionId) => `/api/admin/session/${sessionId}/video/${questionId}`,
    downloadReport: (sessionId) => api.get(`/admin/session/${sessionId}/report`, { responseType: 'blob' }),
    deleteSession: (sessionId) => api.delete(`/admin/session/${sessionId}`),
    seedQuestions: () => api.post('/admin/seed-questions'),
}

export default api
