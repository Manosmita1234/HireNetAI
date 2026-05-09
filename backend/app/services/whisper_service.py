"""
services/whisper_service.py – Speech-to-text transcription and hesitation analysis using WhisperX.

WhisperX is an enhanced version of OpenAI's Whisper speech recognition model.
It adds:
  - Word-level timestamps (exactly when each word was spoken)
  - Phoneme-level alignment using a separate alignment model
  - Batch transcription for faster processing

Pipeline per audio file:
  Step 1: Transcribe audio into text segments (each segment ≈ one sentence)
  Step 2: Align segments to get per-word start/end timestamps
  Step 3: Detect long pauses (>2 seconds between words)
  Step 4: Compute hesitation score (0–10) from the number of pauses

Why run in a thread pool?
  WhisperX is CPU/GPU bound and blocks the Python thread.
  FastAPI uses an async event loop, so blocking calls would freeze ALL requests.
  `run_in_executor` moves blocking code to a thread pool, keeping the event loop free.
"""

import asyncio
from typing import Dict, List, Any

import numpy as np

from app.config import get_settings

settings = get_settings()


def _to_native(value):
    """Convert numpy types to native Python types for MongoDB serialization."""
    if isinstance(value, np.ndarray):
        return value.item()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, list):
        return [_to_native(v) for v in value]
    if isinstance(value, dict):
        return {k: _to_native(v) for k, v in value.items()}
    return value

# ── Model cache ───────────────────────────────────────────────────────────────
# WhisperX models are large (~1 GB) and slow to load.
# We load them once on first use and reuse the same instance for every audio file.
_whisper_model = None                         # main transcription model
_align_model_cache: Dict[str, Any] = {}       # alignment model, cached per language (e.g. "en_cpu")


def _load_whisper():
    """
    Load (or return cached) WhisperX transcription model.

    Called inside the thread pool so the heavy download/load doesn't block the event loop.
    The `global` keyword lets us modify the module-level _whisper_model variable.
    """
    import whisperx

    global _whisper_model
    if _whisper_model is None:
        # First load: download (if needed) and initialize the model
        print(f"[Whisper] Loading model '{settings.whisper_model_size}' on {settings.whisper_device} ...")
        _whisper_model = whisperx.load_model(
            settings.whisper_model_size,      # e.g. "base", "small", "medium", "large-v2"
            device=settings.whisper_device,   # "cpu" or "cuda" (GPU)
            compute_type=settings.whisper_compute_type,  # "int8" = faster, "float16" = more accurate
        )
        print("[Whisper] Model loaded OK")
    return _whisper_model


def _transcribe_sync(audio_path: str) -> Dict[str, Any]:
    """
    Full synchronous WhisperX transcription pipeline.

    This function runs in a background thread (not the event loop) because it
    blocks on heavy CPU/GPU computation.

    Returns a dict with:
      transcript      – full text of what the candidate said
      words           – list of {word, start, end, score} dicts
      pauses          – list of long pauses detected between words
      hesitation_score– 0–10 (more pauses → higher hesitation)
      language        – detected language code (e.g. "en")
    """
    import whisperx

    model = _load_whisper()

    # ── Step 1: Transcribe audio → segments ───────────────────────────────────
    # whisperx.load_audio reads the .wav file into a numpy float32 array
    audio = whisperx.load_audio(audio_path)
    # batch_size=16 means process 16 audio segments at a time (faster on GPU)
    result = model.transcribe(audio, batch_size=16)
    language = result.get("language", "en")  # WhisperX auto-detects the spoken language

    # ── Step 2: Word-level alignment ──────────────────────────────────────────
    # Alignment maps each word to an exact start/end timestamp in the audio.
    # The alignment model is language-specific (different model for English vs French etc.)
    align_model_key = f"{language}_{settings.whisper_device}"  # cache key
    if align_model_key not in _align_model_cache:
        # Load alignment model for the detected language (cached after first use)
        align_model, metadata = whisperx.load_align_model(
            language_code=language, device=settings.whisper_device
        )
        _align_model_cache[align_model_key] = (align_model, metadata)

    align_model, metadata = _align_model_cache[align_model_key]
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio, settings.whisper_device
    )

    # ── Step 3: Extract word-level timestamps ─────────────────────────────────
    words: List[Dict[str, Any]] = []
    full_transcript_parts: List[str] = []

    for segment in aligned.get("segments", []):
        full_transcript_parts.append(segment.get("text", "").strip())
        for w in segment.get("words", []):
            words.append({
                "word":  w.get("word", ""),
                "start": round(w.get("start", 0.0), 3),  # seconds from start of audio
                "end":   round(w.get("end",   0.0), 3),
                "score": round(w.get("score", 1.0), 3),  # confidence score (0–1)
            })

    full_transcript = " ".join(full_transcript_parts).strip()  # join all sentence-level text

    # If transcript is empty, near-empty (< 3 chars), or just punctuation, treat as no answer
    if not full_transcript or len(full_transcript) < 3 or not any(c.isalnum() for c in full_transcript):
        return _to_native({
            "transcript":       "",
            "words":            [],
            "pauses":           [],
            "hesitation_score": 0.0,
            "language":         language,
        })

    # ── Step 4: Detect gaps between consecutive words ──────────────────────────
    LONG_PAUSE_THRESHOLD = 2.0  # any gap > 2 seconds counts as a "long pause"
    pauses: List[Dict[str, float]] = []

    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i - 1]["end"]  # silence between previous word's end and current word's start
        if gap > LONG_PAUSE_THRESHOLD:
            pauses.append({
                "after_word":  words[i - 1]["word"],  # word before the pause
                "before_word": words[i]["word"],       # word after the pause
                "duration":    round(gap, 3),          # how long the pause was in seconds
                "at_time":     words[i - 1]["end"],    # timestamp when the pause began
            })

    # Hesitation score formula: each long pause adds 1.5 points (max 10)
    # e.g. 0 pauses → 0.0, 3 pauses → 4.5, 7+ pauses → 10.0
    hesitation_score = min(len(pauses) * 1.5, 10.0)

    return _to_native({
        "transcript":       full_transcript,
        "words":            words,
        "pauses":           pauses,
        "hesitation_score": round(hesitation_score, 2),
        "language":         language,
    })


async def transcribe_audio(audio_path: str) -> Dict[str, Any]:
    """
    Async entry point for transcription.
    Delegates the blocking _transcribe_sync function to a thread pool so
    the rest of the FastAPI server remains responsive during transcription.
    """
    loop = asyncio.get_event_loop()
    # run_in_executor(None, func, *args) → runs func in the default ThreadPoolExecutor
    return await loop.run_in_executor(None, _transcribe_sync, audio_path)
