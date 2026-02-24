/**
 * pages/CandidateResults.jsx – Shows a candidate their own interview results.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Brain, ArrowLeft, CheckCircle, Clock, Loader,
    MessageSquare, BarChart3, Star, TrendingUp, AlertCircle
} from 'lucide-react'
import { interviewAPI } from '../services/api'

const categoryColors = {
    'Highly Recommended': 'from-emerald-500 to-teal-500',
    'Recommended': 'from-blue-500 to-cyan-500',
    'Average': 'from-yellow-500 to-orange-500',
    'Not Recommended': 'from-red-500 to-rose-500',
}

const scoreBar = (score, max = 10) => (
    <div className="w-full h-2 bg-surface-border rounded-full overflow-hidden">
        <div
            className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min((score / max) * 100, 100)}%` }}
        />
    </div>
)

export default function CandidateResults() {
    const { sessionId } = useParams()
    const navigate = useNavigate()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [polling, setPolling] = useState(false)

    const fetchSession = async () => {
        try {
            const { data } = await interviewAPI.getSession(sessionId)
            setSession(data)
            // If still processing, keep polling
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

    // Poll every 8 seconds while still processing
    useEffect(() => {
        if (!polling) return
        const interval = setInterval(fetchSession, 8000)
        return () => clearInterval(interval)
    }, [polling])

    if (loading) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <span className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <div className="glass rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <p className="text-brand-300">Session not found.</p>
                <Link to="/candidate/dashboard" className="text-brand-400 hover:text-white mt-3 inline-block text-sm">
                    ← Back to Dashboard
                </Link>
            </div>
        </div>
    )

    const isProcessing = session.status === 'processing' || session.status === 'in_progress'
    const answers = session.answers || []
    const gradientClass = categoryColors[session.category] || 'from-brand-500 to-purple-500'

    return (
        <div className="min-h-screen animated-bg text-white">
            {/* Navbar */}
            <nav className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button onClick={() => navigate('/candidate/dashboard')}
                        className="text-brand-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-surface-card">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-brand-400" />
                        <span className="font-semibold">Interview Results</span>
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

                {/* Processing banner */}
                {isProcessing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="glass rounded-2xl p-5 border border-yellow-500/30 flex items-center gap-4">
                        <Loader className="w-6 h-6 text-yellow-400 animate-spin shrink-0" />
                        <div>
                            <p className="font-semibold text-yellow-300">AI Analysis In Progress</p>
                            <p className="text-sm text-brand-300 mt-0.5">
                                WhisperX is transcribing your answers and DeepFace is analyzing emotions.
                                This page refreshes automatically — results appear below as each answer completes.
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* Score hero */}
                {!isProcessing && session.final_score !== undefined && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className={`glass rounded-3xl p-8 text-center neon-border bg-gradient-to-br ${gradientClass} bg-opacity-10`}>
                        <p className="text-brand-300 text-sm mb-2">Overall Score</p>
                        <p className="text-7xl font-bold mb-2">{session.final_score?.toFixed(1)}</p>
                        <p className="text-brand-300 text-sm mb-4">out of 10</p>
                        <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r ${gradientClass} text-white`}>
                            {session.category}
                        </span>
                        <p className="text-brand-400 text-xs mt-4">{answers.length} answer(s) evaluated</p>
                    </motion.div>
                )}

                {/* Per-answer breakdown */}
                {answers.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-brand-400" /> Answer Breakdown
                        </h2>
                        <div className="space-y-4">
                            {answers.map((answer, i) => {
                                const llm = answer.llm_evaluation
                                return (
                                    <motion.div key={answer.question_id || i}
                                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                        className="glass rounded-2xl p-6 neon-border">

                                        {/* Question */}
                                        <div className="flex items-start gap-3 mb-4">
                                            <span className="w-7 h-7 rounded-lg bg-brand-600/30 text-brand-300 text-sm flex items-center justify-center shrink-0 font-mono">
                                                {i + 1}
                                            </span>
                                            <p className="font-medium text-white leading-relaxed">{answer.question_text}</p>
                                        </div>

                                        {!answer.processed ? (
                                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                                <Loader className="w-4 h-4 animate-spin" /> Processing…
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {/* Transcript */}
                                                {answer.transcript && !answer.transcript.startsWith('[ERROR') && (
                                                    <div className="glass rounded-xl p-4 bg-brand-950/30">
                                                        <p className="text-xs text-brand-400 mb-2 flex items-center gap-1">
                                                            <MessageSquare className="w-3.5 h-3.5" /> Transcript
                                                        </p>
                                                        <p className="text-brand-200 text-sm leading-relaxed">{answer.transcript}</p>
                                                    </div>
                                                )}

                                                {/* Scores row */}
                                                {llm && (
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        {[
                                                            { label: 'Clarity', val: llm.clarity_score },
                                                            { label: 'Confidence', val: llm.confidence_score },
                                                            { label: 'Logic', val: llm.logic_score },
                                                            { label: 'Relevance', val: llm.relevance_score },
                                                        ].map(({ label, val }) => (
                                                            <div key={label} className="glass rounded-xl p-3">
                                                                <p className="text-xs text-brand-400 mb-1">{label}</p>
                                                                <p className="text-lg font-bold text-white mb-2">{val}<span className="text-brand-400 text-xs">/10</span></p>
                                                                {scoreBar(val)}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Strengths & weaknesses */}
                                                {llm && (llm.strengths?.length || llm.weaknesses?.length) ? (
                                                    <div className="grid sm:grid-cols-2 gap-3">
                                                        {llm.strengths?.length > 0 && (
                                                            <div className="glass rounded-xl p-4 bg-emerald-950/20">
                                                                <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1">
                                                                    <TrendingUp className="w-3.5 h-3.5" /> Strengths
                                                                </p>
                                                                <ul className="space-y-1">
                                                                    {llm.strengths.map((s, j) => (
                                                                        <li key={j} className="text-sm text-brand-200 flex items-start gap-2">
                                                                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />{s}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {llm.weaknesses?.length > 0 && (
                                                            <div className="glass rounded-xl p-4 bg-red-950/20">
                                                                <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                                                                    <AlertCircle className="w-3.5 h-3.5" /> Areas to Improve
                                                                </p>
                                                                <ul className="space-y-1">
                                                                    {llm.weaknesses.map((w, j) => (
                                                                        <li key={j} className="text-sm text-brand-200 flex items-start gap-2">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />{w}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : null}

                                                {/* LLM verdict + reasoning */}
                                                {llm?.reasoning && (
                                                    <div className="glass rounded-xl p-4 bg-purple-950/20">
                                                        <p className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                                                            <Star className="w-3.5 h-3.5" /> AI Verdict: <span className="font-semibold text-purple-300 ml-1">{llm.final_verdict}</span>
                                                        </p>
                                                        <p className="text-sm text-brand-200 leading-relaxed">{llm.reasoning}</p>
                                                    </div>
                                                )}

                                                {/* Emotion + hesitation */}
                                                <div className="flex gap-4 text-sm">
                                                    <div className="glass rounded-xl px-4 py-2">
                                                        <p className="text-brand-400 text-xs">Confidence Index</p>
                                                        <p className="font-semibold">{(answer.confidence_index * 100)?.toFixed(0)}%</p>
                                                    </div>
                                                    <div className="glass rounded-xl px-4 py-2">
                                                        <p className="text-brand-400 text-xs">Hesitation Score</p>
                                                        <p className="font-semibold">{answer.hesitation_score?.toFixed(1)}/10</p>
                                                    </div>
                                                    <div className="glass rounded-xl px-4 py-2">
                                                        <p className="text-brand-400 text-xs">Answer Score</p>
                                                        <p className="font-semibold">{answer.answer_final_score?.toFixed(1)}/10</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {answers.length === 0 && !isProcessing && (
                    <div className="glass rounded-2xl p-8 text-center text-brand-400">
                        <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No answers found for this session.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
