# WhisperX Configuration & Prompt Reference

This document describes how WhisperX is configured and used in the HireNetAI pipeline.

---

## Configuration (via `.env` / `config.py`)

| Variable | Default | Description |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `base` | Model to load. Options: `tiny`, `base`, `small`, `medium`, `large-v2` |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` (quantised, fast, CPU-safe) or `float16` (GPU) |

For production GPU servers, use `large-v2` + `cuda` + `float16` for highest accuracy.

---

## Pipeline Steps

### 1. Audio Extraction (FFmpeg)

```bash
ffmpeg -y -i <video.webm> -vn -acodec pcm_s16le -ar 16000 -ac 1 <audio.wav>
```

WhisperX requires 16 kHz mono PCM WAV input.

### 2. Transcription

```python
import whisperx

model = whisperx.load_model("base", device="cpu", compute_type="int8")
audio = whisperx.load_audio("audio.wav")
result = model.transcribe(audio, batch_size=16)
# result["segments"] → list of {start, end, text}
# result["language"] → detected language code e.g. "en"
```

### 3. Word-level Alignment

```python
align_model, metadata = whisperx.load_align_model(language_code=result["language"], device="cpu")
aligned = whisperx.align(result["segments"], align_model, metadata, audio, "cpu")
# aligned["segments"][i]["words"] → [{word, start, end, score}, ...]
```

### 4. Pause / Hesitation Detection

A **long pause** is defined as a gap > **2.0 seconds** between consecutive words.

```python
LONG_PAUSE_THRESHOLD = 2.0  # seconds

for i in range(1, len(words)):
    gap = words[i]["start"] - words[i - 1]["end"]
    if gap > LONG_PAUSE_THRESHOLD:
        # record pause
```

**Hesitation Score formula:**
```
hesitation_score = min(num_long_pauses * 1.5, 10.0)   # range: 0 – 10
```

---

## Output Schema

```json
{
  "transcript": "Full concatenated text of all segments.",
  "words": [
    {"word": "Hello", "start": 0.32, "end": 0.61, "score": 0.98},
    {"word": "world",  "start": 0.72, "end": 1.05, "score": 0.97}
  ],
  "pauses": [
    {"after_word": "right", "before_word": "so", "duration": 2.47, "at_time": 8.12}
  ],
  "hesitation_score": 1.5,
  "language": "en"
}
```
