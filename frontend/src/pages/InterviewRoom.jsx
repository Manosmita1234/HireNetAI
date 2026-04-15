/**
 * pages/InterviewRoom.jsx – The live interview recording page.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
    Video, Square, Upload, ChevronRight, CheckCircle,
    Clock, AlertCircle, Brain, Mic, MicOff, Cloud,
    Maximize, Minimize, Shield, Eye, EyeOff, Volume2, VolumeX,
    AlertTriangle, User, Users
} from 'lucide-react'
import { interviewAPI, uploadAPI } from '../services/api'
import { useIntegrityMonitoring } from '../hooks/useIntegrityMonitoring'

const STATUS = {
    LOADING: 'loading',
    IDLE: 'idle',
    RECORDING: 'recording',
    UPLOADING: 'uploading',
    UPLOADED: 'uploaded',
    COMPLETE: 'complete'
}

const MAX_RECORDING_TIME = 120
const WARNING_TIME = 90

export default function InterviewRoom() {
    const { sessionId } = useParams()
    const navigate = useNavigate()

    const [questions, setQuestions] = useState([])
    const [currentIdx, setCurrentIdx] = useState(0)
    const [interviewStatus, setInterviewStatus] = useState(STATUS.LOADING)
    const [recordStatus, setRecordStatus] = useState(STATUS.IDLE)
    const [timer, setTimer] = useState(0)
    const [hasPermission, setHasPermission] = useState(null)
    const [completing, setCompleting] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [timeWarning, setTimeWarning] = useState(false)

    const videoRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const streamRef = useRef(null)
    const timerRef = useRef(null)
    const containerRef = useRef(null)

    const isRecording = recordStatus === STATUS.RECORDING
    const {
        tabSwitch,
        faceDetection,
        voiceActivity,
        flushAllEvents,
        integrityWarnings,
        hasIssues,
    } = useIntegrityMonitoring(
        videoRef,
        streamRef,
        sessionId,
        questions[currentIdx]?.id,
        isRecording
    )

    useEffect(() => {
        interviewAPI.getSessionQuestions(sessionId)
            .then(({ data }) => {
                setQuestions(data.questions || [])
                setInterviewStatus(STATUS.IDLE)
            })
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
            flushAllEvents()
        }
    }, [flushAllEvents])

    useEffect(() => {
        if (recordStatus === STATUS.RECORDING) {
            timerRef.current = setInterval(() => {
                setTimer(prev => {
                    if (prev >= MAX_RECORDING_TIME) {
                        handleStopRecording()
                        return prev
                    }
                    if (prev >= WARNING_TIME && !timeWarning) {
                        setTimeWarning(true)
                    }
                    return prev + 1
                })
            }, 1000)
        } else {
            clearInterval(timerRef.current)
            if (recordStatus === STATUS.IDLE) {
                setTimer(0)
                setTimeWarning(false)
            }
        }
        return () => clearInterval(timerRef.current)
    }, [recordStatus, timeWarning])

    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    const startRecording = useCallback(() => {
        if (!streamRef.current) return
        chunksRef.current = []
        const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp8,opus' })
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        mr.onstop = () => setRecordStatus(STATUS.RECORDED)
        mr.start(1000)
        mediaRecorderRef.current = mr
        setRecordStatus(STATUS.RECORDING)
    }, [])

    const handleStopRecording = useCallback(() => {
        mediaRecorderRef.current?.stop()
    }, [])

    const stopRecording = () => {
        handleStopRecording()
    }

    const uploadAnswer = useCallback(async () => {
        if (chunksRef.current.length === 0) { toast.error('No video recorded'); return }
        const question = questions[currentIdx]
        if (!question) return

        await flushAllEvents()
        setRecordStatus(STATUS.UPLOADING)
        setUploadProgress(0)

        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const fd = new FormData()
        fd.append('session_id', sessionId)
        fd.append('question_id', question.id)
        fd.append('question_text', question.text)
        fd.append('video', blob, `answer_${question.id}.webm`)

        const progressInterval = setInterval(() => {
            setUploadProgress(prev => Math.min(prev + 15, 90))
        }, 200)

        try {
            await uploadAPI.uploadAnswer(fd)
            clearInterval(progressInterval)
            setUploadProgress(100)
            toast.success('Answer saved!')
            setRecordStatus(STATUS.UPLOADED)
        } catch (err) {
            clearInterval(progressInterval)
            toast.error('Upload failed. Please try again.')
            setRecordStatus(STATUS.RECORDED)
        }
    }, [questions, currentIdx, sessionId])

    const nextQuestion = () => {
        setRecordStatus(STATUS.IDLE)
        setTimer(0)
        setUploadProgress(0)
        setTimeWarning(false)
        chunksRef.current = []
        setCurrentIdx(i => i + 1)
    }

    const completeInterview = async () => {
        setCompleting(true)
        try {
            await interviewAPI.completeSession(sessionId)
            setInterviewStatus(STATUS.COMPLETE)
        } catch {
            toast.error('Failed to complete session')
            setCompleting(false)
        }
    }

    const toggleFullscreen = () => {
        if (!containerRef.current) return
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen()
            setIsFullscreen(true)
        } else {
            document.exitFullscreen()
            setIsFullscreen(false)
        }
    }

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }
        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    const isLastQuestion = currentIdx >= questions.length - 1
    const currentQuestion = questions[currentIdx]

    if (hasPermission === false) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center">
                <div className="glass rounded-2xl p-8 max-w-md text-center neon-border">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2 text-white">Camera Access Required</h2>
                    <p className="text-brand-300 text-sm">Please allow camera and microphone access in your browser settings to proceed with the interview.</p>
                </div>
            </div>
        )
    }

    if (questions.length === 0) {
        return (
            <div className="min-h-screen animated-bg flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (interviewStatus === STATUS.COMPLETE) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="min-h-screen animated-bg flex items-center justify-center p-6">
                <div className="max-w-lg w-full">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                        className="glass rounded-3xl p-8 text-center neon-border">
                        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-emerald-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Interview Completed!</h1>
                        <p className="text-brand-300 mb-6">Your responses have been submitted successfully.</p>

                        <div className="glass rounded-xl p-4 mb-6 text-left border border-brand-500/20">
                            <h3 className="text-sm font-medium text-brand-200 mb-2 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-brand-400" />
                                What happens next?
                            </h3>
                            <p className="text-sm text-brand-300 leading-relaxed">
                                Your interview is being reviewed by our AI analysis system. Once the evaluation is complete,
                                the hiring team will reach out to you within <span className="text-white font-medium">3-5 business days</span>
                                with next steps.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-brand-500 text-xs mb-6">
                            <Cloud className="w-4 h-4" />
                            All answers securely saved
                        </div>

                        <button onClick={() => navigate('/candidate/dashboard')}
                            className="w-full bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-semibold py-3 rounded-xl transition-colors">
                            Return to Dashboard
                        </button>
                    </motion.div>
                </div>
            </motion.div>
        )
    }

    return (
        <div ref={containerRef} className="min-h-screen animated-bg text-white">

            {/* ── Top Bar ─────────────────────────────────────────────── */}
            <div className="glass border-b border-surface-border">
                <div className="max-w-5xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <Brain className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-semibold text-white">AI Interview</h1>
                                <p className="text-xs text-brand-400">{questions.length} Questions</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-sm font-medium text-white">
                                    Question {Math.min(currentIdx + 1, questions.length)} of {questions.length}
                                </p>
                                <p className="text-xs text-brand-400">
                                    {currentIdx} completed
                                </p>
                            </div>
                            <div className="w-40 h-2 bg-surface-card rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${((currentIdx) / questions.length) * 100}%` }}
                                    className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full"
                                />
                            </div>
                            <button onClick={toggleFullscreen} className="p-2 hover:bg-surface-card rounded-lg transition-colors">
                                {isFullscreen ? <Minimize className="w-5 h-5 text-brand-400" /> : <Maximize className="w-5 h-5 text-brand-400" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main Content ───────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-6 py-8">

                {/* ── Interview Grid ─────────────────────────────────── */}
                <div className="grid lg:grid-cols-5 gap-8">

                    {/* ── Left: Video Feed (3 cols) ─────────────────── */}
                    <div className="lg:col-span-3">
                        <div className="relative">
                            <div className={`relative rounded-2xl overflow-hidden bg-slate-900 aspect-video border border-brand-500/30 ${recordStatus === STATUS.RECORDING ? 'ring-2 ring-red-500 recording-active' : ''}`}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                />

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600/90 rounded-full px-3 py-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                                        <span className="text-sm font-medium text-white">REC</span>
                                        <span className="text-sm font-mono text-white ml-1">{formatTime(timer)} / {formatTime(MAX_RECORDING_TIME)}</span>
                                    </div>
                                )}

                                {recordStatus === STATUS.UPLOADED && (
                                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-emerald-600/90 rounded-full px-3 py-1.5">
                                        <Cloud className="w-4 h-4 text-white" />
                                        <span className="text-sm font-medium text-white">Saved</span>
                                    </div>
                                )}

                                <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm rounded-full p-2">
                                    {recordStatus === STATUS.RECORDING
                                        ? <Mic className="w-4 h-4 text-red-400" />
                                        : <MicOff className="w-4 h-4 text-brand-400" />}
                                </div>

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="absolute top-4 left-20 flex items-center gap-1.5">
                                        {!tabSwitch.isTabVisible && (
                                            <div className="flex items-center gap-1 bg-amber-600/90 rounded-full px-2 py-1" title="Tab switch detected">
                                                <EyeOff className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                        {faceDetection.faceStatus === 'absent' && (
                                            <div className="flex items-center gap-1 bg-red-600/90 rounded-full px-2 py-1" title="No face detected">
                                                <User className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                        {voiceActivity.voiceStatus === 'silent' && (
                                            <div className="flex items-center gap-1 bg-amber-600/90 rounded-full px-2 py-1" title="No voice detected">
                                                <VolumeX className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5">
                                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-xs text-white">Private</span>
                                </div>
                            </div>

                            {/* Recording Controls */}
                            <div className="mt-4 flex items-center justify-center gap-3">
                                {recordStatus === STATUS.IDLE && (
                                    <button onClick={startRecording}
                                        className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold px-8 py-3 rounded-xl transition-all hover:scale-105 shadow-lg shadow-red-600/30">
                                        <Video className="w-5 h-5" /> Start Recording
                                    </button>
                                )}
                                {recordStatus === STATUS.RECORDING && (
                                    <button onClick={stopRecording}
                                        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-8 py-3 rounded-xl transition-all">
                                        <Square className="w-5 h-5" /> Stop Recording
                                    </button>
                                )}
                                {recordStatus === STATUS.RECORDED && (
                                    <button onClick={uploadAnswer}
                                        className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-all hover:scale-105">
                                        <Upload className="w-5 h-5" /> Submit Answer
                                    </button>
                                )}
                                {recordStatus === STATUS.UPLOADING && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex items-center gap-3 text-brand-400">
                                            <div className="w-5 h-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
                                            <span className="font-medium">Saving to cloud...</span>
                                        </div>
                                        <div className="w-48 h-1.5 bg-surface-card rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-200"
                                                style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}
                                {recordStatus === STATUS.UPLOADED && (
                                    <div className="flex items-center gap-3 text-emerald-400">
                                        <CheckCircle className="w-6 h-6" />
                                        <span className="font-medium">Answer saved successfully</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Right: Question Panel (2 cols) ──────────────── */}
                    <div className="lg:col-span-2">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentIdx}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="glass rounded-2xl p-6 neon-border h-full"
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs font-mono text-brand-400 bg-brand-900/40 px-2 py-1 rounded-md uppercase">
                                        {currentQuestion?.category}
                                    </span>
                                    <span className="text-xs text-brand-500 capitalize">• {currentQuestion?.difficulty}</span>
                                </div>

                                <p className="text-brand-400 text-sm mb-2">Question {currentIdx + 1}</p>
                                <h2 className="text-xl font-semibold leading-relaxed text-white mb-6">
                                    {currentQuestion?.text}
                                </h2>

                                <div className="glass rounded-xl p-4 bg-surface-card/50 text-sm text-brand-300 space-y-2 mb-6">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-brand-500" />
                                        <span>Suggested: {currentQuestion?.expected_duration_seconds} seconds</span>
                                    </div>
                                </div>

                                <div className="glass rounded-xl p-4 border border-brand-500/20 text-sm text-brand-300 space-y-1.5 mb-6">
                                    <p className="font-medium text-brand-200">Recording Tips</p>
                                    <p>• Speak clearly and at a natural pace</p>
                                    <p>• Look directly at the camera</p>
                                    <p>• Provide specific examples when possible</p>
                                </div>

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="glass rounded-xl p-3 border border-surface-border text-xs mb-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="w-3.5 h-3.5 text-brand-400" />
                                            <span className="font-medium text-brand-200">Interview Monitor</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-brand-300">
                                            <div className="flex items-center gap-1">
                                                {tabSwitch.isTabVisible
                                                    ? <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                                    : <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                                }
                                                <span>Tab {tabSwitch.isTabVisible ? 'visible' : 'switched'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {faceDetection.faceStatus === 'present'
                                                    ? <User className="w-3.5 h-3.5 text-emerald-400" />
                                                    : <User className="w-3.5 h-3.5 text-red-400" />
                                                }
                                                <span>Face {faceDetection.faceStatus === 'present' ? 'detected' : 'absent'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {voiceActivity.voiceStatus === 'active'
                                                    ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                                                    : <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                                                }
                                                <span>{voiceActivity.voiceStatus === 'active' ? 'Speaking' : 'Silent'}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {recordStatus === STATUS.UPLOADED && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                                        {isLastQuestion ? (
                                            <button onClick={completeInterview} disabled={completing}
                                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors">
                                                {completing ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <><CheckCircle className="w-5 h-5" /> Finish Interview</>
                                                )}
                                            </button>
                                        ) : (
                                            <button onClick={nextQuestion}
                                                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-semibold py-3.5 rounded-xl transition-colors">
                                                Next Question <ChevronRight className="w-5 h-5" />
                                            </button>
                                        )}
                                    </motion.div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {/* Question Dots */}
                        <div className="flex gap-2 mt-4 justify-center flex-wrap">
                            {questions.map((_, i) => (
                                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                    i < currentIdx ? 'bg-emerald-400'
                                    : i === currentIdx ? 'bg-brand-400 scale-125'
                                    : 'bg-surface-border'
                                }`} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Privacy note ────────────────────────────────────── */}
                <div className="flex items-center justify-center gap-2 mt-8 text-brand-500 text-xs">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Your responses are private and only visible to the hiring team</span>
                </div>
            </div>
        </div>
    )
}
