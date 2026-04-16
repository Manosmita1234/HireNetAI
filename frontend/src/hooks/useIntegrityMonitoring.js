/**
 * hooks/useIntegrityMonitoring.js – Interview integrity monitoring hooks.
 * 
 * Features:
 * - Tab switch detection (visibilitychange API)
 * - Face presence check (video analysis)
 * - Voice activity detection (Web Audio API)
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { interviewAPI } from '../services/api'

const VOICE_ACTIVITY_INTERVAL = 1000  // Check voice every 1 second
const NO_VOICE_THRESHOLD = 30         // Seconds of silence before warning
const VIDEO_CHECK_INTERVAL = 1000      // Check video presence every second
const FACE_ABSENT_THRESHOLD = 5       // Seconds of no face before warning

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
                const event = {
                    event_type: 'tab_switch',
                    question_id: questionId,
                    timestamp: new Date().toISOString(),
                    details: 'Candidate switched away from interview tab',
                }
                pendingEventsRef.current.push(event)
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

export function useFaceDetection(videoRef, sessionId, questionId, enabled = true) {
    const [faceStatus, setFaceStatus] = useState('present')  // present | absent
    const [faceAbsentSeconds, setFaceAbsentSeconds] = useState(0)
    const [lastFaceCheck, setLastFaceCheck] = useState(null)
    const videoCheckIntervalRef = useRef(null)
    const faceAbsentTimerRef = useRef(null)
    const pendingEventsRef = useRef([])

    const checkVideoPresence = useCallback(() => {
        if (!videoRef?.current) return

        const video = videoRef.current
        setLastFaceCheck(new Date())

        const isVideoPlaying = video.readyState >= 2 && !video.paused && !video.ended
        const hasValidDimensions = video.videoWidth > 0 && video.videoHeight > 0
        
        if (isVideoPlaying && hasValidDimensions) {
            setFaceStatus('present')
            setFaceAbsentSeconds(0)
        } else {
            setFaceStatus('absent')
        }
    }, [videoRef])

    useEffect(() => {
        if (!enabled || !videoRef?.current) return

        const video = videoRef.current
        
        const handleVideoEnded = () => {
            setFaceStatus('absent')
        }
        
        video.addEventListener('ended', handleVideoEnded)
        checkVideoPresence()
        
        videoCheckIntervalRef.current = setInterval(checkVideoPresence, VIDEO_CHECK_INTERVAL)

        return () => {
            video.removeEventListener('ended', handleVideoEnded)
            if (videoCheckIntervalRef.current) {
                clearInterval(videoCheckIntervalRef.current)
            }
            if (faceAbsentTimerRef.current) {
                clearInterval(faceAbsentTimerRef.current)
            }
        }
    }, [enabled, videoRef, checkVideoPresence])

    useEffect(() => {
        if (!enabled) return

        if (faceStatus === 'absent') {
            faceAbsentTimerRef.current = setInterval(() => {
                setFaceAbsentSeconds(prev => {
                    const newVal = prev + 1
                    if (newVal >= FACE_ABSENT_THRESHOLD && newVal % 5 === 0) {
                        pendingEventsRef.current.push({
                            event_type: 'face_absent',
                            question_id: questionId,
                            timestamp: new Date().toISOString(),
                            duration_seconds: newVal,
                            details: `No face/camera detected for ${newVal} seconds`,
                        })
                    }
                    return newVal
                })
            }, 1000)
        } else {
            if (faceAbsentTimerRef.current) {
                clearInterval(faceAbsentTimerRef.current)
            }
        }

        return () => {
            if (faceAbsentTimerRef.current) {
                clearInterval(faceAbsentTimerRef.current)
            }
        }
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

    return { faceStatus, faceAbsentSeconds, lastFaceCheck, flushEvents }
}

export function useVoiceActivityDetection(streamRef, sessionId, questionId, enabled = true) {
    const [voiceStatus, setVoiceStatus] = useState('active')  // active | silent | muted
    const [silenceSeconds, setSilenceSeconds] = useState(0)
    const [audioLevel, setAudioLevel] = useState(0)
    const voiceCheckIntervalRef = useRef(null)
    const silenceTimerRef = useRef(null)
    const analyserRef = useRef(null)
    const pendingEventsRef = useRef([])

    useEffect(() => {
        if (!enabled || !streamRef?.current) return

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)()
            const source = audioContext.createMediaStreamSource(streamRef.current)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analyserRef.current = analyser
        } catch (err) {
            console.warn('Voice activity detection setup failed:', err)
        }

        return () => {
            if (voiceCheckIntervalRef.current) clearInterval(voiceCheckIntervalRef.current)
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
        }
    }, [enabled, streamRef])

    const checkAudioLevel = useCallback(() => {
        if (!analyserRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        const normalizedLevel = Math.min(100, (average / 128) * 100)
        setAudioLevel(normalizedLevel)

        const isSilent = normalizedLevel < 5
        setVoiceStatus(isSilent ? 'silent' : 'active')
    }, [])

    useEffect(() => {
        if (!enabled) return

        voiceCheckIntervalRef.current = setInterval(checkAudioLevel, VOICE_ACTIVITY_INTERVAL)

        return () => {
            if (voiceCheckIntervalRef.current) {
                clearInterval(voiceCheckIntervalRef.current)
            }
        }
    }, [enabled, checkAudioLevel])

    useEffect(() => {
        if (!enabled) return

        if (voiceStatus === 'silent') {
            silenceTimerRef.current = setInterval(() => {
                setSilenceSeconds(prev => {
                    const newVal = prev + 1
                    if (newVal >= NO_VOICE_THRESHOLD && newVal % 10 === 0) {
                        pendingEventsRef.current.push({
                            event_type: 'no_voice',
                            question_id: questionId,
                            timestamp: new Date().toISOString(),
                            duration_seconds: newVal,
                            details: `No voice detected for ${newVal} seconds`,
                        })
                    }
                    return newVal
                })
            }, 1000)
        } else {
            setSilenceSeconds(0)
            if (silenceTimerRef.current) {
                clearInterval(silenceTimerRef.current)
            }
        }

        return () => {
            if (silenceTimerRef.current) {
                clearInterval(silenceTimerRef.current)
            }
        }
    }, [enabled, voiceStatus, questionId])

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

export function useIntegrityMonitoring(videoRef, streamRef, sessionId, questionId, enabled = true) {
    const tabSwitch = useTabSwitchDetection(sessionId, questionId, enabled)
    const faceDetection = useFaceDetection(videoRef, sessionId, questionId, enabled)
    const voiceActivity = useVoiceActivityDetection(streamRef, sessionId, questionId, enabled)

    // Use refs to store the latest flush functions so flushAllEvents stays stable
    const flushRefs = useRef({
        tabSwitch: null,
        faceDetection: null,
        voiceActivity: null,
    })

    // Update refs when flush functions change (without recreating flushAllEvents)
    useEffect(() => {
        flushRefs.current = {
            tabSwitch: tabSwitch.flushEvents,
            faceDetection: faceDetection.flushEvents,
            voiceActivity: voiceActivity.flushEvents,
        }
    }, [tabSwitch.flushEvents, faceDetection.flushEvents, voiceActivity.flushEvents])

    const flushAllEvents = useCallback(async () => {
        await Promise.all([
            flushRefs.current.tabSwitch?.(),
            flushRefs.current.faceDetection?.(),
            flushRefs.current.voiceActivity?.(),
        ])
    }, [])  // Empty deps - function is now stable

    const integrityWarnings = [
        ...(tabSwitch.tabSwitchCount > 0 ? [`Tab switches: ${tabSwitch.tabSwitchCount}`] : []),
        ...(faceDetection.faceAbsentSeconds >= FACE_ABSENT_THRESHOLD
            ? [`Face absent: ${faceDetection.faceAbsentSeconds}s`]
            : []),
        ...(voiceActivity.silenceSeconds >= NO_VOICE_THRESHOLD
            ? [`Silence: ${voiceActivity.silenceSeconds}s`]
            : []),
    ]

    return {
        tabSwitch,
        faceDetection,
        voiceActivity,
        flushAllEvents,
        integrityWarnings,
        hasIssues: integrityWarnings.length > 0,
    }
}
