/**
 * pages/CandidateResults.jsx – Shows a candidate their interview completion status.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Brain, ArrowLeft, CheckCircle, Clock, Loader,
    MessageSquare, AlertCircle, Shield, Cloud
} from 'lucide-react'
import { candidateAPI } from '../services/api'

export default function CandidateResults() {
    const { sessionId } = useParams()
    const navigate = useNavigate()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [polling, setPolling] = useState(false)

    const fetchSession = async () => {
        try {
            const { data } = await candidateAPI.getResult(sessionId)
            setSession(data)
            if (data.status === 'processing' || data.status === 'in_progress') {
                setPolling(true)
            } else {
                setPolling(false)
            }
        } catch {
            toast.error('Failed to load results')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSession()
    }, [sessionId])

    useEffect(() => {
        if (!polling) return
        const interval = setInterval(fetchSession, 8000)
        return () => clearInterval(interval)
    }, [polling])

    if (loading) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <div className="glass rounded-2xl p-8 text-center neon-border">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <p className="text-brand-300">Session not found.</p>
                <Link to="/candidate/dashboard" className="text-brand-400 hover:text-white mt-3 inline-block text-sm">
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    )

    const isProcessing = session.status === 'processing' || session.status === 'in_progress'

    return (
        <div className="min-h-screen animated-bg text-white">

            {/* ── Navbar ─────────────────────────────────────────────────── */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button onClick={() => navigate('/candidate/dashboard')}
                        className="text-brand-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-card">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-brand-400" />
                        <span className="font-semibold">Interview Status</span>
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

                {/* ── Processing banner ─────────────────────────────────── */}
                {isProcessing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="glass rounded-2xl p-5 border border-amber-500/30 flex items-center gap-4">
                        <Loader className="w-6 h-6 text-amber-400 animate-spin shrink-0" />
                        <div>
                            <p className="font-semibold text-amber-300">Interview Being Processed</p>
                            <p className="text-sm text-brand-300 mt-0.5">
                                Your interview is being analyzed. This page refreshes automatically.
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* ── Completion card ─────────────────────────────────── */}
                {!isProcessing && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="glass rounded-3xl p-8 text-center neon-border">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <CheckCircle className="w-10 h-10 text-emerald-400" />
                            <p className="text-2xl font-bold text-emerald-400">Interview Completed</p>
                        </div>
                        <p className="text-brand-300 text-sm">
                            Your interview has been completed successfully.
                        </p>
                        <p className="text-brand-500/60 text-xs mt-4 italic">
                            Results and feedback are only visible to the hiring team.
                        </p>
                    </motion.div>
                )}

                {/* ── Answer transcripts ──────── */}
                {!isProcessing && session.answers?.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-brand-400" /> Your Answers
                        </h2>
                        <div className="space-y-4">
                            {session.answers.map((answer, i) => (
                                <motion.div key={answer.question_id || i}
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.08 }}
                                    className="glass rounded-2xl p-6 neon-border">

                                    <div className="flex items-start gap-3 mb-4">
                                        <span className="w-7 h-7 rounded-lg bg-brand-600/30 text-brand-300 text-sm flex items-center justify-center shrink-0 font-mono">
                                            {i + 1}
                                        </span>
                                        <p className="font-medium text-white leading-relaxed">{answer.question_text}</p>
                                    </div>

                                    {answer.transcript && !answer.transcript.startsWith('[ERROR') && (
                                        <div className="glass rounded-xl p-4 bg-surface-card/50">
                                            <p className="text-xs text-brand-400 mb-2 flex items-center gap-1">
                                                <MessageSquare className="w-3.5 h-3.5" /> Your Response
                                            </p>
                                            <p className="text-brand-200 text-sm leading-relaxed">{answer.transcript}</p>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Empty state ──────────────────────────────────────── */}
                {session.answers?.length === 0 && !isProcessing && (
                    <div className="glass rounded-2xl p-8 text-center text-brand-400 neon-border">
                        <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No answers found for this session.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
