/**
 * pages/CandidateDashboard.jsx – The candidate's main home screen.
 *
 * This page has two sections:
 *
 * 1. "Start a New Interview" card:
 *    - A drag-and-drop / click upload zone for PDF or DOCX resumes
 *    - The resume is sent to the backend the moment it's selected (no "Upload" button)
 *    - Backend extracts skills, generates tailored questions, and returns a session_id
 *    - After upload succeeds, the candidate's detected skills are shown as badges
 *    - The "Begin Interview" button becomes active and navigates to /candidate/interview/:sessionId
 *
 * 2. "Past Sessions" section:
 *    - Shows all previous interview sessions as cards
 *    - Each card shows: status, date, final score, verdict, answer count
 *    - "View Results" button → goes to CandidateResults page
 *    - If any session is still processing, the dashboard polls every 8 seconds to update
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'  // for smooth UI transitions
import toast from 'react-hot-toast'
import { Brain, Play, Clock, CheckCircle, Loader, LogOut, BarChart3, Eye } from 'lucide-react'
import { interviewAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

// Maps verdict strings to Tailwind color classes for session cards
const categoryColors = {
    'Highly Recommended': 'text-emerald-400 bg-emerald-400/10',
    'Recommended':        'text-blue-400 bg-blue-400/10',
    'Average':            'text-yellow-400 bg-yellow-400/10',
    'Not Recommended':    'text-red-400 bg-red-400/10',
}

// Icons for each possible session status shown next to the status label
const statusIcon = {
    'completed':   <CheckCircle className="w-4 h-4 text-emerald-400" />,
    'processing':  <Loader className="w-4 h-4 text-yellow-400 animate-spin" />,  // spins while AI is working
    'in_progress': <Clock className="w-4 h-4 text-brand-400" />,
}

export default function CandidateDashboard() {
    const { user, logout } = useAuth()  // current user info + logout function
    const navigate = useNavigate()

    const [sessions, setSessions] = useState([])    // list of past interview sessions
    const [loading, setLoading] = useState(true)    // true while fetching sessions

    // ── Resume upload state ─────────────────────────────────────────────────────
    const [file, setFile] = useState(null)          // the File object the user selected
    const [dragging, setDragging] = useState(false) // true while a file is being dragged over the drop zone
    const [uploadStatus, setUploadStatus] = useState('idle')  // 'idle' | 'uploading' | 'done'
    const [sessionId, setSessionId] = useState(null)          // set after successful upload
    const [skillsDetected, setSkillsDetected] = useState([])  // skill keywords extracted from resume
    const fileInputRef = useRef(null)               // reference to the hidden <input type="file">

    /**
     * fetchSessions – Loads all interview sessions for the logged-in candidate.
     * useCallback ensures this function reference stays stable across re-renders,
     * which is needed because it's used inside a useEffect dependency array.
     */
    const fetchSessions = useCallback(() => {
        interviewAPI.getMySessions()
            .then(({ data }) => setSessions(data.sessions || []))
            .catch(() => toast.error('Failed to load sessions'))
            .finally(() => setLoading(false))
    }, [])

    // Load sessions on first render
    useEffect(() => { fetchSessions() }, [fetchSessions])

    // ── Auto-polling for processing sessions ────────────────────────────────────
    // If any session is still being analyzed by AI (WhisperX/DeepFace/LLM),
    // we check for updates every 8 seconds until processing is done.
    useEffect(() => {
        const hasProcessing = sessions.some(s => s.status === 'processing' || s.status === 'in_progress')
        if (!hasProcessing) return  // no polling needed if nothing is processing
        const id = setInterval(fetchSessions, 8000)
        return () => clearInterval(id)  // stop polling when component unmounts or sessions update
    }, [sessions, fetchSessions])

    // ── Resume upload helper ─────────────────────────────────────────────────────
    /**
     * uploadResume – Called immediately after the user selects a file.
     * Sends the file to the backend as FormData (multipart/form-data).
     * The backend: extracts skills, generates 5 custom questions, creates a session, returns session_id.
     */
    const uploadResume = async (f) => {
        if (!f) return
        setUploadStatus('uploading')  // show spinner in the drop zone
        try {
            // Dynamic import: only loads resumeAPI code when actually needed (lazy loading)
            const { resumeAPI } = await import('../services/api')
            const formData = new FormData()
            formData.append('resume', f)   // key must match the backend's expected field name
            const { data } = await resumeAPI.uploadResume(formData)
            setSessionId(data.session_id)                         // unlocks the "Begin Interview" button
            setSkillsDetected(data.skills_detected || [])         // shows skill badges in drop zone
            setUploadStatus('done')
            toast.success(`${data.skills_detected?.length || 0} skills detected · ${data.questions_count} questions ready!`)
        } catch (err) {
            setUploadStatus('idle')  // reset to allow retry
            toast.error(err.response?.data?.detail || 'Upload failed. Please try again.')
        }
    }

    /**
     * handleFileInput – Called when the user clicks the drop zone and picks a file via OS dialog.
     * Validates file type (PDF or DOCX only) and size (max 10 MB) before uploading.
     */
    const handleFileInput = (e) => {
        const picked = e.target.files?.[0]
        if (!picked) return
        const ext = picked.name.toLowerCase()
        // Reject unsupported file types
        if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc')) {
            toast.error('Only PDF or DOCX files are accepted.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB.'); return }
        // Reset any previous upload state, set the new file, then immediately upload
        setFile(picked); setUploadStatus('idle'); setSessionId(null); setSkillsDetected([])
        uploadResume(picked)
    }

    /**
     * handleDrop – Called when the user drops a file onto the drop zone.
     * Same validation as handleFileInput but gets the file from the drag event.
     */
    const handleDrop = useCallback(async (e) => {
        e.preventDefault(); setDragging(false)
        const picked = e.dataTransfer.files?.[0]
        if (!picked) return
        const ext = picked.name.toLowerCase()
        if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc')) {
            toast.error('Only PDF or DOCX files are accepted.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB.'); return }
        setFile(picked); setUploadStatus('idle'); setSessionId(null); setSkillsDetected([])
        uploadResume(picked)
    }, [])

    /**
     * resetUpload – Clears the upload state so the user can select a different file.
     * e.stopPropagation() prevents the click from bubbling up to the drop zone
     * (which would open the file picker again).
     */
    const resetUpload = (e) => {
        e.stopPropagation()
        setFile(null); setUploadStatus('idle'); setSessionId(null); setSkillsDetected([])
        if (fileInputRef.current) fileInputRef.current.value = ''  // reset the hidden input
    }

    return (
        <div className="min-h-screen animated-bg text-white">

            {/* ── Sticky Navbar ──────────────────────────────────────────────── */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text">HireNetAI</span>
                    </div>
                    {/* Greeting + logout */}
                    <div className="flex items-center gap-4">
                        <span className="text-brand-300 text-sm">Hi, {user?.full_name}</span>
                        <button onClick={() => { logout(); navigate('/') }}
                            className="text-brand-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-card">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-10">

                {/* ── Page Header ──────────────────────────────────────────── */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Your Interview Dashboard</h1>
                    <p className="text-brand-300">Upload your resume to get personalised questions, then begin your AI-powered interview.</p>
                </motion.div>

                {/* ── Start New Interview Card ──────────────────────────────── */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="glass rounded-2xl p-8 mb-8 neon-border bg-gradient-to-r from-brand-950/60 to-purple-950/40"
                >
                    <h2 className="text-2xl font-bold mb-1 text-center">Start a New Interview</h2>
                    <p className="text-brand-300 text-sm text-center mb-6 max-w-md mx-auto">
                        Our AI reads your resume and crafts&nbsp;
                        <span className="text-brand-200 font-semibold">5 personalised questions</span>
                        &nbsp;based on your skills and experience.
                    </p>

                    {/* ── Drop Zone ─────────────────────────────────────────── */}
                    {/*
                      The drop zone has 4 possible visual states:
                        - 'idle'      → default dashed border, clickable
                        - 'dragging'  → highlighted border, slightly scaled up
                        - 'uploading' → spinner shown, not clickable
                        - 'done'      → green border, shows skills, not clickable
                    */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onClick={() => (uploadStatus === 'idle') && fileInputRef.current?.click()}
                        className={`
                            relative rounded-xl border-2 border-dashed transition-all duration-300 mb-5
                            flex flex-col items-center justify-center gap-3 py-8 px-6
                            ${dragging ? 'border-brand-400 bg-brand-900/30 scale-[1.01]' :
                                uploadStatus === 'done' ? 'border-emerald-500/60 bg-emerald-950/20 cursor-default' :
                                    uploadStatus === 'uploading' ? 'border-brand-600/60 bg-brand-950/20 cursor-default' :
                                        'border-brand-700/60 hover:border-brand-500 hover:bg-brand-950/20 cursor-pointer'}
                        `}
                    >
                        {/* Hidden file input – triggered programmatically by the drop zone click */}
                        <input ref={fileInputRef} type="file"
                            accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            className="hidden" onChange={handleFileInput} />

                        {/* AnimatePresence: smoothly transitions between the 3 drop zone states */}
                        <AnimatePresence mode="wait">
                            {uploadStatus === 'done' ? (
                                /* ── Success state: shows skill badges ── */
                                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center gap-3 text-center w-full">
                                    <CheckCircle className="w-9 h-9 text-emerald-400" />
                                    <p className="text-emerald-300 font-semibold">Resume analysed!</p>
                                    <p className="text-brand-400 text-xs truncate max-w-xs">{file?.name}</p>

                                    {/* Skill badges: each skill detected from the resume */}
                                    {skillsDetected.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 justify-center max-w-lg mt-1">
                                            {skillsDetected.map((skill) => (
                                                <span key={skill}
                                                    className="text-xs px-2.5 py-1 rounded-full bg-brand-800/60 border border-brand-600/40 text-brand-200 font-medium">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Option to re-upload a different file */}
                                    <button onClick={resetUpload} className="text-xs text-brand-400 hover:text-brand-200 underline mt-1">
                                        Change file
                                    </button>
                                </motion.div>

                            ) : uploadStatus === 'uploading' ? (
                                /* ── Uploading state: spinner + filename ── */
                                <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-3">
                                    <span className="w-9 h-9 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                                    <p className="text-brand-300 text-sm font-medium">Analysing your resume…</p>
                                    <p className="text-brand-500 text-xs truncate max-w-xs">{file?.name}</p>
                                </motion.div>

                            ) : (
                                /* ── Idle state: drag-and-drop instructions ── */
                                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-2 text-center">
                                    {/* Upload icon */}
                                    <div className="w-12 h-12 rounded-xl bg-brand-800/50 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                    </div>
                                    <p className="text-brand-200 font-medium">Drag &amp; drop your resume here</p>
                                    <p className="text-brand-400 text-sm">or click to browse · PDF or DOCX · max 10 MB</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* ── Begin Interview Button ────────────────────────────── */}
                    {/*
                      This button only becomes active (enabled) once sessionId is set,
                      meaning the resume was successfully uploaded and questions were generated.
                    */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => sessionId && navigate(`/candidate/interview/${sessionId}`)}
                            disabled={!sessionId}  // greyed out until resume is uploaded
                            className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed px-10 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 disabled:hover:scale-100"
                        >
                            <Play className="w-4 h-4" /> Begin Interview
                        </button>
                        {/* Hint shown when button is disabled */}
                        {!sessionId && <p className="text-brand-500 text-xs">Upload your resume above to unlock</p>}
                    </div>
                </motion.div>

                {/* ── Past Sessions Section ─────────────────────────────────── */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-brand-400" /> Past Sessions
                    </h2>

                    {loading ? (
                        /* Loading spinner while fetching sessions */
                        <div className="flex justify-center py-12">
                            <span className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                        </div>
                    ) : sessions.length === 0 ? (
                        /* Empty state for first-time users */
                        <div className="glass rounded-2xl p-8 text-center text-brand-400">
                            No sessions yet. Start your first interview above!
                        </div>
                    ) : (
                        /* Grid of session cards */
                        <div className="grid md:grid-cols-2 gap-4">
                            {sessions.map((session, i) => (
                                <motion.div key={session.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="glass rounded-2xl p-5 neon-border hover:bg-surface-card transition-all duration-300"
                                >
                                    {/* Top row: status icon + status text + verdict badge */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm">
                                            {/* statusIcon map returns the correct icon for the status */}
                                            {statusIcon[session.status] || <Clock className="w-4 h-4 text-brand-400" />}
                                            <span className="text-brand-300 capitalize">{session.status?.replace('_', ' ')}</span>
                                        </div>
                                        {/* Verdict badge with color coding */}
                                        {session.category && (
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${categoryColors[session.category] || 'text-brand-300 bg-brand-900/30'}`}>
                                                {session.category}
                                            </span>
                                        )}
                                    </div>

                                    {/* Bottom row: date + score on the left, answer count + view button on the right */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            {/* Format the session date in a readable way (e.g. "Mar 23, 2025") */}
                                            <p className="text-xs text-brand-400 mb-1">
                                                {new Date(session.started_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                            </p>
                                            {/* Final score, or "—" if not yet available */}
                                            <p className="font-semibold text-lg">{session.final_score?.toFixed(1) || '—'}<span className="text-brand-400 text-sm"> / 10</span></p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <p className="text-brand-400 text-sm">{session.answers?.length || 0} answer(s)</p>
                                            {/* View button → CandidateResults page */}
                                            <button
                                                onClick={() => navigate(`/candidate/results/${session.id}`)}
                                                className="flex items-center gap-1.5 text-xs text-brand-300 hover:text-white bg-brand-900/40 hover:bg-brand-700/40 px-3 py-1.5 rounded-lg transition-all">
                                                <Eye className="w-3.5 h-3.5" />
                                                {/* Button text changes based on whether results are ready */}
                                                {session.status === 'completed' ? 'View Results' : 'View Progress'}
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
