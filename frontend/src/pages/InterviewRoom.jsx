/**
 * pages/InterviewRoom.jsx – The live interview recording page.
 *
 * This is the most technically complex page in the app.
 * It uses the browser's built-in MediaRecorder API to record video/audio from the webcam.
 *
 * Full user flow:
 *  1. Page loads → loads session questions from the backend
 *  2. Page loads → requests camera and microphone permission from the browser
 *  3. If permission denied → shows error screen
 *  4. Live webcam feed appears in the video element on the left
 *  5. The current question appears on the right panel
 *  6. Candidate clicks "Start Recording" → MediaRecorder begins capturing the stream
 *  7. Candidate clicks "Stop Recording" → MediaRecorder saves the video in memory as chunks
 *  8. Candidate can click "Retake" to record again, or "Submit Answer" to upload
 *  9. On submit → video chunks are combined into a Blob, sent to POST /upload/answer
 * 10. After upload → "Next Question" (or "Finish Interview" for the last question) appears
 * 11. After all answers are submitted → calls POST /interview/session/:id/complete
 *     This triggers the backend to start AI analysis (WhisperX + DeepFace + LLM)
 * 12. Redirects to the candidate dashboard
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

/**
 * STATUS constants – All possible states of the recording workflow.
 * Using constants instead of plain strings prevents typos.
 *  - IDLE:      No recording. "Start Recording" button shown.
 *  - RECORDING: MediaRecorder is active. Timer running. "Stop Recording" shown.
 *  - RECORDED:  Recording stopped. Video in memory. "Retake" and "Submit Answer" shown.
 *  - UPLOADING: Video being sent to server. Spinner shown.
 *  - UPLOADED:  Video saved on server. "Next Question" or "Finish Interview" shown.
 */
const STATUS = { IDLE: 'idle', RECORDING: 'recording', RECORDED: 'recorded', UPLOADING: 'uploading', UPLOADED: 'uploaded' }

