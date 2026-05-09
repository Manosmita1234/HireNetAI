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
    AlertTriangle, User
} from 'lucide-react'
import { interviewAPI, uploadAPI } from '../services/api'
import { useIntegrityMonitoring } from '../hooks/useIntegrityMonitoring'

const STATUS = {
    LOADING: 'loading',
    IDLE: 'idle',
    RECORDING: 'recording',
    RECORDED: 'recorded',
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
    } = useIntegrityMonitoring(
        videoRef,
        streamRef,
        sessionId,
        questions[currentIdx]?.id,
        isRecording
    )

    useEffect(() => {
        let cancelled = false

        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user',
                    },
                    audio: true,
                })

                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop())
                    return
                }

                streamRef.current = stream
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.onloadedmetadata = () => {
                        if (!cancelled) videoRef.current.play().catch(() => {})
                    }
                }
            } catch (err) {
                console.error('[InterviewRoom] Camera error:', err)
                if (!cancelled) toast.error('Camera access failed. Please check your device.')
            }
        }

        interviewAPI.getSessionQuestions(sessionId)
            .then(({ data }) => {
                if (cancelled) return
                setQuestions(data.questions || [])
                setInterviewStatus(STATUS.IDLE)
                if (streamRef.current && videoRef.current && !videoRef.current.srcObject) {
                    videoRef.current.srcObject = streamRef.current
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play().catch(() => {})
                    }
                }
            })
            .catch(() => {
                if (cancelled) return
                toast.error('Failed to load questions')
            })

        initCamera()

        const handleBeforeUnload = (e) => {
            e.preventDefault()
            e.returnValue = 'You have an interview in progress. Are you sure you want to leave? Your progress will be lost.'
            return e.returnValue
        }
        window.addEventListener('beforeunload', handleBeforeUnload)

        const handlePopState = () => {
            const confirm = window.confirm('You have an interview in progress. Are you sure you want to leave? Your progress will be lost?')
            if (!confirm) {
                window.history.pushState(null, '', window.location.href)
            } else {
                flushAllEvents()
                streamRef.current?.getTracks().forEach(t => t.stop())
            }
        }
        window.history.pushState(null, '', window.location.href)
        window.addEventListener('popstate', handlePopState)

        return () => {
            cancelled = true
            streamRef.current?.getTracks().forEach(t => t.stop())
            clearInterval(timerRef.current)
            flushAllEvents()
            window.removeEventListener('beforeunload', handleBeforeUnload)
            window.removeEventListener('popstate', handlePopState)
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
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'
        const mr = new MediaRecorder(streamRef.current, { mimeType })
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
    }, [questions, currentIdx, sessionId, flushAllEvents])

    // Auto-upload as soon as recording stops (STATUS.RECORDED).
    // Without this, the status stays RECORDED forever and the
    // "Next Question" button (which requires STATUS.UPLOADED) never appears.
    useEffect(() => {
        if (recordStatus === STATUS.RECORDED) {
            uploadAnswer()
        }
    }, [recordStatus, uploadAnswer])

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

    if (questions.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
        )
    }

    if (interviewStatus === STATUS.COMPLETE) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="max-w-lg w-full">
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }}
                        className="bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-200">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">Interview Completed!</h1>
                        <p className="text-slate-500 mb-6">Your responses have been submitted successfully.</p>

                        <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left border border-slate-200">
                            <h3 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-blue-500" />
                                What happens next?
                            </h3>
                            <p className="text-sm text-slate-500 leading-relaxed">
                                Your interview is being reviewed by our AI analysis system. Once the evaluation is complete,
                                the hiring team will reach out to you within <span className="text-slate-700 font-medium">3-5 business days</span>
                                with next steps.
                            </p>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-blue-500 text-xs mb-6">
                            <Cloud className="w-4 h-4" />
                            All answers securely saved
                        </div>

                        <button onClick={() => navigate('/candidate/dashboard')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
                            Return to Dashboard
                        </button>
                    </motion.div>
                </div>
            </motion.div>
        )
    }

    return (
        <div ref={containerRef} className="min-h-screen bg-slate-50 text-slate-800">

            {/* ── Top Bar ─────────────────────────────────────────────── */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                                <Brain className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="font-semibold text-slate-800">AI Interview</h1>
                                <p className="text-xs text-slate-400">{questions.length} Questions</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-sm font-medium text-slate-700">
                                    Question {Math.min(currentIdx + 1, questions.length)} of {questions.length}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {currentIdx} completed
                                </p>
                            </div>
                            <div className="w-40 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${((currentIdx) / questions.length) * 100}%` }}
                                    className="h-full bg-blue-500 rounded-full"
                                />
                            </div>
                            <button onClick={toggleFullscreen} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                {isFullscreen ? <Minimize className="w-5 h-5 text-slate-500" /> : <Maximize className="w-5 h-5 text-slate-500" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main Content ───────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-6 py-8">

                <div className="grid lg:grid-cols-5 gap-8">

                    {/* ── Left: Video Feed (3 cols) ─────────────────── */}
                    <div className="lg:col-span-3">
                        <div className="relative">
                            <div className={`relative rounded-2xl overflow-hidden bg-white aspect-video border border-slate-200 ${recordStatus === STATUS.RECORDING ? 'ring-2 ring-red-500 recording-active' : ''}`}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    className="w-full h-full object-cover"
                                />

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 rounded-full px-3 py-1.5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                                        <span className="text-sm font-medium text-white">REC</span>
                                        <span className="text-sm font-mono text-white ml-1">{formatTime(timer)} / {formatTime(MAX_RECORDING_TIME)}</span>
                                    </div>
                                )}

                                {recordStatus === STATUS.UPLOADED && (
                                    <div className="absolute top-4 left-4 flex items-center gap-2 bg-green-600 rounded-full px-3 py-1.5">
                                        <Cloud className="w-4 h-4 text-white" />
                                        <span className="text-sm font-medium text-white">Saved</span>
                                    </div>
                                )}

                                <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm rounded-full p-2 border border-slate-200">
                                    {recordStatus === STATUS.RECORDING
                                        ? <Mic className="w-4 h-4 text-red-500" />
                                        : <MicOff className="w-4 h-4 text-slate-400" />}
                                </div>

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="absolute top-4 left-20 flex items-center gap-1.5">
                                        {!tabSwitch.isTabVisible && (
                                            <div className="flex items-center gap-1 bg-amber-500 rounded-full px-2 py-1" title="Tab switch detected">
                                                <EyeOff className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                        {faceDetection.faceStatus === 'absent' && (
                                            <div className="flex items-center gap-1 bg-red-500 rounded-full px-2 py-1" title="No face detected — please stay in frame">
                                                <User className="w-3 h-3 text-white" />
                                                <span className="text-white text-xs font-medium">No Face</span>
                                            </div>
                                        )}
                                        {faceDetection.faceStatus === 'multiple' && (
                                            <div className="flex items-center gap-1 bg-amber-500 rounded-full px-2 py-1" title="Multiple faces detected">
                                                <User className="w-3 h-3 text-white" />
                                                <span className="text-white text-xs font-medium">Multi-Face</span>
                                            </div>
                                        )}
                                        {voiceActivity.voiceStatus === 'silent' && (
                                            <div className="flex items-center gap-1 bg-amber-500 rounded-full px-2 py-1" title="No voice detected">
                                                <VolumeX className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-1.5 border border-slate-200">
                                    <Shield className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-xs text-slate-600">Private</span>
                                </div>
                            </div>

                            {/* Recording Controls */}
                            <div className="mt-4 flex items-center justify-center gap-3">
                                {recordStatus === STATUS.IDLE && (
                                    <button onClick={startRecording}
                                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-3 rounded-xl transition-all hover:scale-105 shadow-lg shadow-red-600/30">
                                        <Video className="w-5 h-5" /> Start Recording
                                    </button>
                                )}
                                {recordStatus === STATUS.RECORDING && (
                                    <button onClick={stopRecording}
                                        className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold px-8 py-3 rounded-xl transition-all">
                                        <Square className="w-5 h-5" /> Stop Recording
                                    </button>
                                )}

                                {recordStatus === STATUS.UPLOADING && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="flex items-center gap-3 text-blue-600">
                                            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                            <span className="font-medium">Saving to cloud...</span>
                                        </div>
                                        <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-200"
                                                style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </div>
                                )}
                                {recordStatus === STATUS.UPLOADED && (
                                    <div className="flex items-center gap-3 text-green-600">
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
                                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 h-full"
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-xs font-mono text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase">
                                        {currentQuestion?.category}
                                    </span>
                                    <span className="text-xs text-slate-400 capitalize">• {currentQuestion?.difficulty}</span>
                                </div>

                                <p className="text-slate-400 text-sm mb-2">Question {currentIdx + 1}</p>
                                <h2 className="text-xl font-semibold leading-relaxed text-slate-800 mb-6">
                                    {currentQuestion?.text}
                                </h2>

                                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 space-y-2 mb-6 border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-blue-500" />
                                        <span>Suggested: {currentQuestion?.expected_duration_seconds} seconds</span>
                                    </div>
                                </div>

                                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500 space-y-1.5 mb-6 border border-slate-100">
                                    <p className="font-medium text-slate-700">Recording Tips</p>
                                    <p>• Speak clearly and at a natural pace</p>
                                    <p>• Look directly at the camera</p>
                                    <p>• Provide specific examples when possible</p>
                                </div>

                                {recordStatus === STATUS.RECORDING && (
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs mb-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="w-3.5 h-3.5 text-blue-500" />
                                            <span className="font-medium text-slate-700">Interview Monitor</span>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-500">
                                            <div className="flex items-center gap-1">
                                                {tabSwitch.isTabVisible
                                                    ? <Eye className="w-3.5 h-3.5 text-green-500" />
                                                    : <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                                                }
                                                <span>Tab {tabSwitch.isTabVisible ? 'visible' : 'switched'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {faceDetection.faceStatus === 'present' && <User className="w-3.5 h-3.5 text-green-500" />}
                                                {faceDetection.faceStatus === 'absent'   && <User className="w-3.5 h-3.5 text-red-500" />}
                                                {faceDetection.faceStatus === 'multiple' && <User className="w-3.5 h-3.5 text-amber-500" />}
                                                <span className={faceDetection.faceStatus === 'absent' ? 'text-red-500' : faceDetection.faceStatus === 'multiple' ? 'text-amber-500' : ''}>
                                                    {faceDetection.faceStatus === 'present' ? 'Face detected'
                                                        : faceDetection.faceStatus === 'absent' ? 'No face — move closer'
                                                        : 'Multiple faces!'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {voiceActivity.voiceStatus === 'active'
                                                    ? <Volume2 className="w-3.5 h-3.5 text-green-500" />
                                                    : <VolumeX className="w-3.5 h-3.5 text-amber-500" />
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
                                                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors">
                                                {completing ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <><CheckCircle className="w-5 h-5" /> Finish Interview</>
                                                )}
                                            </button>
                                        ) : (
                                            <button onClick={nextQuestion}
                                                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors">
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
                                    i < currentIdx ? 'bg-green-400'
                                    : i === currentIdx ? 'bg-blue-500 scale-125'
                                    : 'bg-slate-300'
                                }`} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Privacy note ────────────────────────────────────── */}
                <div className="flex items-center justify-center gap-2 mt-8 text-slate-400 text-xs">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Your responses are private and only visible to the hiring team</span>
                </div>
            </div>
        </div>
    )
}
