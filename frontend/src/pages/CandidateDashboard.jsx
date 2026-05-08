/**
 * pages/CandidateDashboard.jsx – The candidate's main home screen.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Play, Clock, CheckCircle, Loader, LogOut, BarChart3, Eye, Shield, Upload } from 'lucide-react'
import { interviewAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

const statusIcon = {
    'completed':   <CheckCircle className="w-4 h-4 text-emerald-600" />,
    'processing':  <Loader className="w-4 h-4 text-amber-500 animate-spin" />,
    'in_progress': <Clock className="w-4 h-4 text-blue-600" />,
}

export default function CandidateDashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [file, setFile] = useState(null)
    const [dragging, setDragging] = useState(false)
    const [uploadStatus, setUploadStatus] = useState('idle')
    const [sessionId, setSessionId] = useState(null)
    const [skillsDetected, setSkillsDetected] = useState([])
    const fileInputRef = useRef(null)

    const fetchSessions = useCallback(() => {
        interviewAPI.getMySessions()
            .then(({ data }) => setSessions(data.sessions || []))
            .catch(() => toast.error('Failed to load sessions'))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchSessions() }, [fetchSessions])

    useEffect(() => {
        const hasProcessing = sessions.some(s => s.status === 'processing' || s.status === 'in_progress')
        if (!hasProcessing) return
        const id = setInterval(fetchSessions, 8000)
        return () => clearInterval(id)
    }, [sessions, fetchSessions])

    const uploadResume = async (f) => {
        if (!f) return
        setUploadStatus('uploading')
        try {
            const { resumeAPI } = await import('../services/api')
            const formData = new FormData()
            formData.append('resume', f)
            const { data } = await resumeAPI.uploadResume(formData)
            setSessionId(data.session_id)
            setSkillsDetected(data.skills_detected || [])
            setUploadStatus('done')
            toast.success(`${data.skills_detected?.length || 0} skills detected · ${data.questions_count} questions ready!`)
        } catch (err) {
            setUploadStatus('idle')
            toast.error(err.response?.data?.detail || 'Upload failed. Please try again.')
        }
    }

    const handleFileInput = (e) => {
        const picked = e.target.files?.[0]
        if (!picked) return
        const ext = picked.name.toLowerCase()
        if (!ext.endsWith('.pdf') && !ext.endsWith('.docx') && !ext.endsWith('.doc')) {
            toast.error('Only PDF or DOCX files are accepted.')
            return
        }
        if (picked.size > 10 * 1024 * 1024) { toast.error('File must be under 10 MB.'); return }
        setFile(picked); setUploadStatus('idle'); setSessionId(null); setSkillsDetected([])
        uploadResume(picked)
    }

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

    const resetUpload = (e) => {
        e.stopPropagation()
        setFile(null); setUploadStatus('idle'); setSessionId(null); setSkillsDetected([])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    return (
        <div className="min-h-screen bg-slate-50">

            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                            <Brain className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-slate-800">HireNetAI</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-slate-500 text-sm">Hi, {user?.full_name}</span>
                        <button onClick={() => { logout(); navigate('/') }}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-lg hover:bg-slate-100">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-10">

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">Your Interview Dashboard</h1>
                    <p className="text-slate-500">Upload your resume to get personalised questions, then begin your AI-powered interview.</p>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="bg-white rounded-2xl p-8 mb-8 border border-slate-200 shadow-sm"
                >
                    <h2 className="text-2xl font-bold mb-1 text-center text-slate-800">Start a New Interview</h2>
                    <p className="text-slate-500 text-sm text-center mb-6 max-w-md mx-auto">
                        Our AI reads your resume and crafts <span className="text-slate-700 font-semibold">5 personalised questions</span> based on your skills and experience.
                    </p>

                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                        onDragLeave={() => setDragging(false)}
                        onClick={() => (uploadStatus === 'idle') && fileInputRef.current?.click()}
                        className={`
                            relative rounded-xl border-2 border-dashed transition-all duration-300 mb-5
                            flex flex-col items-center justify-center gap-3 py-8 px-6 cursor-pointer
                            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' :
                                uploadStatus === 'done' ? 'border-emerald-500 bg-emerald-50 cursor-default' :
                                    uploadStatus === 'uploading' ? 'border-blue-400 bg-blue-50 cursor-default' :
                                        'border-slate-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer'}
                        `}
                    >
                        <input ref={fileInputRef} type="file"
                            accept=".pdf,.docx,.doc"
                            className="hidden" onChange={handleFileInput} />

                        <AnimatePresence mode="wait">
                            {uploadStatus === 'done' ? (
                                <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-col items-center gap-3 text-center w-full">
                                    <CheckCircle className="w-9 h-9 text-emerald-600" />
                                    <p className="text-emerald-700 font-semibold">Resume analysed!</p>
                                    <p className="text-slate-400 text-xs truncate max-w-xs">{file?.name}</p>

                                    {skillsDetected.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 justify-center max-w-lg mt-1">
                                            {skillsDetected.map((skill) => (
                                                <span key={skill} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <button onClick={resetUpload} className="text-xs text-slate-400 hover:text-slate-600 underline mt-1">
                                        Change file
                                    </button>
                                </motion.div>

                            ) : uploadStatus === 'uploading' ? (
                                <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-3">
                                    <span className="w-9 h-9 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                                    <p className="text-slate-600 text-sm font-medium">Analysing your resume…</p>
                                    <p className="text-slate-400 text-xs truncate max-w-xs">{file?.name}</p>
                                </motion.div>

                            ) : (
                                <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex flex-col items-center gap-2 text-center">
                                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-blue-600" />
                                    </div>
                                    <p className="text-slate-700 font-medium">Drag & drop your resume here</p>
                                    <p className="text-slate-400 text-sm">or click to browse · PDF or DOCX · max 10 MB</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={() => sessionId && navigate(`/candidate/interview/${sessionId}`)}
                            disabled={!sessionId}
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-10 py-3 rounded-xl transition-all duration-300 hover:scale-105 disabled:hover:scale-100">
                            <Play className="w-4 h-4" /> Begin Interview
                        </button>
                        {!sessionId && <p className="text-slate-400 text-xs">Upload your resume above to unlock</p>}
                    </div>
                </motion.div>

                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-800">
                        <BarChart3 className="w-5 h-5 text-slate-400" /> Past Sessions
                    </h2>

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 shadow-sm">
                            No sessions yet. Start your first interview above!
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {sessions.map((session, i) => (
                                <motion.div key={session.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm">
                                            {statusIcon[session.status] || <Clock className="w-4 h-4 text-slate-400" />}
                                            <span className="text-slate-600 capitalize">{session.status?.replace('_', ' ')}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-slate-400 mb-1">
                                                {new Date(session.started_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                            </p>
                                            <p className="text-slate-500 text-sm">{session.answers?.length || 0} answer(s)</p>
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