export default function InterviewRoom() {
    const { sessionId } = useParams()  // extract the session ID from the URL
    const navigate = useNavigate()

    const [questions, setQuestions] = useState([])        // questions for this session
    const [currentIdx, setCurrentIdx] = useState(0)       // index of the current question (0 = first)
    const [recordStatus, setRecordStatus] = useState(STATUS.IDLE)  // current recording workflow state
    const [timer, setTimer] = useState(0)                 // seconds elapsed during recording
    const [hasPermission, setHasPermission] = useState(null)  // null=unknown, true=granted, false=denied
    const [completing, setCompleting] = useState(false)   // true while completeInterview() is in flight

    // ── React refs (mutable values that DON'T cause re-renders) ───────────────
    const videoRef = useRef(null)          // reference to the <video> HTML element (the webcam feed)
    const mediaRecorderRef = useRef(null)  // the MediaRecorder instance (browser API)
    const chunksRef = useRef([])           // array of video data chunks collected during recording
    const streamRef = useRef(null)         // the live webcam MediaStream (camera + mic tracks)
    const timerRef = useRef(null)          // setInterval ID for the recording timer

    // ── On page load: fetch questions and request camera access ───────────────
    useEffect(() => {
        // Load the questions for this session from the backend
        interviewAPI.getSessionQuestions(sessionId)
            .then(({ data }) => setQuestions(data.questions || []))
            .catch(() => toast.error('Failed to load questions'))

        // Request camera + microphone access from the browser
        // This shows the browser's "Allow/Block" permission dialog
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then((stream) => {
                streamRef.current = stream   // save the stream so we can record from it later
                // Show the live camera feed in the video element immediately
                if (videoRef.current) videoRef.current.srcObject = stream
                setHasPermission(true)
            })
            .catch(() => {
                setHasPermission(false)
                toast.error('Camera/microphone access required!')
            })

        // Cleanup: when the user navigates away, stop all camera/mic tracks
        // This is important so the browser's recording indicator dot goes away
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop())
            clearInterval(timerRef.current)
        }
    }, [])

    // ── Timer: counts seconds while recording is active ───────────────────────
    useEffect(() => {
        if (recordStatus === STATUS.RECORDING) {
            // Increment timer every 1 second
            timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
        } else {
            clearInterval(timerRef.current)  // stop the timer when not recording
            if (recordStatus === STATUS.IDLE) setTimer(0)  // reset to 0 when idle (e.g. after retake)
        }
        return () => clearInterval(timerRef.current)  // cleanup on status change
    }, [recordStatus])

    /**
     * formatTime – Converts seconds to MM:SS format for the timer display.
     * e.g. 65 → "01:05"
     * padStart(2, '0') ensures single digits are zero-padded (e.g. 5 → "05")
     */
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

    /**
     * startRecording – Begins capturing video from the webcam stream.
     *
     * How MediaRecorder works:
     *  - We pass the live camera stream to new MediaRecorder(stream)
     *  - mimeType 'video/webm;codecs=vp8,opus' is widely supported in Chrome/Firefox
     *  - mr.ondataavailable fires every 500ms (configured by mr.start(500))
     *    and appends each chunk to our chunksRef array
     *  - When mr.stop() is called, mr.onstop fires and we set status to RECORDED
     */
    const startRecording = useCallback(() => {
        if (!streamRef.current) return
        chunksRef.current = []  // clear any previous recording data
        const mr = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp8,opus' })
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        mr.onstop = () => setRecordStatus(STATUS.RECORDED)  // transition when stop() is called
        mr.start(500)  // fire ondataavailable every 500 milliseconds
        mediaRecorderRef.current = mr
        setRecordStatus(STATUS.RECORDING)
    }, [])

    /**
     * stopRecording – Stops the active MediaRecorder.
     * This fires mr.onstop which sets status to RECORDED.
     */
    const stopRecording = useCallback(() => {
        mediaRecorderRef.current?.stop()
    }, [])

    /**
     * uploadAnswer – Combines recorded chunks into a Blob and uploads to the backend.
     *
     * FormData is used because we're sending a file (binary data) to the server.
     * The backend receives: session_id, question_id, question_text, and the video file.
     */
    const uploadAnswer = useCallback(async () => {
        if (chunksRef.current.length === 0) { toast.error('No video recorded'); return }
        const question = questions[currentIdx]
        if (!question) return

        setRecordStatus(STATUS.UPLOADING)

        // Combine all the recorded chunks into one video Blob
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })

        const fd = new FormData()
        fd.append('session_id', sessionId)
        fd.append('question_id', question.id)
        fd.append('question_text', question.text)
        fd.append('video', blob, `answer_${question.id}.webm`)  // third arg = filename

        try {
            await uploadAPI.uploadAnswer(fd)  // POST /upload/answer (multipart)
            toast.success('Answer uploaded! Moving to next question…')
            setRecordStatus(STATUS.UPLOADED)   // show "Next Question" button
        } catch (err) {
            toast.error('Upload failed. Please try again.')
            setRecordStatus(STATUS.RECORDED)   // go back to RECORDED so user can retry
        }
    }, [questions, currentIdx, sessionId])

    /**
     * nextQuestion – Advances to the next question and resets the recording state.
     */
    const nextQuestion = () => {
        setRecordStatus(STATUS.IDLE)  // reset to "Start Recording" state
        setTimer(0)
        chunksRef.current = []        // clear video data
        setCurrentIdx(i => i + 1)    // move to the next question index
    }

    /**
     * completeInterview – Called after the last answer is uploaded.
     * Tells the backend to start processing the session (WhisperX + DeepFace + LLM).
     * Then navigates back to the candidate dashboard.
     */
    const completeInterview = async () => {
        setCompleting(true)
        try {
            await interviewAPI.completeSession(sessionId)  // POST /interview/session/:id/complete
            toast.success('Interview complete! Your answers are being analyzed.')
            navigate('/candidate/dashboard')
        } catch {
            toast.error('Failed to complete session')
            setCompleting(false)
        }
    }

    // true when the candidate just submitted the last question
    const isLastQuestion = currentIdx >= questions.length - 1

    // ── Guard: camera permission denied ───────────────────────────────────────
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

    // ── Guard: questions still loading ────────────────────────────────────────
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

            {/* ── Top Bar: progress indicator ──────────────────────────────── */}
            <div className="glass border-b border-surface-border">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Brain className="w-6 h-6 text-brand-400" />
                        <span className="font-semibold">Interview in Progress</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* "Question X of Y" text */}
                        <span className="text-brand-300 text-sm">
                            Question {Math.min(currentIdx + 1, questions.length)} of {questions.length}
                        </span>
                        {/* Progress bar: fills as the candidate completes questions */}
                        <div className="w-32 h-2 bg-surface rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-brand-500 to-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${((currentIdx) / questions.length) * 100}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main two-column layout ────────────────────────────────────── */}
            {/* Left column: webcam feed + recording controls */}
            {/* Right column: question text + tips + next/finish button */}
            <div className="max-w-6xl mx-auto px-6 py-8 grid lg:grid-cols-2 gap-8">

                {/* ── Left: Video Feed ───────────────────────────────────── */}
                <div>
                    {/* Video element: shows live camera feed (muted so there's no echo) */}
                    <div className={`relative rounded-2xl overflow-hidden bg-black aspect-video ${recordStatus === STATUS.RECORDING ? 'recording-active' : ''}`}>
                        {/* The video element is connected to the webcam stream via videoRef and srcObject */}
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />

                        {/* Recording indicator: red dot + timer in top-left, only when recording */}
                        {recordStatus === STATUS.RECORDING && (
                            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />  {/* blinking red dot */}
                                <span className="text-sm font-mono text-white">{formatTime(timer)}</span>
                            </div>
                        )}

                        {/* Microphone indicator: red Mic when recording, grey MicOff otherwise */}
                        <div className="absolute top-4 right-4 glass rounded-full p-2">
                            {recordStatus === STATUS.RECORDING
                                ? <Mic className="w-4 h-4 text-red-400" />
                                : <MicOff className="w-4 h-4 text-brand-400" />}
                        </div>
                    </div>

                    {/* ── Recording Control Buttons ────────────────────────── */}
                    {/*
                      Only one group of buttons is shown at a time, depending on `recordStatus`:
                        IDLE      → "Start Recording" (red button)
                        RECORDING → "Stop Recording" (grey button)
                        RECORDED  → "Retake" + "Submit Answer"
                        UPLOADING → Spinner + "Uploading…"
                        UPLOADED  → Green checkmark + "Uploaded successfully"
                    */}
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
                                {/* Retake: resets to IDLE without clearing the stream */}
                                <button onClick={() => setRecordStatus(STATUS.IDLE)}
                                    className="flex items-center gap-2 glass border border-surface-border px-4 py-3 rounded-xl text-sm transition-all hover:bg-surface-card">
                                    Retake
                                </button>
                                {/* Submit: combines chunks and uploads to the backend */}
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

                {/* ── Right: Question Panel ──────────────────────────────── */}
                <div className="flex flex-col">
                    {/*
                      AnimatePresence + key={currentIdx}: when currentIdx changes (next question),
                      the old question slides out to the left and the new one slides in from the right.
                    */}
                    <AnimatePresence mode="wait">
                        <motion.div key={currentIdx}
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                            className="glass rounded-2xl p-6 neon-border flex-1"
                        >
                            {/* Category and difficulty tags */}
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-mono text-brand-400 bg-brand-900/40 px-2 py-1 rounded-md capitalize">
                                    {currentQuestion?.category}
                                </span>
                                <span className="text-xs text-brand-500 capitalize">{currentQuestion?.difficulty}</span>
                            </div>

                            {/* Question number and text */}
                            <p className="text-brand-200 text-xs mb-2">Question {currentIdx + 1}</p>
                            <h2 className="text-xl font-semibold leading-relaxed mb-6">{currentQuestion?.text}</h2>

                            {/* Tips and suggested duration */}
                            <div className="glass rounded-xl p-4 bg-brand-950/30 text-sm text-brand-300 space-y-2 mb-6">
                                <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-brand-400" /> Suggested: {currentQuestion?.expected_duration_seconds}s</p>
                                <p>💡 Speak clearly and provide specific examples when possible.</p>
                                <p>🎯 Stay on topic and address the question directly.</p>
                            </div>

                            {/* "Next Question" or "Finish Interview" – appears only after uploading */}
                            {recordStatus === STATUS.UPLOADED && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    {isLastQuestion ? (
                                        /* Last question → "Finish Interview" (green) */
                                        <button onClick={completeInterview} disabled={completing}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]">
                                            {completing
                                                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                : <><CheckCircle className="w-4 h-4" /> Finish Interview</>}
                                        </button>
                                    ) : (
                                        /* More questions remaining → "Next Question" */
                                        <button onClick={nextQuestion}
                                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]">
                                            Next Question <ChevronRight className="w-4 h-4" />
                                        </button>
                                    )}
                                </motion.div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* ── Question Progress Dots ──────────────────────────── */}
                    {/* Small dots at the bottom showing which question the candidate is on */}
                    <div className="flex gap-2 mt-4 justify-center">
                        {questions.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                i < currentIdx  ? 'bg-emerald-400'              // completed: green
                                : i === currentIdx ? 'bg-brand-400 scale-125'  // current: active/bigger
                                : 'bg-surface-border'                           // future: grey
                            }`} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
