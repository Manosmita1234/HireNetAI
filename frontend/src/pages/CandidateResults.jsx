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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <p className="text-slate-600">Session not found.</p>
                <Link to="/candidate/dashboard" className="text-blue-600 hover:text-blue-700 mt-3 inline-block text-sm">
                    Back to Dashboard
                </Link>
            </div>
        </div>
    )

    const isProcessing = session.status === 'processing' || session.status === 'in_progress'

    return (
        <div className="min-h-screen bg-slate-50">

            <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
                    <button onClick={() => navigate('/candidate/dashboard')}
                        className="text-slate-400 hover:text-slate-600 transition-colors p-2 rounded-lg hover:bg-slate-100">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Brain className="w-5 h-5 text-blue-600" />
                        <span className="font-semibold text-slate-700">Interview Status</span>
                    </div>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

                {isProcessing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="bg-white rounded-2xl p-5 border border-amber-200 flex items-center gap-4">
                        <Loader className="w-6 h-6 text-amber-500 animate-spin shrink-0" />
                        <div>
                            <p className="font-semibold text-amber-700">Interview Being Processed</p>
                            <p className="text-sm text-slate-500 mt-0.5">
                                Your interview is being analyzed. This page refreshes automatically.
                            </p>
                        </div>
                    </motion.div>
                )}

                {!isProcessing && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <CheckCircle className="w-10 h-10 text-emerald-600" />
                            <p className="text-2xl font-bold text-emerald-600">Interview Completed</p>
                        </div>
                        <p className="text-slate-500 text-sm">
                            Your interview has been completed successfully.
                        </p>
                        <p className="text-slate-400 text-xs mt-4 italic">
                            Results and feedback are only visible to the hiring team.
                        </p>
                    </motion.div>
                )}

                {!isProcessing && session.answers?.length > 0 && (
                    <div>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-slate-800">
                            <MessageSquare className="w-5 h-5 text-slate-400" /> Your Answers
                        </h2>
                        <div className="space-y-4">
                            {session.answers.map((answer, i) => (
                                <motion.div key={answer.question_id || i}
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.08 }}
                                    className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">

                                    <div className="flex items-start gap-3 mb-4">
                                        <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 text-sm flex items-center justify-center shrink-0 font-mono">
                                            {i + 1}
                                        </span>
                                        <p className="font-medium text-slate-700 leading-relaxed">{answer.question_text}</p>
                                    </div>

                                    {answer.transcript && !answer.transcript.startsWith('[ERROR') && (
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                                                <MessageSquare className="w-3.5 h-3.5" /> Your Response
                                            </p>
                                            <p className="text-slate-600 text-sm leading-relaxed">{answer.transcript}</p>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}

                {session.answers?.length === 0 && !isProcessing && (
                    <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200 shadow-sm">
                        <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
                        <p>No answers found for this session.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
