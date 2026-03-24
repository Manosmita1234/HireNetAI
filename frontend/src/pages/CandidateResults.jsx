/**
 * pages/CandidateResults.jsx – Shows a candidate their own evaluation results.
 *
 * What this page does:
 *  1. Reads the sessionId from the URL (e.g. /candidate/results/abc123)
 *  2. Fetches the interview session from the backend (GET /interview/session/:id)
 *  3. If the session is still being processed → shows a yellow "AI Analysis in Progress" banner
 *     and automatically re-fetches every 8 seconds (polling) until processing finishes
 *  4. Once complete → shows:
 *     - A hero card with the final score (e.g. 7.8 / 10) and hiring verdict
 *     - A breakdown of each individual answer with:
 *         • The question text
 *         • The WhisperX transcription (what the candidate said)
 *         • AI scores per answer: Clarity, Logic, Relevance (out of 10)
 *         • Strengths and areas to improve from the LLM
 *         • An AI Verdict and reasoning paragraph
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
// useParams: reads URL parameters like :sessionId from the route definition
import { motion } from 'framer-motion'  // smooth entrance animations
import toast from 'react-hot-toast'    // notification pop-ups
import {
    Brain, ArrowLeft, CheckCircle, Clock, Loader,
    MessageSquare, BarChart3, Star, TrendingUp, AlertCircle
} from 'lucide-react'
import { interviewAPI } from '../services/api'  // API call to fetch session data

// Maps verdict category names to gradient colors for the score card
const categoryColors = {
    'Highly Recommended': 'from-emerald-500 to-teal-500',
    'Recommended': 'from-blue-500 to-cyan-500',
    'Average': 'from-yellow-500 to-orange-500',
    'Not Recommended': 'from-red-500 to-rose-500',
}

/**
 * scoreBar – Renders a horizontal progress bar showing a score visually.
 * @param score  – Number from 0–10
 * @param max    – Maximum value (default 10)
 */
