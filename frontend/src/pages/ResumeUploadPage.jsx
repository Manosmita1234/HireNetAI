/**
 * pages/ResumeUploadPage.jsx
 * Candidate uploads their PDF resume here before the interview starts.
 * The backend generates tailored questions and returns a session_id.
 */

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Brain, LogOut, Upload, FileText, CheckCircle,
    AlertCircle, X, ArrowRight, Sparkles,
} from 'lucide-react'
import { resumeAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ResumeUploadPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [file, setFile] = useState(null)          // selected File object
    const [dragging, setDragging] = useState(false)
    const [status, setStatus] = useState('idle')    // idle | uploading | success | error
    const [errorMsg, setErrorMsg] = useState('')
    const fileInputRef = useRef(null)

    // ── file selection ────────────────────────────────────────────────────────

    const pickFile = useCallback((picked) => {
        if (!picked) return
        if (!picked.name.toLowerCase().endsWith('.pdf')) {
            toast.error('Only PDF files are accepted.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) {
            toast.error('File must be under 10 MB.')
            return
        }
        setFile(picked)
        setStatus('idle')
        setErrorMsg('')
    }, [])

    const onFileInput = (e) => pickFile(e.target.files?.[0])

    const onDrop = useCallback((e) => {
        e.preventDefault()
        setDragging(false)
        pickFile(e.dataTransfer.files?.[0])
    }, [pickFile])

    const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = () => setDragging(false)

    const clearFile = () => {
        setFile(null)
        setStatus('idle')
        setErrorMsg('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ── upload ────────────────────────────────────────────────────────────────

    const handleUpload = async () => {
        if (!file) return
        setStatus('uploading')
        setErrorMsg('')
        try {
            const formData = new FormData()
            formData.append('resume', file)
            const { data } = await resumeAPI.uploadResume(formData)
            setStatus('success')
            toast.success(`${data.questions_count} tailored questions generated!`)
            // short pause so user sees the success state, then navigate
            setTimeout(() => {
                navigate(`/candidate/interview/${data.session_id}`)
            }, 1200)
        } catch (err) {
            const detail = err.response?.data?.detail || 'Upload failed. Please try again.'
            setErrorMsg(detail)
            setStatus('error')
            toast.error(detail)
        }
    }

    // ── render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen animated-bg text-white">

            {/* Navbar */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold gradient-text">HireNetAI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-brand-300 text-sm">Hi, {user?.full_name}</span>
                        <button
                            onClick={() => { logout(); navigate('/') }}
                            className="text-brand-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-card"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main content */}
            <div className="max-w-2xl mx-auto px-6 py-14">

                {/* Page header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-5">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold mb-2">Upload Your Resume</h1>
                    <p className="text-brand-300 text-sm max-w-md mx-auto">
                        Our AI will read your resume and craft&nbsp;
                        <span className="text-brand-200 font-semibold">5 personalized interview questions</span>
                        &nbsp;based on your skills and experience.
                    </p>
                </motion.div>

                {/* Upload card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass rounded-2xl p-8 neon-border"
                >
                    {/* Drop zone */}
                    <div
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onClick={() => !file && fileInputRef.current?.click()}
                        className={`
                            relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer
                            flex flex-col items-center justify-center gap-4 p-10
                            ${dragging
                                ? 'border-brand-400 bg-brand-900/30 scale-[1.01]'
                                : file
                                    ? 'border-brand-600 bg-brand-950/40 cursor-default'
                                    : 'border-brand-700/60 hover:border-brand-500 hover:bg-brand-950/20'
                            }
                        `}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,application/pdf"
                            className="hidden"
                            onChange={onFileInput}
                        />

                        <AnimatePresence mode="wait">
                            {!file ? (
                                <motion.div
                                    key="prompt"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-center"
                                >
                                    <Upload className="w-10 h-10 text-brand-400 mx-auto mb-3" />
                                    <p className="text-brand-200 font-medium">
                                        Drag &amp; drop your PDF here
                                    </p>
                                    <p className="text-brand-400 text-sm mt-1">or click to browse</p>
                                    <p className="text-brand-500 text-xs mt-3">PDF only · max 10 MB</p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="file"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex items-center gap-4 w-full"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-brand-800/50 flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-6 h-6 text-brand-300" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white truncate">{file.name}</p>
                                        <p className="text-brand-400 text-sm">{formatBytes(file.size)}</p>
                                    </div>
                                    {status !== 'uploading' && status !== 'success' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); clearFile() }}
                                            className="p-1.5 rounded-lg text-brand-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Status message – error */}
                    <AnimatePresence>
                        {status === 'error' && errorMsg && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 flex items-center gap-2 text-red-400 bg-red-900/20 rounded-xl px-4 py-3 text-sm"
                            >
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {errorMsg}
                            </motion.div>
                        )}

                        {/* Status message – success */}
                        {status === 'success' && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mt-4 flex items-center gap-2 text-emerald-400 bg-emerald-900/20 rounded-xl px-4 py-3 text-sm"
                            >
                                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                                Questions generated! Starting your interview…
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Actions */}
                    <div className="mt-6 flex items-center gap-4">
                        <button
                            onClick={() => navigate('/candidate/dashboard')}
                            className="flex-1 py-3 rounded-xl border border-brand-700/50 text-brand-300 hover:text-white hover:border-brand-500 transition-all duration-200 text-sm font-medium"
                        >
                            ← Back
                        </button>

                        <button
                            onClick={handleUpload}
                            disabled={!file || status === 'uploading' || status === 'success'}
                            className="flex-[2] inline-flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold text-sm transition-all duration-300 hover:scale-[1.02]"
                        >
                            {status === 'uploading' ? (
                                <>
                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Analysing Resume…
                                </>
                            ) : status === 'success' ? (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    Starting Interview…
                                </>
                            ) : (
                                <>
                                    <ArrowRight className="w-4 h-4" />
                                    Generate Questions &amp; Start
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>

                {/* Info strip */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mt-6 grid grid-cols-3 gap-4 text-center"
                >
                    {[
                        { icon: '🔒', label: 'Private & Secure', sub: 'Resume never stored' },
                        { icon: '🤖', label: 'AI-Powered', sub: 'GPT-4o-mini analysis' },
                        { icon: '⚡', label: 'Instant', sub: 'Questions in seconds' },
                    ].map(({ icon, label, sub }) => (
                        <div key={label} className="glass rounded-xl p-4">
                            <span className="text-2xl">{icon}</span>
                            <p className="text-white text-xs font-semibold mt-2">{label}</p>
                            <p className="text-brand-400 text-xs mt-0.5">{sub}</p>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    )
}
