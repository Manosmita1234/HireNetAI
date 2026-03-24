/**
 * App.jsx – Application root: defines all URL routes and who can access them.
 *
 * This file answers: "When the user visits /some-url, which page should appear?"
 * It also protects certain pages from being accessed without logging in.
 */

import { Routes, Route, Navigate } from 'react-router-dom'  // React Router tools for URL navigation
import { AuthProvider, useAuth } from './context/AuthContext' // Global login state

// ── Page imports ──────────────────────────────────────────────────────────────
// Each import pulls in one page component (a full-screen UI view).
import LandingPage from './pages/LandingPage'               // The public home/marketing page
import LoginPage from './pages/LoginPage'                   // Email + password login form
import SignupPage from './pages/SignupPage'                 // New account registration form
import ForgotPasswordPage from './pages/ForgotPasswordPage' // "Forgot my password" form
import ResetPasswordPage from './pages/ResetPasswordPage'   // Choose a new password (token-based)
import CandidateDashboard from './pages/CandidateDashboard' // Candidate home: resume upload + sessions list
import ResumeUploadPage from './pages/ResumeUploadPage'     // Standalone resume upload page
import InterviewRoom from './pages/InterviewRoom'           // Live video recording room (one question at a time)
import AdminDashboard from './pages/AdminDashboard'         // Admin list of all candidates and scores
import CandidateDetail from './pages/CandidateDetail'       // Admin deep-dive view for a single candidate
import CandidateResults from './pages/CandidateResults'     // Candidate sees their own evaluation results
import NotFound from './pages/NotFound'                     // Shown for any URL that doesn't match a route


// ── Route Guards ──────────────────────────────────────────────────────────────
// A "route guard" is a wrapper component that checks something BEFORE showing a page.

/**
 * ProtectedRoute – Blocks access to a page if the user is NOT logged in.
 *   - If not logged in → redirect to /login
 *   - If adminOnly=true and user is a candidate → redirect to candidate dashboard
 *   - Otherwise → show the protected page normally
 */
function ProtectedRoute({ children, adminOnly = false }) {
    const { user } = useAuth()  // get the currently logged-in user (null if not logged in)

    // Not logged in at all → send to login page
    if (!user) return <Navigate to="/login" replace />

    // Admin-only page but the user is a regular candidate → reject
    if (adminOnly && user.role !== 'admin') return <Navigate to="/candidate/dashboard" replace />

    // All checks passed → show the page
    return children
}

/**
 * GuestRoute – Blocks access to pages that only make sense when NOT logged in.
 *   - If already logged in → redirect to the appropriate dashboard
 *   - Otherwise → show the page (e.g. login, signup)
 *
 * Prevents a logged-in user from seeing the signup page again.
 */
function GuestRoute({ children }) {
    const { user } = useAuth()

    // Already logged in → send to the right dashboard based on role
    if (user) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/candidate/dashboard'} replace />

    // Not logged in → show the guest page normally
    return children
}


// ── App Shell ─────────────────────────────────────────────────────────────────
/**
 * AppRoutes – Maps every URL path to the correct page component.
 *
 * Routes are grouped into:
 *   - Public:    Anyone can visit (no login needed)
 *   - Candidate: Must be logged in as a candidate
 *   - Admin:     Must be logged in as an admin
 *   - 404:       Catch-all for unknown URLs
 */
function AppRoutes() {
    return (
        <Routes>
            {/* ── Public Routes (no login required) ──────────────────── */}
            <Route path="/" element={<LandingPage />} />

            {/* Wrap login/signup with GuestRoute so logged-in users are redirected away */}
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/signup" element={<GuestRoute><SignupPage /></GuestRoute>} />

            {/* Password reset flow – accessible without login */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* ── Candidate Routes (must be logged in) ───────────────── */}
            <Route path="/candidate/dashboard" element={<ProtectedRoute><CandidateDashboard /></ProtectedRoute>} />
            <Route path="/candidate/resume-upload" element={<ProtectedRoute><ResumeUploadPage /></ProtectedRoute>} />
            {/* :sessionId is a URL parameter – a dynamic value like /candidate/interview/abc123 */}
            <Route path="/candidate/interview/:sessionId" element={<ProtectedRoute><InterviewRoom /></ProtectedRoute>} />
            <Route path="/candidate/results/:sessionId" element={<ProtectedRoute><CandidateResults /></ProtectedRoute>} />

            {/* ── Admin Routes (must be logged in AND be an admin) ────── */}
            <Route path="/admin/dashboard" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/candidate/:sessionId" element={<ProtectedRoute adminOnly><CandidateDetail /></ProtectedRoute>} />

            {/* ── 404 Fallback ─────────────────────────────────────────── */}
            {/* The * wildcard matches any path that didn't match above */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    )
}

/**
 * App – Top-level component exported to main.jsx.
 *
 * Wraps everything in AuthProvider so that ANY component in the app
 * can call useAuth() to get the current user/token without prop-drilling.
 */
export default function App() {
    return (
        <AuthProvider>   {/* Makes login state available app-wide */}
            <AppRoutes />
        </AuthProvider>
    )
}
