import { useCallback, useEffect, useRef } from 'react'

export function useTextToSpeech() {
    const synthRef = useRef(null)
    const isEnabledRef = useRef(true)

    useEffect(() => {
        synthRef.current = window.speechSynthesis
        return () => {
            if (synthRef.current) {
                synthRef.current.cancel()
            }
        }
    }, [])

    const speak = useCallback((text) => {
        if (!synthRef.current || !isEnabledRef.current) return

        synthRef.current.cancel()

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.9
        utterance.pitch = 1
        utterance.lang = 'en-US'

        synthRef.current.speak(utterance)
    }, [])

    const stop = useCallback(() => {
        if (synthRef.current) {
            synthRef.current.cancel()
        }
    }, [])

    const setEnabled = useCallback((enabled) => {
        isEnabledRef.current = enabled
        if (!enabled) {
            stop()
        }
    }, [stop])

    return { speak, stop, setEnabled }
}