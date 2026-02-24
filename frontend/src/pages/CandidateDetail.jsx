/**
 * pages/CandidateDetail.jsx – Full session details: video, transcript, emotion charts, LLM eval, PDF download.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Doughnut, Bar, Radar
} from 'react-chartjs-2'
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
    LinearScale, BarElement, RadialLinearScale, PointElement, LineElement
} from 'chart.js'
import {
    ArrowLeft, Download, Play, FileText, Brain, ChevronDown, ChevronUp
} from 'lucide-react'
import { adminAPI } from '../services/api'

// Register chart.js components
ChartJS.register(
    ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
    BarElement, RadialLinearScale, PointElement, LineElement
)

// ── Color maps ────────────────────────────────────────────────────────────────
const EMOTION_COLORS = {
    happy: 'rgba(16,185,129,0.8)',
    neutral: 'rgba(99,102,241,0.8)',
    sad: 'rgba(59,130,246,0.8)',
    angry: 'rgba(239,68,68,0.8)',
    fear: 'rgba(245,158,11,0.8)',
    surprise: 'rgba(167,139,250,0.8)',
    disgust: 'rgba(132,204,22,0.8)',
}

const verdictColor = (v) => ({
    'Highly Recommended': 'text-emerald-400',
    'Recommended': 'text-blue-400',
    'Average': 'text-yellow-400',
    'Not Recommended': 'text-red-400',
}[v] || 'text-brand-300')

// ── Score bar component ───────────────────────────────────────────────────────
function ScoreBar({ label, value, max = 10 }) {
    const pct = Math.round((value / max) * 100)
    const color = pct >= 70 ? 'from-emerald-500 to-teal-500' : pct >= 40 ? 'from-brand-500 to-purple-500' : 'from-red-500 to-orange-500'
    return (
        <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
                <span className="text-brand-300">{label}</span>
                <span className="font-semibold">{value}<span className="text-brand-400">/{max}</span></span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full bg-gradient-to-r ${color} rounded-full`}
                />
            </div>
        </div>
    )
}

// ── Answer accordion ──────────────────────────────────────────────────────────
function AnswerCard({ answer, sessionId, index }) {
    const [open, setOpen] = useState(index === 0)
    const videoUrl = adminAPI.getVideoUrl(sessionId, answer.question_id)
    const ev = answer.llm_evaluation

    // Emotion doughnut data
    const emoLabels = Object.keys(answer.emotion_distribution || {})
    const emoValues = Object.values(answer.emotion_distribution || {})
    const emoColors = emoLabels.map(e => EMOTION_COLORS[e] || 'rgba(99,102,241,0.8)')

    const doughnutData = {
        labels: emoLabels.map(e => e.charAt(0).toUpperCase() + e.slice(1)),
        datasets: [{ data: emoValues, backgroundColor: emoColors, borderWidth: 2, borderColor: '#1a1830' }],
    }

    // Radar data for personality traits
    const traitLabels = ev ? Object.keys(ev.personality_traits || {}) : []
    const traitValues = ev ? Object.values(ev.personality_traits || {}) : []
    const radarData = {
        labels: traitLabels.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
        datasets: [{
            label: 'Traits',
            data: traitValues,
            backgroundColor: 'rgba(99,102,241,0.2)',
            borderColor: 'rgba(99,102,241,0.8)',
            pointBackgroundColor: 'rgba(167,139,250,1)',
            borderWidth: 2,
        }],
    }

    const chartOptions = { responsive: true, plugins: { legend: { labels: { color: '#a5b4fc', font: { size: 11 } } } } }
    const radarOptions = {
        responsive: true,
        scales: { r: { ticks: { color: '#6366f1', backdrop: false }, grid: { color: 'rgba(99,102,241,0.2)' }, pointLabels: { color: '#a5b4fc', font: { size: 11 } }, min: 0, max: 10 } },
        plugins: { legend: { display: false } },
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
            className="glass rounded-2xl neon-border overflow-hidden mb-4"
        >
            {/* Header */}
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-card/30 transition-colors"
            >
                <div className="flex items-center gap-3 text-left">
                    <span className="w-7 h-7 rounded-lg bg-brand-600/40 flex items-center justify-center text-xs font-bold text-brand-300">{index + 1}</span>
                    <span className="font-medium text-sm">{answer.question_text}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-brand-300 text-sm font-semibold">{answer.answer_final_score?.toFixed(1)}/10</span>
                    {open ? <ChevronUp className="w-4 h-4 text-brand-400" /> : <ChevronDown className="w-4 h-4 text-brand-400" />}
                </div>
            </button>

            {open && (
                <div className="px-6 pb-6 space-y-6">
                    {/* Video playback */}
                    {answer.video_path && (
                        <div>
                            <h3 className="text-sm font-semibold text-brand-300 mb-2 flex items-center gap-2"><Play className="w-3.5 h-3.5" /> Recorded Answer</h3>
                            <video src={videoUrl} controls className="w-full rounded-xl max-h-64 bg-black" />
                        </div>
                    )}

                    {/* Transcript */}
                    <div>
                        <h3 className="text-sm font-semibold text-brand-300 mb-2 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Transcript</h3>
                        <p className="text-sm text-brand-200 leading-relaxed glass rounded-xl p-4 bg-surface-card/20">
                            {answer.transcript || <span className="text-brand-500 italic">No transcript available</span>}
                        </p>
                    </div>

                    {/* Metrics row */}
                    <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                            { label: 'Confidence', value: answer.confidence_index?.toFixed(1) },
                            { label: 'Nervousness', value: answer.nervousness_score?.toFixed(1) },
                            { label: 'Hesitation', value: answer.hesitation_score?.toFixed(1) },
                        ].map(m => (
                            <div key={m.label} className="glass rounded-xl p-3 bg-surface-card/20">
                                <p className="text-2xl font-bold gradient-text">{m.value}</p>
                                <p className="text-brand-400 text-xs mt-1">{m.label} /10</p>
                            </div>
                        ))}
                    </div>

                    {/* Charts */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Emotion doughnut */}
                        {emoLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-brand-300 mb-3">Emotion Distribution</h3>
                                <div className="max-w-xs mx-auto">
                                    <Doughnut data={doughnutData} options={{ ...chartOptions, cutout: '65%' }} />
                                </div>
                            </div>
                        )}

                        {/* Personality radar */}
                        {traitLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-brand-300 mb-3">Personality Traits</h3>
                                <Radar data={radarData} options={radarOptions} />
                            </div>
                        )}
                    </div>

                    {/* LLM evaluation */}
                    {ev && (
                        <div>
                            <h3 className="text-sm font-semibold text-brand-300 mb-3 flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> LLM Evaluation</h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <ScoreBar label="Clarity" value={ev.clarity_score} />
                                    <ScoreBar label="Confidence" value={ev.confidence_score} />
                                    <ScoreBar label="Logic" value={ev.logic_score} />
                                    <ScoreBar label="Relevance" value={ev.relevance_score} />
                                    <ScoreBar label="Overall" value={ev.overall_score} />
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-brand-300 text-sm">Communication:</span>
                                        <span className="font-semibold text-sm">{ev.communication_level}</span>
                                    </div>
                                    <div className="mt-2">
                                        <span className={`font-bold text-lg ${verdictColor(ev.final_verdict)}`}>
                                            {ev.final_verdict}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-3 text-sm">
                                    {ev.strengths?.length > 0 && (
                                        <div>
                                            <p className="text-emerald-400 font-semibold mb-1">✅ Strengths</p>
                                            <ul className="space-y-1 text-brand-200">
                                                {ev.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span>{s}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {ev.weaknesses?.length > 0 && (
                                        <div>
                                            <p className="text-red-400 font-semibold mb-1">⚠️ Weaknesses</p>
                                            <ul className="space-y-1 text-brand-200">
                                                {ev.weaknesses.map((w, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span>{w}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {ev.reasoning && (
                                        <div>
                                            <p className="text-brand-300 font-semibold mb-1">💬 Reasoning</p>
                                            <p className="text-brand-200 leading-relaxed">{ev.reasoning}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CandidateDetail() {
    const { sessionId } = useParams()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [downloadingPDF, setDownloadingPDF] = useState(false)

    useEffect(() => {
        adminAPI.getSession(sessionId)
            .then(({ data }) => setSession(data))
            .catch(() => toast.error('Failed to load session'))
            .finally(() => setLoading(false))
    }, [sessionId])

    const downloadPDF = async () => {
        setDownloadingPDF(true)
        try {
            const { data } = await adminAPI.downloadReport(sessionId)
            const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
            const a = document.createElement('a')
            a.href = url; a.download = `report_${sessionId.slice(0, 12)}.pdf`
            a.click(); URL.revokeObjectURL(url)
            toast.success('PDF downloaded!')
        } catch { toast.error('Failed to download report') }
        finally { setDownloadingPDF(false) }
    }

    if (loading) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <span className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen animated-bg flex items-center justify-center text-brand-400">Session not found.</div>
    )

    // Aggregate emotion chart across all answers
    const allEmotions = {}
        ; (session.answers || []).forEach(a => {
            Object.entries(a.emotion_distribution || {}).forEach(([k, v]) => {
                allEmotions[k] = (allEmotions[k] || 0) + v
            })
        })
    const aggTotal = Object.values(allEmotions).reduce((s, v) => s + v, 0) || 1
    const aggEmotions = Object.fromEntries(Object.entries(allEmotions).map(([k, v]) => [k, Math.round((v / aggTotal) * 100)]))

    const aggBarData = {
        labels: Object.keys(aggEmotions).map(e => e.charAt(0).toUpperCase() + e.slice(1)),
        datasets: [{
            label: 'Avg Emotion %',
            data: Object.values(aggEmotions),
            backgroundColor: Object.keys(aggEmotions).map(e => EMOTION_COLORS[e] || 'rgba(99,102,241,0.8)'),
            borderRadius: 6,
            borderWidth: 0,
        }],
    }
    const barOptions = {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.raw}%` } } },
        scales: {
            x: { ticks: { color: '#a5b4fc' }, grid: { color: 'rgba(99,102,241,0.1)' } },
            y: { ticks: { color: '#a5b4fc' }, grid: { color: 'rgba(99,102,241,0.1)' }, max: 100 },
        },
    }

    return (
        <div className="min-h-screen animated-bg text-white">
            {/* Navbar */}
            <div className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link to="/admin/dashboard" className="text-brand-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex-1">
                        <h1 className="font-bold">{session.candidate_name}</h1>
                        <p className="text-brand-400 text-xs">{session.candidate_email}</p>
                    </div>
                    <button onClick={downloadPDF} disabled={downloadingPDF}
                        className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 px-5 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02]">
                        {downloadingPDF
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Download className="w-4 h-4" /> Download PDF</>}
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Final score summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Final Score', value: `${session.final_score?.toFixed(1)}/10` },
                        { label: 'Verdict', value: session.category, className: verdictColor(session.category) },
                        { label: 'Status', value: session.status?.replace('_', ' ') },
                        { label: 'Answers', value: session.answers?.length || 0 },
                    ].map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                            className="glass rounded-2xl p-5 neon-border text-center">
                            <p className={`text-2xl font-bold mb-1 ${s.className || 'gradient-text'}`}>{s.value}</p>
                            <p className="text-brand-400 text-xs capitalize">{s.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* Aggregated emotion bar chart */}
                {Object.keys(aggEmotions).length > 0 && (
                    <div className="glass rounded-2xl p-6 neon-border mb-8">
                        <h2 className="font-semibold text-brand-200 mb-4">Overall Emotion Profile</h2>
                        <Bar data={aggBarData} options={barOptions} />
                    </div>
                )}

                {/* Per-answer accordions */}
                <h2 className="text-xl font-semibold mb-4">Answer Analysis</h2>
                {(session.answers || []).map((answer, i) => (
                    <AnswerCard key={answer.question_id || i} answer={answer} sessionId={sessionId} index={i} />
                ))}
            </div>
        </div>
    )
}
