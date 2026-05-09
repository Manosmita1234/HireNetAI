/**
 * hooks/useIntegrityMonitoring.js – Interview integrity monitoring hooks.
 *
 * Features:
 * - Tab switch detection (visibilitychange API)
 * - Face presence check using browser FaceDetector Web API (Chrome/Edge built-in)
 *   → Detects if candidate actually moved away from camera (not just stream active)
 *   → Also detects multiple faces (potential cheating)
 *   → Falls back to stream-readyState check if FaceDetector is unavailable
 * - Voice activity detection (Web Audio API)
 *
 * All monitoring runs on a single ticker interval to avoid performance overhead.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { interviewAPI } from '../services/api'

const CHECK_INTERVAL = 2000  // Check every 2 seconds
const FACE_ABSENT_THRESHOLD = 5     // Seconds before logging face_absent event
const VOICE_SILENCE_THRESHOLD = 30  // Seconds of silence before logging

// ── Tab Switch Detection ──────────────────────────────────────────────────────

export function useTabSwitchDetection(sessionId, questionId, enabled = true) {
    const [tabSwitchCount, setTabSwitchCount] = useState(0)
    const [isTabVisible, setIsTabVisible] = useState(true)
    const pendingEventsRef = useRef([])

    useEffect(() => {
        if (!enabled) return

        const handleVisibilityChange = () => {
            const hidden = document.hidden
            setIsTabVisible(!hidden)

            if (hidden) {
                pendingEventsRef.current.push({
                    event_type: 'tab_switch',
                    question_id: questionId,
                    timestamp: new Date().toISOString(),
                    details: 'Candidate switched away from interview tab',
                })
                setTabSwitchCount(prev => prev + 1)
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [enabled, questionId])

    const flushEvents = useCallback(async () => {
        if (pendingEventsRef.current.length > 0 && sessionId) {
            try {
                await interviewAPI.recordIntegrityEvents(sessionId, pendingEventsRef.current)
                pendingEventsRef.current = []
            } catch (err) {
                console.error('Failed to record tab switch events:', err)
            }
        }
    }, [sessionId])

    return { tabSwitchCount, isTabVisible, flushEvents }
}

// ── Face Presence Detection ───────────────────────────────────────────────────

/**
 * Attempts to instantiate the browser's built-in FaceDetector API.
 * Available natively in Chrome 70+ and Edge 79+ (no library needed).
 * Returns null on unsupported browsers (Firefox, Safari).
 */
function tryCreateFaceDetector() {
    if (!('FaceDetector' in window)) return null
    try {
        return new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 })
    } catch {
        return null
    }
}

