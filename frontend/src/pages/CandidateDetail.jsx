/**
 * pages/CandidateDetail.jsx – Admin deep-dive view for a single interview session.
 *
 * This page shows EVERYTHING about one candidate's interview:
 *  - Summary stats: final score, verdict, answer count, status
 *  - An aggregated emotion bar chart across all answers (Chart.js bar chart)
 *  - An accordion list of every answer, each containing:
 *      • The recorded video (streamable from the backend)
 *      • The WhisperX transcript of what the candidate said
 *      • Nervousness score
 *      • Emotion distribution doughnut chart (DeepFace data)
 *      • Personality traits radar chart
 *      • LLM scores: Clarity, Logic, Relevance, Overall
 *      • Strengths, Weaknesses, Reasoning, Final Verdict
 *  - A "Download PDF" button that generates and downloads the evaluation report
 *
 * Libraries used:
 *  - Chart.js (via react-chartjs-2) for the emotion doughnut, radar, and bar charts
 *  - framer-motion for animations
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
// Chart types from react-chartjs-2 (wrappers around Chart.js)
import { Doughnut, Bar, Radar } from 'react-chartjs-2'
// Register Chart.js components (required before using charts)
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
    LinearScale, BarElement, RadialLinearScale, PointElement, LineElement
} from 'chart.js'
import { ArrowLeft, Download, Play, FileText, Brain, ChevronDown, ChevronUp, RefreshCw, FileJson, CheckCircle, XCircle, AlertCircle, Eye, EyeOff, User, VolumeX, ShieldAlert } from 'lucide-react'
import { adminAPI } from '../services/api'

// This line tells Chart.js which components we want to use (tree-shaking registration)
ChartJS.register(
    ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
    BarElement, RadialLinearScale, PointElement, LineElement
)

// ── Emotion color palette (matched to DeepFace emotion labels) ────────────────
const EMOTION_COLORS = {
    happy:    'rgba(16,185,129,0.8)',   // green
    neutral:  'rgba(99,102,241,0.8)',   // indigo
    sad:      'rgba(59,130,246,0.8)',   // blue
    angry:    'rgba(239,68,68,0.8)',    // red
    fear:     'rgba(245,158,11,0.8)',   // amber
    surprise: 'rgba(167,139,250,0.8)', // purple
    disgust:  'rgba(132,204,22,0.8)',   // lime
}

// ── Helper: verdict string → Tailwind text color ──────────────────────────────
const verdictColor = (v) => ({
    'Highly Recommended': 'text-emerald-400',
    'Recommended':        'text-blue-400',
    'Average':            'text-yellow-400',
    'Not Recommended':    'text-red-400',
}[v] || 'text-brand-300')

// ── ScoreBar component ─────────────────────────────────────────────────────────
/**
 * ScoreBar – Renders a labeled progress bar for one score (e.g. Clarity: 7/10).
 * @param label  – Name displayed above the bar (e.g. "Clarity")
 * @param value  – Numeric score (e.g. 7)
 * @param max    – Maximum possible score (default 10)
 *
 * Color logic:
 *  - >= 70% of max → green gradient
 *  - >= 40% of max → indigo/purple gradient
 *  - < 40% of max  → red/orange gradient
 */
function ScoreBar({ label, value, max = 10 }) {
    const pct = Math.round((value / max) * 100)
    const color = pct >= 70
        ? 'from-emerald-500 to-teal-500'
        : pct >= 40
            ? 'from-brand-500 to-purple-500'
            : 'from-red-500 to-orange-500'
    return (
        <div className="mb-3">
            {/* Label on the left, score number on the right */}
            <div className="flex justify-between text-sm mb-1">
                <span className="text-brand-300">{label}</span>
                <span className="font-semibold">{value}<span className="text-brand-400">/{max}</span></span>
            </div>
            {/* Animated bar: grows from 0 to pct% width on mount */}
            <div className="h-2 bg-surface rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full bg-gradient-to-r ${color} rounded-full`}
                />
            </div>
        </div>
    )
}

// ── AnswerCard component (accordion) ──────────────────────────────────────────
/**
 * AnswerCard – Collapsible card showing everything about one answer.
 * Clicking the header toggles the expanded content.
 *
 * @param answer     – Answer object from the session data
 * @param sessionId  – Used to build the video streaming URL
 * @param index      – Position of this answer (0-indexed), used for numbering + animation delay
 */
