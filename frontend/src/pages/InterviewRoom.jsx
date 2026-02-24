/**
 * pages/InterviewRoom.jsx – Core page where candidates record video answers.
 *
 * Flow:
 *  1. Load questions from backend
 *  2. Show one question at a time
 *  3. Candidate clicks Record → MediaRecorder starts webcam capture
 *  4. Candidate clicks Stop → blob saved → uploaded to /upload/answer
 *  5. After all answers → session.complete() → redirect to dashboard
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Video, Square, Upload, ChevronRight, CheckCircle,
    Clock, AlertCircle, Brain, Mic, MicOff
} from 'lucide-react'
import { interviewAPI, uploadAPI } from '../services/api'

// Recording status states
const STATUS = { IDLE: 'idle', RECORDING: 'recording', RECORDED: 'recorded', UPLOADING: 'uploading', UPLOADED: 'uploaded' }

export default function InterviewRoom() {
    const { sessionId } = useParams()
    const navigate = useNavigate()

    const [questions, setQuestions] = useState([])
    const [currentIdx, setCurrentIdx] = useState(0)
    const [recordStatus, setRecordStatus] = useState(STATUS.IDLE)
    const [timer, setTimer] = useState(0)
    const [hasPermission, setHasPermission] = useState(null)
    const [completing, setCompleting] = useState(false)

    const videoRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const streamRef = useRef(null)
    const timerRef = useRef(null)

    // ── Load questions + request camera permission ───────────────────────────
    useEffect(() => {
        interviewAPI.getQuestions()
            .then(({ data }) => setQuestions(data.questions || []))
            .catch(() => toast.error('Failed to load questions'))

        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((stream) => {
                streamRef.current = stream
                if (videoRef.current) videoRef.current.srcObject = stream
                setHasPermission(true)
            })
            .catch(() => {
                setHasPermission(false)
                toast.error('Camera/microphone access required!')
            })

        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop())
            clearInterval(timerRef.current)
        }
    }, [])

    // ── Timer logic ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (recordStatus === STATUS.RECORDING) {
            timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
        } else {
            clearInterval(timerRef.current)
            if (recordStatus === STATUS.IDLE) setTimer(0)
        }
        return () => clearInterval(timerRef.current)
    }, [recordStatus])

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    // ── Start Recording ──────────────────────────────────────────────────────
    const startRecording = useCallback(() => {
        if (!streamRef.current) return
        chunksRef.current = []
        const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp8,opus' })
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        mr.onstop = () => setRecordStatus(STATUS.RECORDED)
        mr.start(500)
        mediaRecorderRef.current = mr
        setRecordStatus(STATUS.RECORDING)
    }, [])

    // ── Stop Recording ───────────────────────────────────────────────────────
    const stopRecording = useCallback(() => {
        mediaRecorderRef.current?.stop()
    }, [])

    // ── Upload Answer ────────────────────────────────────────────────────────
    const uploadAnswer = useCallback(async () => {
        if (chunksRef.current.length === 0) { toast.error('No video recorded'); return }
        const question = questions[currentIdx]
        if (!question) return

        setRecordStatus(STATUS.UPLOADING)
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const fd = new FormData()
        fd.append('session_id', sessionId)
        fd.append('question_id', question.id)
        fd.append('question_text', question.text)
        fd.append('video', blob, `answer_${question.id}.webm`)

        try {
            await uploadAPI.uploadAnswer(fd)
            toast.success('Answer uploaded! Moving to next question…')
            setRecordStatus(STATUS.UPLOADED)
        } catch (err) {
            toast.error('Upload failed. Please try again.')
            setRecordStatus(STATUS.RECORDED)
        }
    }, [questions, currentIdx, sessionId])

    // ── Next question ────────────────────────────────────────────────────────
    const nextQuestion = () => {
        setRecordStatus(STATUS.IDLE)
        setTimer(0)
        chunksRef.current = []
        setCurrentIdx(i => i + 1)
    }

    // ── Complete session ─────────────────────────────────────────────────────
    const completeInterview = async () => {
        setCompleting(true)
        try {
            await interviewAPI.completeSession(sessionId)
            toast.success('Interview complete! Your answers are being analyzed.')
            navigate('/candidate/dashboard')
        } catch {
            toast.error('Failed to complete session')
            setCompleting(false)
        }
    }

    const isLastQuestion = currentIdx >= questions.length - 1

    if (hasPermission === false) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center">
                <div className="glass rounded-2xl p-8 max-w-md text-center neon-border">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Camera Access Denied</h2>
                    <p className="text-brand-300 text-sm">Please allow camera and microphone access in your browser settings to proceed.</p>
                </div>
            </div>
        )
    }

    if (questions.length === 0) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center">
                <span className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            </div>
        )
    }

    const currentQuestion = questions[currentIdx]

    return (
        <div className="min-h-screen animated-bg text-white">
            {/* Top bar */}
            <div className="glass border-b border-surface-border">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Brain className="w-6 h-6 text-brand-400" />
                        <span className="font-semibold">Interview in Progress</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-brand-300 text-sm">
                            Question {Math.min(currentIdx + 1, questions.length)} of {questions.length}
                        </span>
                        {/* progress bar */}
                        <div className="w-32 h-2 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${((currentIdx) / questions.length) * 100}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-8">
                {/* ── Video feed ─────────────────────────────────────────────────── */}
                <div>
                    <div className={`relative rounded-2xl overflow-hidden bg-black aspect-video ${recordStatus === STATUS.RECORDING ? 'recording-active' : ''}`}>
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

                        {/* Recording indicator */}
                        {recordStatus === STATUS.RECORDING && (
                            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-sm font-mono text-white">{formatTime(timer)}</span>
                            </div>
                        )}

                        {/* Mic indicator */}
                        <div className="absolute top-4 right-4 glass rounded-full p-2">
                            {recordStatus === STATUS.RECORDING
                                ? <Mic className="w-4 h-4 text-red-400" />
                                : <MicOff className="w-4 h-4 text-brand-400" />}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="mt-4 flex gap-3 justify-center">
                        {recordStatus === STATUS.IDLE && (
                            <button onClick={startRecording}
                                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-6 py-3 rounded-xl font-semibold transition-all hover:scale-105">
                                <Video className="w-4 h-4" /> Start Recording
                            </button>
                        )}
                        {recordStatus === STATUS.RECORDING && (
                            <button onClick={stopRecording}
                                className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-xl font-semibold transition-all hover:scale-105">
                                <Square className="w-4 h-4" /> Stop Recording
                            </button>
                        )}
                        {recordStatus === STATUS.RECORDED && (
                            <>
                                <button onClick={() => setRecordStatus(STATUS.IDLE)}
                                    className="flex items-center gap-2 glass border border-surface-border px-4 py-3 rounded-xl text-sm transition-all hover:bg-surface-card">
                                    Retake
                                </button>
                                <button onClick={uploadAnswer}
                                    className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 px-6 py-3 rounded-xl font-semibold transition-all hover:scale-105">
                                    <Upload className="w-4 h-4" /> Submit Answer
                                </button>
                            </>
                        )}
                        {recordStatus === STATUS.UPLOADING && (
                            <div className="flex items-center gap-2 text-brand-300">
                                <span className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                                Uploading…
                            </div>
                        )}
                        {recordStatus === STATUS.UPLOADED && (
                            <div className="flex items-center gap-2 text-emerald-400">
                                <CheckCircle className="w-5 h-5" /> Uploaded successfully
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Question panel ─────────────────────────────────────────────── */}
                <div className="flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div key={currentIdx}
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="glass rounded-2xl p-6 neon-border flex-1"
                        >
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-mono text-brand-400 bg-brand-900/40 px-2 py-1 rounded-md capitalize">
                                    {currentQuestion?.category}
                                </span>
                                <span className="text-xs text-brand-500 capitalize">{currentQuestion?.difficulty}</span>
                            </div>
                            <p className="text-brand-200 text-xs mb-2">Question {currentIdx + 1}</p>
                            <h2 className="text-xl font-semibold leading-relaxed mb-6">{currentQuestion?.text}</h2>

                            <div className="glass rounded-xl p-4 bg-brand-950/30 text-sm text-brand-300 space-y-2 mb-6">
                                <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-brand-400" /> Suggested: {currentQuestion?.expected_duration_seconds}s</p>
                                <p>💡 Speak clearly and provide specific examples when possible.</p>
                                <p>🎯 Stay on topic and address the question directly.</p>
                            </div>

                            {/* Next / Finish */}
                            {recordStatus === STATUS.UPLOADED && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    {isLastQuestion ? (
                                        <button onClick={completeInterview} disabled={completing}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]">
                                            {completing
                                                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                : <><CheckCircle className="w-4 h-4" /> Finish Interview</>}
                                        </button>
                                    ) : (
                                        <button onClick={nextQuestion}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]">
                                            Next Question <ChevronRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Question dots */}
                    <div className="flex gap-2 mt-4 justify-center">
                        {questions.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i < currentIdx ? 'bg-emerald-400' : i === currentIdx ? 'bg-brand-400 scale-125' : 'bg-surface-border'
                                }`} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
