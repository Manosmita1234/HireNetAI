/**
 * App.jsx – Application root with routing and protected route guards.
 */

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import CandidateDashboard from './pages/CandidateDashboard'
import InterviewRoom from './pages/InterviewRoom'
import AdminDashboard from './pages/AdminDashboard'
import CandidateDetail from './pages/CandidateDetail'
import CandidateResults from './pages/CandidateResults'
import NotFound from './pages/NotFound'

// ── Route guards ──────────────────────────────────────────────────────────────
function ProtectedRoute({ children, adminOnly = false }) {
    const { user } = useAuth()
    if (!user) return <Navigate to="/login" replace />
    if (adminOnly && user.role !== 'admin') return <Navigate to="/candidate/dashboard" replace />
    return children
}

function GuestRoute({ children }) {
    const { user } = useAuth()
    if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard'} replace />
    return children
}

// ── App shell ─────────────────────────────────────────────────────────────────
function AppRoutes() {
    return (
        <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

            {/* Candidate */}
            <Route path="/candidate/dashboard" element={<ProtectedRoute><CandidateDashboard /></ProtectedRoute>} />
            <Route path="/candidate/interview/:sessionId" element={<ProtectedRoute><InterviewRoom /></ProtectedRoute>} />
            <Route path="/candidate/results/:sessionId" element={<ProtectedRoute><CandidateResults /></ProtectedRoute>} />

            {/* Admin */}
            <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/candidate/:sessionId" element={<ProtectedRoute adminOnly><CandidateDetail /></ProtectedRoute>} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    )
}

export default function App() {
    return (
        <AuthProvider>
            <AppRoutes />
        </AuthProvider>
    )
}