function AnswerCard({ answer, sessionId, index }) {
    // First answer starts open, the rest start collapsed
    const [open, setOpen] = useState(index === 0)

    // Build the video streaming URL from the admin API
    const videoUrl = adminAPI.getVideoUrl(sessionId, answer.question_id)
    const ev = answer.llm_evaluation  // shorthand for the LLM evaluation object

    // ── Build emotion doughnut chart data ──────────────────────────────────────
    // answer.emotion_distribution is like { happy: 0.4, neutral: 0.5, sad: 0.1 }
    const emoLabels = Object.keys(answer.emotion_distribution || {})
    const emoValues = Object.values(answer.emotion_distribution || {})
    const emoColors = emoLabels.map(e => EMOTION_COLORS[e] || 'rgba(99,102,241,0.8)')

    const doughnutData = {
        labels: emoLabels.map(e => e.charAt(0).toUpperCase() + e.slice(1)),  // capitalize first letter
        datasets: [{ data: emoValues, backgroundColor: emoColors, borderWidth: 2, borderColor: '#1a1830' }],
    }

    // ── Build personality radar chart data ────────────────────────────────────
    // ev.personality_traits is like { leadership: 7, empathy: 9, confidence: 6 }
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

    // Shared chart styling options
    const chartOptions = { responsive: true, plugins: { legend: { labels: { color: '#a5b4fc', font: { size: 11 } } } } }
    const radarOptions = {
        responsive: true,
        scales: {
            r: {
                ticks: { color: '#6366f1', backdrop: false },
                grid: { color: 'rgba(99,102,241,0.2)' },
                pointLabels: { color: '#a5b4fc', font: { size: 11 } },
                min: 0, max: 10,  // all trait scores are on a 0–10 scale
            }
        },
        plugins: { legend: { display: false } },
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
            className="glass rounded-2xl neon-border overflow-hidden mb-4"
        >
            {/* ── Accordion Header – always visible, click to expand/collapse ── */}
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-surface-card/30 transition-colors"
            >
                <div className="flex items-center gap-3 text-left">
                    {/* Question number badge */}
                    <span className="w-7 h-7 rounded-lg bg-brand-600/40 flex items-center justify-center text-xs font-bold text-brand-300">{index + 1}</span>
                    <span className="font-medium text-sm">{answer.question_text}</span>
                </div>
                {/* Score + expand/collapse icon */}
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-brand-300 text-sm font-semibold">{answer.answer_final_score?.toFixed(1)}/10</span>
                    {open ? <ChevronUp className="w-4 h-4 text-brand-400" /> : <ChevronDown className="w-4 h-4 text-brand-400" />}
                </div>
            </button>

            {/* ── Expanded content (only rendered when open === true) ──────── */}
            {open && (
                <div className="px-6 pb-6 space-y-6">

                    {/* Video player (streams the recorded answer from the backend) */}
                    {answer.video_path ? (
                        <div>
                            <h3 className="text-sm font-semibold text-brand-300 mb-2 flex items-center gap-2"><Play className="w-3.5 h-3.5" /> Recorded Answer</h3>
                            <video 
                                src={videoUrl} 
                                controls 
                                className="w-full rounded-xl max-h-64 bg-black"
                                onError={(e) => {
                                    console.error('Video load error:', e);
                                    e.target.style.display = 'none';
                                    e.target.nextSibling?.classList.remove('hidden');
                                }}
                            />
                            <div className="hidden text-brand-400 text-sm mt-2">Video unavailable</div>
                        </div>
                    ) : (
                        <div className="text-brand-500 text-sm italic">No video recording</div>
                    )}

                    {/* Transcript from WhisperX speech-to-text */}
                    <div>
                        <h3 className="text-sm font-semibold text-brand-300 mb-2 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Transcript</h3>
                        <p className="text-sm text-brand-200 leading-relaxed glass rounded-xl p-4 bg-surface-card/20">
                            {answer.transcript || <span className="text-brand-500 italic">No transcript available</span>}
                        </p>
                    </div>

                    {/* Charts side by side */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Doughnut chart: emotion percentages from DeepFace */}
                        {emoLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-brand-300 mb-3">Emotion Distribution</h3>
                                <div className="max-w-xs mx-auto">
                                    <Doughnut data={doughnutData} options={{ ...chartOptions, cutout: '65%' }} />
                                </div>
                            </div>
                        )}

                        {/* Radar chart: personality traits from LLM evaluation */}
                        {traitLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-brand-300 mb-3">Personality Traits</h3>
                                <Radar data={radarData} options={radarOptions} />
                            </div>
                        )}
                    </div>

                    {/* LLM evaluation: scores, strengths, weaknesses, reasoning */}
                    {ev && (
                        <div>
                            <h3 className="text-sm font-semibold text-brand-300 mb-3 flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> LLM Evaluation</h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Left column: score bars */}
                                <div>
                                    <ScoreBar label="Clarity"   value={ev.clarity_score} />
                                    <ScoreBar label="Logic"     value={ev.logic_score} />
                                    <ScoreBar label="Relevance" value={ev.relevance_score} />
                                    <ScoreBar label="Overall"   value={ev.overall_score} />
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-brand-300 text-sm">Communication:</span>
                                        <span className="font-semibold text-sm">{ev.communication_level}</span>
                                    </div>
                                    {/* Verdict in color-coded text */}
                                    <div className="mt-2">
                                        <span className={`font-bold text-lg ${verdictColor(ev.final_verdict)}`}>
                                            {ev.final_verdict}
                                        </span>
                                    </div>
                                </div>
                                {/* Right column: strengths, weaknesses, reasoning */}
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

// ── Main CandidateDetail Page ─────────────────────────────────────────────────
export default function CandidateDetail() {
    const { sessionId } = useParams()       // read :sessionId from the URL
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [downloadingPDF, setDownloadingPDF] = useState(false)
    const [downloadingJSON, setDownloadingJSON] = useState(false)
    const [rescoring, setRescoring] = useState(false)

    // Fetch the full session data on page load
    useEffect(() => {
        adminAPI.getSession(sessionId)
            .then(({ data }) => setSession(data))
            .catch(() => toast.error('Failed to load session'))
            .finally(() => setLoading(false))
    }, [sessionId])

    /**
     * downloadPDF – Fetches the PDF report as a binary blob and triggers a browser download.
     *
     * How it works:
     *  1. Calls GET /admin/session/:id/report with responseType: 'blob'
     *  2. Creates a temporary in-memory URL from the blob (URL.createObjectURL)
     *  3. Creates an invisible <a> element, sets its href + download filename, clicks it
     *  4. Cleans up the in-memory URL (URL.revokeObjectURL)
     */
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

    /**
     * downloadJSON – Downloads the transcript.json file from the server.
     * This file contains all WhisperX transcripts, emotion data, and LLM scores.
     */
    const downloadJSON = async () => {
        setDownloadingJSON(true)
        try {
            const { data } = await adminAPI.downloadTranscriptJson(sessionId)
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
            const a = document.createElement('a')
            a.href = url; a.download = `transcript_${sessionId.slice(0, 12)}.json`
            a.click(); URL.revokeObjectURL(url)
            toast.success('Transcript JSON downloaded!')
        } catch { toast.error('Transcript JSON not available yet') }
        finally { setDownloadingJSON(false) }
    }

    /**
     * rescore – Re-runs the AI role-fit scoring from the transcript.json file.
     * Useful when GPT was unavailable at interview completion time.
     */
    const rescore = async () => {
        setRescoring(true)
        try {
            const { data } = await adminAPI.rescoreSession(sessionId)
            // Update the session state with the new role_fit_result
            setSession(prev => ({ ...prev, role_fit_result: data.role_fit }))
            toast.success('Re-scoring complete!')
        } catch { toast.error('Re-scoring failed') }
        finally { setRescoring(false) }
    }

    // Loading spinner
    if (loading) return (
        <div className="min-h-screen animated-bg flex items-center justify-center">
            <span className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen animated-bg flex items-center justify-center text-brand-400">Session not found.</div>
    )

    // ── Aggregate emotion percentages across all answers ───────────────────────
    // Each answer has an emotion_distribution object like { happy: 0.3, neutral: 0.7 }
    // We sum them up and normalize to get overall emotion percentages for the session.
    const allEmotions = {}
    ;(session.answers || []).forEach(a => {
        Object.entries(a.emotion_distribution || {}).forEach(([k, v]) => {
            allEmotions[k] = (allEmotions[k] || 0) + v
        })
    })
    const aggTotal = Object.values(allEmotions).reduce((s, v) => s + v, 0) || 1  // avoid divide by zero
    // Convert to percentages (0–100)
    const aggEmotions = Object.fromEntries(
        Object.entries(allEmotions).map(([k, v]) => [k, Math.round((v / aggTotal) * 100)])
    )

    // Build the aggregated bar chart data for Chart.js
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

            {/* ── Navbar with candidate name + PDF download button ─────────── */}
            <div className="glass border-b border-surface-border sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    {/* Back to admin dashboard */}
                    <Link to="/admin/dashboard" className="text-brand-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex-1">
                        <h1 className="font-bold">{session.candidate_name}</h1>
                        <p className="text-brand-400 text-xs">{session.candidate_email}</p>
                    </div>
                    {/* Download transcript JSON button */}
                    <button onClick={downloadJSON} disabled={downloadingJSON}
                        className="flex items-center gap-2 bg-surface-card/60 hover:bg-surface-card border border-surface-border disabled:opacity-50 px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02]">
                        {downloadingJSON
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><FileJson className="w-4 h-4" /> Download JSON</>}
                    </button>
                    {/* Download PDF report button */}
                    <button onClick={downloadPDF} disabled={downloadingPDF}
                        className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 disabled:opacity-50 px-5 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02]">
                        {downloadingPDF
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Download className="w-4 h-4" /> Download PDF</>}
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">

                {/* ── Summary stat cards ───────────────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Final Score', value: `${session.final_score?.toFixed(1)}/10` },
                        { label: 'Verdict',     value: session.category, className: verdictColor(session.category) },
                        { label: 'Status',      value: session.status?.replace('_', ' ') },
                        { label: 'Answers',     value: session.answers?.length || 0 },
                    ].map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                            className="glass rounded-2xl p-5 neon-border text-center">
                            <p className={`text-2xl font-bold mb-1 ${s.className || 'gradient-text'}`}>{s.value}</p>
                            <p className="text-brand-400 text-xs capitalize">{s.label}</p>
                        </motion.div>
                    ))}
                </div>

                {/* ── Aggregated emotion bar chart ─────────────────────────── */}
                {/* Bar chart showing which emotions appeared most across the entire session */}
                {Object.keys(aggEmotions).length > 0 && (
                    <div className="glass rounded-2xl p-6 neon-border mb-8">
                        <h2 className="font-semibold text-brand-200 mb-4">Overall Emotion Profile</h2>
                        <Bar data={aggBarData} options={barOptions} />
                    </div>
                )}

                {/* ── Role-Fit Decision Card (from json_scoring_service) ────── */}
                {/* This card shows the AI's final hire/consider/reject verdict    */}
                {/* generated by reading the transcript.json through GPT           */}
                {(() => {
                    const rf = session.role_fit_result
                    if (!rf) return null

                    // Map decision → color scheme and icon
                    const decisionConfig = {
                        Hire:      { icon: CheckCircle,   text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' },
                        Consider:  { icon: AlertCircle,   text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   badge: 'bg-amber-500/20 text-amber-300' },
                        Reject:    { icon: XCircle,       text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     badge: 'bg-red-500/20 text-red-300' },
                    }
                    const cfg = decisionConfig[rf.decision] || decisionConfig.Consider
                    const Icon = cfg.icon
                    const scorePct = Math.round(rf.role_fit_score || 0)

                    return (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className={`glass rounded-2xl p-6 mb-8 border ${cfg.border} ${cfg.bg}`}>

                            {/* Header row: title + decision badge + re-score button */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <Icon className={`w-6 h-6 ${cfg.text}`} />
                                    <h2 className="font-semibold text-lg">AI Role-Fit Decision</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    {/* Decision badge (Hire / Consider / Reject) */}
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${cfg.badge}`}>
                                        {rf.decision}
                                    </span>
                                    {/* Re-score button: re-runs GPT from the JSON file */}
                                    <button onClick={rescore} disabled={rescoring} title="Re-run AI scoring from transcript.json"
                                        className="flex items-center gap-1 text-xs text-brand-400 hover:text-white transition-colors disabled:opacity-50">
                                        <RefreshCw className={`w-3.5 h-3.5 ${rescoring ? 'animate-spin' : ''}`} />
                                        {rescoring ? 'Scoring…' : 'Re-score'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                {/* Left: score gauge */}
                                <div className="flex flex-col items-center justify-center">
                                    <p className={`text-5xl font-black ${cfg.text}`}>{scorePct}</p>
                                    <p className="text-brand-400 text-xs mt-1">Role-Fit Score / 100</p>
                                    {/* Progress bar */}
                                    <div className="w-full mt-3 h-2 bg-surface rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }}
                                            animate={{ width: `${scorePct}%` }}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                            className={`h-full rounded-full ${
                                                rf.decision === 'Hire' ? 'bg-emerald-500' :
                                                rf.decision === 'Consider' ? 'bg-amber-500' : 'bg-red-500'
                                            }`}
                                        />
                                    </div>
                                </div>

                                {/* Middle: strengths + concerns */}
                                <div className="space-y-3 text-sm">
                                    {rf.strengths?.length > 0 && (
                                        <div>
                                            <p className="text-emerald-400 font-semibold mb-1">✅ Strengths</p>
                                            <ul className="space-y-1 text-brand-200">
                                                {rf.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span>{s}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {rf.concerns?.length > 0 && (
                                        <div>
                                            <p className="text-red-400 font-semibold mb-1">⚠️ Concerns</p>
                                            <ul className="space-y-1 text-brand-200">
                                                {rf.concerns.map((c, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span>{c}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                {/* Right: recommendation paragraph */}
                                <div>
                                    <p className="text-brand-300 font-semibold mb-2 text-sm">📋 Recommendation</p>
                                    <p className="text-brand-200 text-sm leading-relaxed">{rf.recommendation}</p>
                                </div>
                            </div>
                        </motion.div>
                    )
                })()}

                {/* ── Interview Integrity Card ─────────────────────────────────── */}
                {session.integrity_events && session.integrity_events.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="glass rounded-2xl p-6 mb-8 border border-amber-500/30 bg-amber-500/5">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="w-6 h-6 text-amber-400" />
                                <h2 className="font-semibold text-lg text-amber-200">Interview Integrity</h2>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300">
                                {session.integrity_events.length} event{session.integrity_events.length !== 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            {(() => {
                                const eventCounts = { tab_switch: 0, face_absent: 0, no_voice: 0, multiple_faces: 0 }
                                session.integrity_events.forEach(e => {
                                    if (eventCounts.hasOwnProperty(e.event_type)) {
                                        eventCounts[e.event_type]++
                                    }
                                })

                                const eventLabels = {
                                    tab_switch: { icon: EyeOff, label: 'Tab Switches', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                    face_absent: { icon: Eye, label: 'Face Absent', color: 'text-red-400', bg: 'bg-red-500/10' },
                                    no_voice: { icon: VolumeX, label: 'Silence', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                                    multiple_faces: { icon: User, label: 'Multiple Faces', color: 'text-red-400', bg: 'bg-red-500/10' },
                                }

                                return Object.entries(eventCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                                    const config = eventLabels[type] || { icon: AlertCircle, label: type, color: 'text-brand-400', bg: 'bg-brand-500/10' }
                                    const Icon = config.icon
                                    return (
                                        <div key={type} className={`flex items-center justify-between p-3 rounded-xl ${config.bg}`}>
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${config.color}`} />
                                                <span className="text-sm text-brand-200">{config.label}</span>
                                            </div>
                                            <span className={`text-lg font-bold ${config.color}`}>{count}</span>
                                        </div>
                                    )
                                })
                            })()}
                        </div>

                        <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
                            {session.integrity_events.slice(-10).reverse().map((event, i) => (
                                <div key={i} className="flex items-start gap-3 text-xs text-brand-300 bg-surface-card/30 rounded-lg p-2">
                                    <div className="shrink-0 mt-0.5">
                                        {event.event_type === 'tab_switch' && <EyeOff className="w-3.5 h-3.5 text-amber-400" />}
                                        {event.event_type === 'face_absent' && <Eye className="w-3.5 h-3.5 text-red-400" />}
                                        {event.event_type === 'no_voice' && <VolumeX className="w-3.5 h-3.5 text-amber-400" />}
                                        {event.event_type === 'multiple_faces' && <User className="w-3.5 h-3.5 text-red-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-brand-200 capitalize">{event.event_type.replace('_', ' ')}</span>
                                            {event.question_id && (
                                                <span className="text-brand-500">• Q{(session.answers || []).findIndex(a => a.question_id === event.question_id) + 1}</span>
                                            )}
                                        </div>
                                        {event.details && <p className="text-brand-400 mt-0.5">{event.details}</p>}
                                    </div>
                                    <div className="shrink-0 text-brand-500">
                                        {event.duration_seconds && <span>{event.duration_seconds}s</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ── Per-answer accordions ─────────────────────────────────── */}
                <h2 className="text-xl font-semibold mb-4">Answer Analysis</h2>
                {(session.answers || []).map((answer, i) => (
                    // Render one AnswerCard per answer (defined as a component above)
                    <AnswerCard key={answer.question_id || i} answer={answer} sessionId={sessionId} index={i} />
                ))}
            </div>
        </div>
    )
}
