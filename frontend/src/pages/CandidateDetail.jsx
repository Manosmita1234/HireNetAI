/**
 * pages/CandidateDetail.jsx – Admin deep-dive view for a single interview session.
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Doughnut, Bar, Radar } from 'react-chartjs-2'
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
    LinearScale, BarElement, RadialLinearScale, PointElement, LineElement
} from 'chart.js'
import { ArrowLeft, Download, Play, FileText, Brain, ChevronDown, ChevronUp, RefreshCw, FileJson, CheckCircle, XCircle, AlertCircle, Eye, EyeOff, User, VolumeX, ShieldAlert } from 'lucide-react'
import { adminAPI } from '../services/api'
import api from '../services/api'

ChartJS.register(
    ArcElement, Tooltip, Legend, CategoryScale, LinearScale,
    BarElement, RadialLinearScale, PointElement, LineElement
)

const EMOTION_COLORS = {
    happy:    'rgba(16,185,129,0.8)',
    neutral:  'rgba(99,102,241,0.8)',
    sad:      'rgba(59,130,246,0.8)',
    angry:    'rgba(239,68,68,0.8)',
    fear:     'rgba(245,158,11,0.8)',
    surprise: 'rgba(167,139,250,0.8)',
    disgust:  'rgba(132,204,22,0.8)',
}

const verdictColor = (v) => ({
    'Highly Recommended': 'text-emerald-600',
    'Recommended':        'text-blue-600',
    'Average':            'text-yellow-600',
    'Not Recommended':    'text-red-600',
}[v] || 'text-slate-600')

function ScoreBar({ label, value, max = 10 }) {
    const pct = Math.round((value / max) * 100)
    const color = pct >= 70
        ? 'from-emerald-500 to-teal-500'
        : pct >= 40
            ? 'from-blue-500 to-indigo-500'
            : 'from-red-500 to-orange-500'
    return (
        <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">{label}</span>
                <span className="font-semibold text-slate-800">{value}<span className="text-slate-400">/{max}</span></span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className={`h-full bg-gradient-to-r ${color} rounded-full`}
                />
            </div>
        </div>
    )
}

function AnswerCard({ answer, sessionId, index }) {
    const [open, setOpen] = useState(index === 0)
    const [blobUrl, setBlobUrl]       = useState(null)
    const [videoLoading, setVideoLoading] = useState(false)
    const [videoError, setVideoError]   = useState(false)

    // Fetch video blob via axios (sends JWT header) when the card first opens.
    // A plain <video src={url}> would skip the Authorization header → 401.
    useEffect(() => {
        if (!open || blobUrl || videoError) return
        setVideoLoading(true)
        api.get(`/admin/session/${sessionId}/video/${answer.question_id}`, { responseType: 'blob' })
            .then(({ data }) => setBlobUrl(URL.createObjectURL(data)))
            .catch(() => setVideoError(true))
            .finally(() => setVideoLoading(false))
    }, [open, blobUrl, videoError, sessionId, answer.question_id])

    // Revoke the blob URL when the component unmounts to free memory
    useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl) }, [blobUrl])

    const ev = answer.llm_evaluation

    const emoLabels = Object.keys(answer.emotion_distribution || {})
    const emoValues = Object.values(answer.emotion_distribution || {})
    const emoColors = emoLabels.map(e => EMOTION_COLORS[e] || 'rgba(99,102,241,0.8)')

    const doughnutData = {
        labels: emoLabels.map(e => e.charAt(0).toUpperCase() + e.slice(1)),
        datasets: [{ data: emoValues, backgroundColor: emoColors, borderWidth: 2, borderColor: '#ffffff' }],
    }

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

    const chartOptions = { responsive: true, plugins: { legend: { labels: { color: '#64748b', font: { size: 11 } } } } }
    const radarOptions = {
        responsive: true,
        scales: {
            r: {
                ticks: { color: '#6366f1', backdrop: false },
                grid: { color: 'rgba(99,102,241,0.2)' },
                pointLabels: { color: '#64748b', font: { size: 11 } },
                min: 0, max: 10,
            }
        },
        plugins: { legend: { display: false } },
    }

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-4"
        >
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3 text-left">
                    <span className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{index + 1}</span>
                    <span className="font-medium text-sm text-slate-700">{answer.question_text}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-slate-600 text-sm font-semibold">{answer.answer_final_score?.toFixed(1)}/10</span>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
            </button>

            {open && (
                <div className="px-6 pb-6 space-y-6">

                    {/* ── Video Player ─────────────────────────────── */}
                    <div>
                        <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                            <Play className="w-3.5 h-3.5" /> Recorded Answer
                        </h3>
                        {videoLoading && (
                            <div className="w-full rounded-xl h-36 bg-slate-100 flex items-center justify-center">
                                <span className="w-6 h-6 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                            </div>
                        )}
                        {blobUrl && !videoLoading && (
                            <video
                                src={blobUrl}
                                controls
                                className="w-full rounded-xl max-h-64 bg-slate-900"
                            />
                        )}
                        {videoError && !videoLoading && (
                            <div className="w-full rounded-xl h-20 bg-slate-50 border border-slate-200 flex items-center justify-center text-sm text-slate-400">
                                Video not available
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Transcript</h3>
                        <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-200">
                            {answer.transcript || <span className="text-slate-400 italic">No transcript available</span>}
                        </p>
                    </div>



                    <div className="grid md:grid-cols-2 gap-6">
                        {emoLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-slate-600 mb-3">Emotion Distribution</h3>
                                <div className="max-w-xs mx-auto">
                                    <Doughnut data={doughnutData} options={{ ...chartOptions, cutout: '65%' }} />
                                </div>
                            </div>
                        )}

                        {traitLabels.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-slate-600 mb-3">Personality Traits</h3>
                                <Radar data={radarData} options={radarOptions} />
                            </div>
                        )}
                    </div>

                    {ev && (
                        <div>
                            <h3 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><Brain className="w-3.5 h-3.5" /> LLM Evaluation</h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <ScoreBar label="Clarity"   value={ev.clarity_score} />
                                    <ScoreBar label="Logic"     value={ev.logic_score} />
                                    <ScoreBar label="Relevance" value={ev.relevance_score} />
                                    <ScoreBar label="Overall"   value={ev.overall_score} />
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-slate-600 text-sm">Communication:</span>
                                        <span className="font-semibold text-sm text-slate-800">{ev.communication_level}</span>
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
                                            <p className="text-emerald-600 font-semibold mb-1">Strengths</p>
                                            <ul className="space-y-1 text-slate-600">
                                                {ev.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">*</span>{s}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {ev.weaknesses?.length > 0 && (
                                        <div>
                                            <p className="text-red-600 font-semibold mb-1">Weaknesses</p>
                                            <ul className="space-y-1 text-slate-600">
                                                {ev.weaknesses.map((w, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">*</span>{w}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {ev.reasoning && (
                                        <div>
                                            <p className="text-slate-600 font-semibold mb-1">Reasoning</p>
                                            <p className="text-slate-600 leading-relaxed">{ev.reasoning}</p>
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

export default function CandidateDetail() {
    const { sessionId } = useParams()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [downloadingPDF, setDownloadingPDF] = useState(false)
    const [downloadingJSON, setDownloadingJSON] = useState(false)
    const [rescoring, setRescoring] = useState(false)

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

    const rescore = async () => {
        setRescoring(true)
        try {
            const { data } = await adminAPI.rescoreSession(sessionId)
            setSession(prev => ({ ...prev, role_fit_result: data.role_fit }))
            toast.success('Re-scoring complete!')
        } catch { toast.error('Re-scoring failed') }
        finally { setRescoring(false) }
    }

    if (loading) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <span className="w-10 h-10 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
    )

    if (!session) return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400">Session not found.</div>
    )

    const allEmotions = {}
    ;(session.answers || []).forEach(a => {
        Object.entries(a.emotion_distribution || {}).forEach(([k, v]) => {
            allEmotions[k] = (allEmotions[k] || 0) + v
        })
    })
    const aggTotal = Object.values(allEmotions).reduce((s, v) => s + v, 0) || 1
    const aggEmotions = Object.fromEntries(
        Object.entries(allEmotions).map(([k, v]) => [k, Math.round((v / aggTotal) * 100)])
    )

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
            x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(99,102,241,0.1)' } },
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(99,102,241,0.1)' }, max: 100 },
        },
    }

    return (
        <div className="min-h-screen bg-slate-50">

            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link to="/admin/dashboard" className="text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex-1">
                        <h1 className="font-bold text-slate-800">{session.candidate_name}</h1>
                        <p className="text-slate-400 text-xs">{session.candidate_email}</p>
                    </div>
                    <button onClick={downloadJSON} disabled={downloadingJSON}
                        className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 px-4 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] text-slate-700">
                        {downloadingJSON
                            ? <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                            : <><FileJson className="w-4 h-4" /> Download JSON</>}
                    </button>
                    <button onClick={downloadPDF} disabled={downloadingPDF}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] text-white">
                        {downloadingPDF
                            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Download className="w-4 h-4" /> Download PDF</>}
                    </button>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8">

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Final Score', value: `${session.final_score?.toFixed(1)}/10` },
                        { label: 'Verdict',     value: session.category, className: verdictColor(session.category) },
                        { label: 'Status',      value: session.status?.replace('_', ' ') },
                        { label: 'Answers',     value: session.answers?.length || 0 },
                    ].map((s, i) => (
                        <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-center">
                            <p className={`text-2xl font-bold mb-1 ${s.className || 'text-slate-800'}`}>{s.value}</p>
                            <p className="text-slate-400 text-xs capitalize">{s.label}</p>
                        </motion.div>
                    ))}
                </div>

                {Object.keys(aggEmotions).length > 0 && (
                    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-8">
                        <h2 className="font-semibold text-slate-700 mb-4">Overall Emotion Profile</h2>
                        <Bar data={aggBarData} options={barOptions} />
                    </div>
                )}

                {(() => {
                    const rf = session.role_fit_result
                    if (!rf) return null

                    const decisionConfig = {
                        Hire:      { icon: CheckCircle,   text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' },
                        Consider:  { icon: AlertCircle,   text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-700' },
                        Reject:    { icon: XCircle,       text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200',     badge: 'bg-red-100 text-red-700' },
                    }
                    const cfg = decisionConfig[rf.decision] || decisionConfig.Consider
                    const Icon = cfg.icon
                    const scorePct = Math.round(rf.role_fit_score || 0)

                    return (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className={`bg-white rounded-2xl p-6 mb-8 border ${cfg.border}`}>

                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <Icon className={`w-6 h-6 ${cfg.text}`} />
                                    <h2 className="font-semibold text-lg text-slate-800">AI Role-Fit Decision</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${cfg.badge}`}>
                                        {rf.decision}
                                    </span>
                                    <button onClick={rescore} disabled={rescoring} title="Re-run AI scoring from transcript.json"
                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50">
                                        <RefreshCw className={`w-3.5 h-3.5 ${rescoring ? 'animate-spin' : ''}`} />
                                        {rescoring ? 'Scoring…' : 'Re-score'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                                <div className="flex flex-col items-center justify-center">
                                    <p className={`text-5xl font-black ${cfg.text}`}>{scorePct}</p>
                                    <p className="text-slate-400 text-xs mt-1">Role-Fit Score / 100</p>
                                    <div className="w-full mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
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

                                <div className="space-y-3 text-sm">
                                    {rf.strengths?.length > 0 && (
                                        <div>
                                            <p className="text-emerald-600 font-semibold mb-1">Strengths</p>
                                            <ul className="space-y-1 text-slate-600">
                                                {rf.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">*</span>{s}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                    {rf.concerns?.length > 0 && (
                                        <div>
                                            <p className="text-red-600 font-semibold mb-1">Concerns</p>
                                            <ul className="space-y-1 text-slate-600">
                                                {rf.concerns.map((c, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">*</span>{c}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <p className="text-slate-600 font-semibold mb-2 text-sm">Recommendation</p>
                                    <p className="text-slate-600 text-sm leading-relaxed">{rf.recommendation}</p>
                                </div>
                            </div>
                        </motion.div>
                    )
                })()}

                {session.integrity_events && session.integrity_events.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-6 mb-8 border border-amber-200">
                        <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <ShieldAlert className="w-6 h-6 text-amber-500" />
                                <h2 className="font-semibold text-lg text-slate-800">Interview Integrity</h2>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
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
                                    tab_switch: { icon: EyeOff, label: 'Tab Switches', color: 'text-amber-600', bg: 'bg-amber-50' },
                                    face_absent: { icon: Eye, label: 'Face Absent', color: 'text-red-600', bg: 'bg-red-50' },
                                    no_voice: { icon: VolumeX, label: 'Silence', color: 'text-amber-600', bg: 'bg-amber-50' },
                                    multiple_faces: { icon: User, label: 'Multiple Faces', color: 'text-red-600', bg: 'bg-red-50' },
                                }

                                return Object.entries(eventCounts).filter(([_, count]) => count > 0).map(([type, count]) => {
                                    const config = eventLabels[type] || { icon: AlertCircle, label: type, color: 'text-slate-600', bg: 'bg-slate-50' }
                                    const Icon = config.icon
                                    return (
                                        <div key={type} className={`flex items-center justify-between p-3 rounded-xl ${config.bg} border border-slate-200`}>
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${config.color}`} />
                                                <span className="text-sm text-slate-700">{config.label}</span>
                                            </div>
                                            <span className={`text-lg font-bold ${config.color}`}>{count}</span>
                                        </div>
                                    )
                                })
                            })()}
                        </div>

                        <div className="mt-4 max-h-48 overflow-y-auto space-y-2">
                            {session.integrity_events.slice(-10).reverse().map((event, i) => (
                                <div key={i} className="flex items-start gap-3 text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-200">
                                    <div className="shrink-0 mt-0.5">
                                        {event.event_type === 'tab_switch' && <EyeOff className="w-3.5 h-3.5 text-amber-500" />}
                                        {event.event_type === 'face_absent' && <Eye className="w-3.5 h-3.5 text-red-500" />}
                                        {event.event_type === 'no_voice' && <VolumeX className="w-3.5 h-3.5 text-amber-500" />}
                                        {event.event_type === 'multiple_faces' && <User className="w-3.5 h-3.5 text-red-500" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-700 capitalize">{event.event_type.replace('_', ' ')}</span>
                                            {event.question_id && (
                                                <span className="text-slate-400">Q{(session.answers || []).findIndex(a => a.question_id === event.question_id) + 1}</span>
                                            )}
                                        </div>
                                        {event.details && <p className="text-slate-500 mt-0.5">{event.details}</p>}
                                    </div>
                                    <div className="shrink-0 text-slate-400">
                                        {event.duration_seconds && <span>{event.duration_seconds}s</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                <h2 className="text-xl font-semibold mb-4 text-slate-800">Answer Analysis</h2>
                {(session.answers || []).map((answer, i) => (
                    <AnswerCard key={answer.question_id || i} answer={answer} sessionId={sessionId} index={i} />
                ))}
            </div>
        </div>
    )
}
