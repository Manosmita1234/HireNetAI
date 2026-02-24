"""
services/whisper_service.py – Speech-to-text and word-alignment using WhisperX.

Pipeline:
  1. Load WhisperX model (cached after first load)
  2. Transcribe audio → segments
  3. Align segments to get word-level timestamps
  4. Detect long pauses (>2 s) between words
"""

import asyncio
from pathlib import Path
from typing import Dict, List, Any

from app.config import get_settings

settings = get_settings()

# WhisperX model is loaded lazily and cached here
_whisper_model = None
_align_model_cache: Dict[str, Any] = {}


def _load_whisper():
    """Load WhisperX model (runs in thread pool to avoid blocking event loop)."""
    import whisperx

    global _whisper_model
    if _whisper_model is None:
        print(f"[Whisper] Loading model '{settings.whisper_model_size}' on {settings.whisper_device} …")
        _whisper_model = whisperx.load_model(
            settings.whisper_model_size,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
        )
        print("[Whisper] Model loaded ✓")
    return _whisper_model


def _transcribe_sync(audio_path: str) -> Dict[str, Any]:
    """
    Synchronous WhisperX transcription + word-alignment.
    Returns a dict with keys: transcript, words, pauses, hesitation_score.
    """
    import whisperx

    model = _load_whisper()

    # ── Step 1: Transcribe ───────────────────────────────────────────────────
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=16)
    language = result.get("language", "en")

    # ── Step 2: Word-level alignment ─────────────────────────────────────────
    align_model_key = f"{language}_{settings.whisper_device}"
    if align_model_key not in _align_model_cache:
        align_model, metadata = whisperx.load_align_model(
            language_code=language, device=settings.whisper_device
        )
        _align_model_cache[align_model_key] = (align_model, metadata)

    align_model, metadata = _align_model_cache[align_model_key]
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio, settings.whisper_device
    )

    # ── Step 3: Extract word timestamps ─────────────────────────────────────
    words: List[Dict[str, Any]] = []
    full_transcript_parts: List[str] = []

    for segment in aligned.get("segments", []):
        full_transcript_parts.append(segment.get("text", "").strip())
        for w in segment.get("words", []):
            words.append(
                {
                    "word": w.get("word", ""),
                    "start": round(w.get("start", 0.0), 3),
                    "end": round(w.get("end", 0.0), 3),
                    "score": round(w.get("score", 1.0), 3),
                }
            )

    full_transcript = " ".join(full_transcript_parts)

    # ── Step 4: Pause / hesitation detection ─────────────────────────────────
    LONG_PAUSE_THRESHOLD = 2.0   # seconds
    pauses: List[Dict[str, float]] = []

    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i - 1]["end"]
        if gap > LONG_PAUSE_THRESHOLD:
            pauses.append(
                {
                    "after_word": words[i - 1]["word"],
                    "before_word": words[i]["word"],
                    "duration": round(gap, 3),
                    "at_time": words[i - 1]["end"],
                }
            )

    # Hesitation score: 0-10, clamped
    # Formula: number of long pauses × 1.5, capped at 10
    hesitation_score = min(len(pauses) * 1.5, 10.0)

    return {
        "transcript": full_transcript,
        "words": words,
        "pauses": pauses,
        "hesitation_score": round(hesitation_score, 2),
        "language": language,
    }


async def transcribe_audio(audio_path: str) -> Dict[str, Any]:
    """
    Async wrapper: runs blocking WhisperX inference in a thread pool
    so it doesn't block the FastAPI event loop.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _transcribe_sync, audio_path)