export function useFaceDetection(videoRef, sessionId, questionId, enabled = true) {
    // faceStatus: 'present' | 'absent' | 'multiple'
    const [faceStatus, setFaceStatus] = useState('present')
    const [faceAbsentSeconds, setFaceAbsentSeconds] = useState(0)

    const faceAbsentSecondsRef = useRef(0)
    const pendingEventsRef = useRef([])
    const checkIntervalRef = useRef(null)
    const detectorRef = useRef(null)   // FaceDetector instance (or null)
    const canvasRef = useRef(null)   // Off-screen canvas for frame capture

    // Initialise FaceDetector once on mount
    useEffect(() => {
        detectorRef.current = tryCreateFaceDetector()
        if (detectorRef.current) {
            canvasRef.current = document.createElement('canvas')
            console.info('[FaceDetection] Using browser FaceDetector API OK')
        } else {
            console.warn('[FaceDetection] FaceDetector API not available — using stream fallback')
        }
    }, [])

    /**
     * Core check: runs every CHECK_INTERVAL ms.
     *
     * Strategy A (FaceDetector available):
     *   Draw current video frame to an off-screen canvas → run FaceDetector.detect()
     *   → 0 faces  → 'absent'
     *   → 2+ faces → 'multiple'
     *   → 1 face   → 'present'
     *
     * Strategy B (fallback):
     *   Check video stream readyState (original behavior — detects camera off/covered)
     */
    const checkFacePresence = useCallback(async () => {
        if (!videoRef?.current) return
        const video = videoRef.current

        // ── Strategy B: fallback (no FaceDetector) ────────────────────────────
        if (!detectorRef.current || !canvasRef.current) {
            const isReady = (
                video.readyState >= 2 &&
                !video.paused &&
                video.videoWidth > 0 &&
                video.videoHeight > 0
            )
            if (isReady) {
                faceAbsentSecondsRef.current = 0
                setFaceAbsentSeconds(0)
                setFaceStatus('present')
            } else {
                faceAbsentSecondsRef.current += CHECK_INTERVAL / 1000
                setFaceAbsentSeconds(faceAbsentSecondsRef.current)
                setFaceStatus('absent')
            }
            return
        }

        // ── Strategy A: FaceDetector API ──────────────────────────────────────
        // Only detect if video is actively playing
        if (video.readyState < 2 || video.paused || video.videoWidth === 0) return

        try {
            // Capture current video frame into the off-screen canvas
            const canvas = canvasRef.current
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            // Run the face detector on the captured frame
            const faces = await detectorRef.current.detect(canvas)

            if (faces.length === 0) {
                // No face detected → candidate moved away
                faceAbsentSecondsRef.current += CHECK_INTERVAL / 1000
                setFaceAbsentSeconds(faceAbsentSecondsRef.current)
                setFaceStatus('absent')
            } else if (faces.length > 1) {
                // Multiple faces → possible cheating
                faceAbsentSecondsRef.current = 0
                setFaceAbsentSeconds(0)
                setFaceStatus('multiple')
            } else {
                // Exactly one face → all good
                faceAbsentSecondsRef.current = 0
                setFaceAbsentSeconds(0)
                setFaceStatus('present')
            }
        } catch (err) {
            // Detection threw (e.g. browser throttled); skip this tick silently
            console.debug('[FaceDetection] detect() error (skipped):', err?.message)
        }
    }, [videoRef])

    // Start/stop the polling interval
    useEffect(() => {
        if (!enabled) return
        checkFacePresence()
        checkIntervalRef.current = setInterval(checkFacePresence, CHECK_INTERVAL)
        return () => clearInterval(checkIntervalRef.current)
    }, [enabled, checkFacePresence])

    // Log integrity event when face has been absent long enough
    useEffect(() => {
        if (!enabled) return
        if (faceAbsentSecondsRef.current >= FACE_ABSENT_THRESHOLD) {
            pendingEventsRef.current.push({
                event_type: 'face_absent',
                question_id: questionId,
                timestamp: new Date().toISOString(),
                duration_seconds: faceAbsentSecondsRef.current,
                details: `No face detected for ${faceAbsentSecondsRef.current} seconds`,
            })
        }
    }, [
        enabled,
        // Only re-run when crossing the threshold (avoids spamming events)
        faceAbsentSecondsRef.current >= FACE_ABSENT_THRESHOLD
            ? faceAbsentSecondsRef.current
            : 0,
        questionId,
    ])

    // Log multiple-face event immediately
    useEffect(() => {
        if (!enabled || faceStatus !== 'multiple') return
        pendingEventsRef.current.push({
            event_type: 'multiple_faces',
            question_id: questionId,
            timestamp: new Date().toISOString(),
            details: 'Multiple faces detected in camera frame',
        })
    }, [enabled, faceStatus, questionId])

    const flushEvents = useCallback(async () => {
        if (pendingEventsRef.current.length > 0 && sessionId) {
            try {
                await interviewAPI.recordIntegrityEvents(sessionId, pendingEventsRef.current)
                pendingEventsRef.current = []
            } catch (err) {
                console.error('Failed to record face events:', err)
            }
        }
    }, [sessionId])

    return { faceStatus, faceAbsentSeconds, flushEvents }
}

// ── Voice Activity Detection ──────────────────────────────────────────────────

