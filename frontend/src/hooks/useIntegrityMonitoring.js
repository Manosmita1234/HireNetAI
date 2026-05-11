/**
 * hooks/useIntegrityMonitoring.js – Interview integrity monitoring hooks.
 *
 * Features:
 * - Tab switch detection (visibilitychange API)
 * - Face presence check using face-api.js (TensorFlow.js-based)
 *   → Detects if candidate actually moved away from camera (not just stream active)
 *   → Also detects multiple faces (potential cheating)
 *   → Works across all modern browsers
 * - Voice activity detection (Web Audio API)
 *
 * All monitoring runs on a single ticker interval to avoid performance overhead.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { interviewAPI } from '../services/api'
import { useFaceApiDetection } from './useFaceApiDetection'

const CHECK_INTERVAL = 2000  // Check every 2 seconds
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

export function useFaceDetection(videoRef, sessionId, questionId, enabled = true) {
    return useFaceApiDetection(videoRef, sessionId, questionId, enabled)
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
