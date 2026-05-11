import { useEffect, useRef, useState, useCallback } from 'react'
import * as faceApi from 'face-api.js'
import { interviewAPI } from '../services/api'

const MODEL_URL = '/models/tiny_face_detector'
const CHECK_INTERVAL = 2000

export function useFaceApiDetection(videoRef, sessionId, questionId, enabled = true) {
    const [faceStatus, setFaceStatus] = useState('present')
    const [faceAbsentSeconds, setFaceAbsentSeconds] = useState(0)
    const [modelsLoaded, setModelsLoaded] = useState(false)
    const [modelLoadError, setModelLoadError] = useState(null)

    const faceAbsentSecondsRef = useRef(0)
    const pendingEventsRef = useRef([])
    const checkIntervalRef = useRef(null)
    const canvasRef = useRef(null)

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

    const checkFacePresence = useCallback(async () => {
        if (!videoRef?.current || !modelsLoaded) return
        const video = videoRef.current

        if (video.readyState < 2 || video.paused || video.videoWidth === 0) return

        try {
            if (!canvasRef.current) {
                canvasRef.current = document.createElement('canvas')
            }
            const canvas = canvasRef.current
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            const detections = await faceApi.detectAllFaces(canvas, new faceApi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.5,
            }))

            if (detections.length === 0) {
                faceAbsentSecondsRef.current += CHECK_INTERVAL / 1000
                setFaceAbsentSeconds(faceAbsentSecondsRef.current)
                setFaceStatus('absent')
            } else if (detections.length > 1) {
                faceAbsentSecondsRef.current = 0
                setFaceAbsentSeconds(0)
                setFaceStatus('multiple')
            } else {
                faceAbsentSecondsRef.current = 0
                setFaceAbsentSeconds(0)
                setFaceStatus('present')
            }
        } catch (err) {
            console.debug('[FaceApi] detect error:', err?.message)
        }
    }, [videoRef, modelsLoaded])

    useEffect(() => {
        if (!enabled) return

        const loadModels = async () => {
            try {
                await faceApi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
                setModelsLoaded(true)
                console.info('[FaceApi] Models loaded successfully')
            } catch (err) {
                console.error('[FaceApi] Failed to load models:', err)
                setModelLoadError(err.message)
            }
        }

        loadModels()
    }, [enabled])

    useEffect(() => {
        if (!enabled || !modelsLoaded) return

        checkIntervalRef.current = setInterval(checkFacePresence, CHECK_INTERVAL)
        return () => clearInterval(checkIntervalRef.current)
    }, [enabled, modelsLoaded, checkFacePresence])

    useEffect(() => {
        if (!enabled) return
        if (faceAbsentSecondsRef.current >= 5) {
            pendingEventsRef.current.push({
                event_type: 'face_absent',
                question_id: questionId,
                timestamp: new Date().toISOString(),
                duration_seconds: faceAbsentSecondsRef.current,
                details: `No face detected for ${faceAbsentSecondsRef.current.toFixed(1)} seconds`,
            })
        }
    }, [
        enabled,
        Math.floor(faceAbsentSecondsRef.current / 5) * 5,
        questionId,
    ])

    useEffect(() => {
        if (!enabled || faceStatus !== 'multiple') return
        pendingEventsRef.current.push({
            event_type: 'multiple_faces',
            question_id: questionId,
            timestamp: new Date().toISOString(),
            details: 'Multiple faces detected in camera frame',
        })
    }, [enabled, faceStatus, questionId])

    return { faceStatus, faceAbsentSeconds, modelsLoaded, modelLoadError, flushEvents }
}