export function useVoiceActivityDetection(streamRef, sessionId, questionId, enabled = true) {
    const [voiceStatus, setVoiceStatus] = useState('active')
    const [silenceSeconds, setSilenceSeconds] = useState(0)
    const [audioLevel, setAudioLevel] = useState(0)

    const silenceSecondsRef = useRef(0)
    const analyserRef = useRef(null)
    const audioContextRef = useRef(null)
    const pendingEventsRef = useRef([])
    const checkIntervalRef = useRef(null)

    const checkAudioLevel = useCallback(() => {
        if (!analyserRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const normalizedLevel = Math.min(100, (average / 128) * 100)
        setAudioLevel(normalizedLevel)

        const isSilent = normalizedLevel < 5
        setVoiceStatus(isSilent ? 'silent' : 'active')

        if (isSilent) {
            silenceSecondsRef.current += CHECK_INTERVAL / 1000
            setSilenceSeconds(silenceSecondsRef.current)
        } else {
            silenceSecondsRef.current = 0
            setSilenceSeconds(0)
        }
    }, [])

    useEffect(() => {
        if (!enabled || !streamRef?.current) return

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)()
            audioContextRef.current = audioContext
            const source = audioContext.createMediaStreamSource(streamRef.current)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analyserRef.current = analyser

            checkIntervalRef.current = setInterval(checkAudioLevel, CHECK_INTERVAL)
        } catch (err) {
            console.warn('Voice activity detection setup failed:', err)
        }

        return () => {
            clearInterval(checkIntervalRef.current)
            audioContextRef.current?.close().catch(() => { })
        }
    }, [enabled, streamRef, checkAudioLevel])

    useEffect(() => {
        if (!enabled) return
        if (silenceSecondsRef.current >= VOICE_SILENCE_THRESHOLD) {
            pendingEventsRef.current.push({
                event_type: 'no_voice',
                question_id: questionId,
                timestamp: new Date().toISOString(),
                duration_seconds: silenceSecondsRef.current,
                details: `No voice detected for ${silenceSecondsRef.current} seconds`,
            })
        }
    }, [
        enabled,
        silenceSecondsRef.current >= VOICE_SILENCE_THRESHOLD
            ? silenceSecondsRef.current
            : 0,
        questionId,
    ])

    const flushEvents = useCallback(async () => {
        if (pendingEventsRef.current.length > 0 && sessionId) {
            try {
                await interviewAPI.recordIntegrityEvents(sessionId, pendingEventsRef.current)
                pendingEventsRef.current = []
            } catch (err) {
                console.error('Failed to record voice events:', err)
            }
        }
    }, [sessionId])

    return { voiceStatus, silenceSeconds, audioLevel, flushEvents }
}

// ── Combined Hook ─────────────────────────────────────────────────────────────

export function useIntegrityMonitoring(videoRef, streamRef, sessionId, questionId, enabled = true) {
    const tabSwitch = useTabSwitchDetection(sessionId, questionId, enabled)
    const faceDetection = useFaceDetection(videoRef, sessionId, questionId, enabled)
    const voiceActivity = useVoiceActivityDetection(streamRef, sessionId, questionId, enabled)

    const flushAllEventsRef = useRef(null)
    if (!flushAllEventsRef.current) {
        flushAllEventsRef.current = async () => {
            await Promise.all([
                tabSwitch.flushEvents(),
                faceDetection.flushEvents(),
                voiceActivity.flushEvents(),
            ])
        }
    }

    const integrityWarnings = [
        ...(tabSwitch.tabSwitchCount > 0
            ? [`Tab switches: ${tabSwitch.tabSwitchCount}`] : []),
        ...(faceDetection.faceStatus === 'absent'
            ? [`Face absent: ${faceDetection.faceAbsentSeconds}s`] : []),
        ...(faceDetection.faceStatus === 'multiple'
            ? ['Multiple faces detected'] : []),
        ...(voiceActivity.silenceSeconds >= VOICE_SILENCE_THRESHOLD
            ? [`Silence: ${voiceActivity.silenceSeconds}s`] : []),
    ]

    return {
        tabSwitch,
        faceDetection,
        voiceActivity,
        flushAllEvents: flushAllEventsRef.current,
        integrityWarnings,
        hasIssues: integrityWarnings.length > 0,
    }
}
