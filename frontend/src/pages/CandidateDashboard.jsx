/**
 * pages/CandidateDashboard.jsx – Candidate home showing past sessions + start button.
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Brain, Play, Clock, CheckCircle, Loader, LogOut, BarChart3, Eye } from 'lucide-react'
import { interviewAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'

const categoryColors = {
    'Highly Recommended': 'text-emerald-400 bg-emerald-400/10',
    'Recommended': 'text-blue-400 bg-blue-400/10',
    'Average': 'text-yellow-400 bg-yellow-400/10',
    'Not Recommended': 'text-red-400 bg-red-400/10',
}

const statusIcon = {
    'completed': <CheckCircle className="w-4 h-4 text-emerald-400" />,
    'processing': <Loader className="w-4 h-4 text-yellow-400 animate-spin" />,
    'in_progress': <Clock className="w-4 h-4 text-brand-400" />,
}

export default function CandidateDashboard() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [sessions, setSessions] = useState([])
    const [loading, setLoading] = useState(true)
    const [starting, setStarting] = useState(false)

    const fetchSessions = useCallback(() => {
        interviewAPI.getMySessions()
            .then(({ data }) => setSessions(data.sessions || []))
            .catch(() => toast.error('Failed to load sessions'))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        fetchSessions()
    }, [fetchSessions])

    // Poll every 8s while any session is still processing
    useEffect(() => {
        const hasProcessing = sessions.some(s => s.status === 'processing' || s.status === 'in_progress')
        if (!hasProcessing) return
        const id = setInterval(fetchSessions, 8000)
        return () => clearInterval(id)
    }, [sessions, fetchSessions])

    const startInterview = async () => {
        setStarting(true)
        try {
            const { data } = await interviewAPI.startSession()
            navigate(`/candidate/interview/${data.session_id}`)
        } catch (err) {
            toast.error('Failed to start interview')
        } finally {
            setStarting(false)
        }
    }

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
                        <button onClick={() => { logout(); navigate('/') }}
                            className="text-brand-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-card">
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-10">
                {/* Header */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Your Interview Dashboard</h1>
                    <p className="text-brand-300">Ready to showcase your skills? Start a new AI-powered interview below.</p>
                </motion.div>

                {/* Start CTA */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="glass rounded-2xl p-8 mb-8 neon-border bg-gradient-to-r from-brand-950/60 to-purple-950/40 text-center"
                >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                        <Play className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Start a New Interview</h2>
                    <p className="text-brand-300 mb-6 text-sm max-w-md mx-auto">
                        You'll answer a series of questions on camera. Our AI will analyze your speech,
                        facial expressions, and communication skills in real-time.
                    </p>
                    <button onClick={startInterview} disabled={starting}
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 px-8 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105">
                        {starting
                            ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Starting…</>
                            : <><Play className="w-4 h-4" /> Begin Interview</>}
                    </button>
                </motion.div>

                {/* Past sessions */}
                <div>
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-brand-400" /> Past Sessions
                    </h2>
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <span className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="glass rounded-2xl p-8 text-center text-brand-400">
                            No sessions yet. Start your first interview above!
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {sessions.map((session, i) => (
                                <motion.div key={session.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="glass rounded-2xl p-5 neon-border hover:bg-surface-card transition-all duration-300"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm">
                                            {statusIcon[session.status] || <Clock className="w-4 h-4 text-brand-400" />}
                                            <span className="text-brand-300 capitalize">{session.status?.replace('_', ' ')}</span>
                                        </div>
                                        {session.category && (
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${categoryColors[session.category] || 'text-brand-300 bg-brand-900/30'}`}>
                                                {session.category}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-brand-400 mb-1">
                                                {new Date(session.started_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                                            </p>
                                            <p className="font-semibold text-lg">{session.final_score?.toFixed(1) || '—'}<span className="text-brand-400 text-sm"> / 10</span></p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <p className="text-brand-400 text-sm">{session.answers?.length || 0} answer(s)</p>
                                            <button
                                                onClick={() => navigate(`/candidate/results/${session.id}`)}
                                                className="flex items-center gap-1.5 text-xs text-brand-300 hover:text-white bg-brand-900/40 hover:bg-brand-700/40 px-3 py-1.5 rounded-lg transition-all">
                                                <Eye className="w-3.5 h-3.5" />
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