const scoreBar = (score, max = 10) => (
    <div className="w-full h-2 bg-surface-border rounded-full overflow-hidden">
        <div
            className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min((score / max) * 100, 100)}%` }}  // width is percentage of max
        />
    </div>
)

export default function CandidateResults() {
    const { sessionId } = useParams()   // extract :sessionId from the route URL
    const navigate = useNavigate()
    const [session, setSession] = useState(null)  // stores the fetched session data
    const [loading, setLoading] = useState(true)  // true while first fetch is in progress
    const [polling, setPolling] = useState(false) // true when we need to keep re-fetching

    /**
     * fetchSession – Loads the session from the backend and checks if it's done processing.
     */
    const fetchSession = async () => {
        try {
            const { data } = await interviewAPI.getSession(sessionId)
            setSession(data)
            // If the video analysis is still running, enable polling to check again later
            if (data.status === 'processing' || data.status === 'in_progress') {
                setPolling(true)
            } else {
                setPolling(false)  // stop polling once fully complete
            }
        } catch {
            toast.error('Failed to load results')
        } finally {
            setLoading(false)
        }
    }

    // Load the session on first render (when sessionId becomes available)
    useEffect(() => {
        fetchSession()
    }, [sessionId])

    // If session is still processing: re-fetch every 8 seconds automatically
    useEffect(() => {
        if (!polling) return
        const interval = setInterval(fetchSession, 8000)
        return () => clearInterval(interval)  // cleanup: stop polling when component unmounts
    }, [polling])

    // ── Loading screen ────────────────────────────────────────────────────────
    if (loading) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <span className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
    )

    // ── Not found screen ──────────────────────────────────────────────────────
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

    // Determine if the session is still being processed (AI hasn't finished)
    const isProcessing = session.status === 'processing' || session.status === 'in_progress'
    const answers = session.answers || []
    // Use the category to pick the right color gradient for the score hero
    const gradientClass = categoryColors[session.category] || 'from-brand-500 to-purple-500'

    return (
        <div className="min-h-screen animated-bg text-white">

            {/* ── Navbar with back button ──────────────────────────────────── */}
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

                {/* ── Processing banner ────────────────────────────────────── */}
                {/* Shown while WhisperX + DeepFace + LLM are still running */}
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

                {/* ── Final score hero card ─────────────────────────────────── */}
                {/* Only shown once processing is finished and the score is available */}
                {!isProcessing && session.final_score !== undefined && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className={`glass rounded-3xl p-8 text-center neon-border bg-gradient-to-br ${gradientClass} bg-opacity-10`}>
                        <p className="text-brand-300 text-sm mb-2">Overall Score</p>
                        {/* Big bold score number */}
                        <p className="text-7xl font-bold mb-2">{session.final_score?.toFixed(1)}</p>
                        <p className="text-brand-300 text-sm mb-4">out of 10</p>
                        {/* Hiring verdict badge (e.g. "Recommended") */}
                        <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r ${gradientClass} text-white`}>
                            {session.category}
                        </span>
                        <p className="text-brand-400 text-xs mt-4">{answers.length} answer(s) evaluated</p>
                    </motion.div>
                )}

                {/* ── Per-answer breakdown section ─────────────────────────── */}
                {answers.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-brand-400" /> Answer Breakdown
                        </h2>
                        <div className="space-y-4">
                            {/* Render one card per recorded answer */}
                            {answers.map((answer, i) => {
                                const llm = answer.llm_evaluation  // AI evaluation results for this answer
                                return (
                                    <motion.div key={answer.question_id || i}
                                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.08 }}
                                        className="glass rounded-2xl p-6 neon-border">

                                        {/* Question text with question number */}
                                        <div className="flex items-start gap-3 mb-4">
                                            <span className="w-7 h-7 rounded-lg bg-brand-600/30 text-brand-300 text-sm flex items-center justify-center shrink-0 font-mono">
                                                {i + 1}
                                            </span>
                                            <p className="font-medium text-white leading-relaxed">{answer.question_text}</p>
                                        </div>

                                        {/* Show a spinner if this specific answer hasn't been processed yet */}
                                        {!answer.processed ? (
                                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                                <Loader className="w-4 h-4 animate-spin" /> Processing…
                                            </div>
                                        ) : (
                                            <div className="space-y-4">
                                                {/* Transcript: what the candidate actually said */}
                                                {answer.transcript && !answer.transcript.startsWith('[ERROR') && (
                                                    <div className="glass rounded-xl p-4 bg-brand-950/30">
                                                        <p className="text-xs text-brand-400 mb-2 flex items-center gap-1">
                                                            <MessageSquare className="w-3.5 h-3.5" /> Transcript
                                                        </p>
                                                        <p className="text-brand-200 text-sm leading-relaxed">{answer.transcript}</p>
                                                    </div>
                                                )}

                                                {/* Score bars: Clarity, Logic, Relevance (from LLM evaluation) */}
                                                {llm && (
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                        {[
                                                            { label: 'Clarity',   val: llm.clarity_score },
                                                            { label: 'Logic',     val: llm.logic_score },
                                                            { label: 'Relevance', val: llm.relevance_score },
                                                        ].map(({ label, val }) => (
                                                            <div key={label} className="glass rounded-xl p-3">
                                                                <p className="text-xs text-brand-400 mb-1">{label}</p>
                                                                <p className="text-lg font-bold text-white mb-2">{val}<span className="text-brand-400 text-xs">/10</span></p>
                                                                {scoreBar(val)}  {/* visual progress bar */}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Strengths and weaknesses identified by the LLM */}
                                                {llm && (llm.strengths?.length || llm.weaknesses?.length) ? (
                                                    <div className="grid sm:grid-cols-2 gap-3">
                                                        {/* Green "Strengths" box */}
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
                                                        {/* Red "Areas to Improve" box */}
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

                                                {/* AI Verdict: a brief summary + a 1-paragraph reasoning from the LLM */}
                                                {llm?.reasoning && (
                                                    <div className="glass rounded-xl p-4 bg-purple-950/20">
                                                        <p className="text-xs text-purple-400 mb-2 flex items-center gap-1">
                                                            <Star className="w-3.5 h-3.5" /> AI Verdict: <span className="font-semibold text-purple-300 ml-1">{llm.final_verdict}</span>
                                                        </p>
                                                        <p className="text-sm text-brand-200 leading-relaxed">{llm.reasoning}</p>
                                                    </div>
                                                )}

                                                {/* Per-answer composite score */}
                                                <div className="flex gap-4 text-sm">
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

                {/* ── Empty state: no answers and not processing ───────────── */}
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
