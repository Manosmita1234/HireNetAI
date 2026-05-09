"""
services/emotion_service.py – Frame-level facial emotion analysis using OpenCV and DeepFace.

How it works:
  1. OpenCV opens the video file as a sequence of frames
  2. We sample one frame per second (e.g. a 90-second answer → ~90 frames analyzed)
  3. DeepFace runs a facial emotion recognition model on each frame
  4. The results are aggregated into:
       - emotion_distribution: % of time spent in each emotion (happy, sad, angry, fear, neutral, etc.)
       - confidence_index:     0–10 (how confident the candidate seemed — based on happy + neutral %)
       - nervousness_score:    0–10 (how nervous the candidate seemed — based on fear + sad + angry %)

DeepFace supports these 7 emotions: angry, disgust, fear, happy, sad, surprise, neutral

Why run in a thread pool?
  OpenCV and DeepFace use heavy C extensions that block the Python thread.
  run_in_executor moves this to a thread so the event loop isn't frozen.
"""

import asyncio
from typing import Dict, List, Any

import cv2  # OpenCV: computer vision library for reading video frames


def _analyze_frames_sync(video_path: str) -> Dict[str, Any]:
    """
    Synchronous: opens the video, extracts one frame per second,
    and runs DeepFace emotion analysis on each frame.

    Returns:
        frame_emotions       – list of {timestamp, dominant_emotion, emotion_scores} per analyzed frame
        emotion_distribution – weighted % breakdown across all frames (e.g. {"happy": 42.5, "neutral": 38.1})
        confidence_index     – 0–10 score based on positive emotions
        nervousness_score    – 0–10 score based on negative emotions
    """
    # DeepFace is a large library, imported lazily to speed up startup
    from deepface import DeepFace

    # cv2.VideoCapture opens the video file for frame-by-frame reading
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    # FPS = frames per second of the video (usually 25 or 30)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    # We analyze 1 frame every 5th frame to reduce processing time
    frame_interval = 5   # analyze every 5th frame

    frame_emotions: List[Dict[str, Any]] = []  # per-frame results
    emotion_totals: Dict[str, float] = {}       # running total of each emotion score across all frames
    frame_index = 0

    while True:
        # cap.read() → (success, frame); when success=False, we've read all frames
        ret, frame = cap.read()
        if not ret:
            break

        # Only process every `frame_interval`-th frame (every 5th frame)
        if frame_index % frame_interval == 0:
            timestamp = float(frame_index) / float(fps)  # time in seconds from the start of the video

            try:
                # DeepFace.analyze() runs the emotion model on a single frame (numpy array)
                # enforce_detection=False → don't crash if no face is detected, just skip
                # silent=True → suppress DeepFace's own print output
                analysis = DeepFace.analyze(
                    img_path=frame,
                    actions=["emotion"],        # only run emotion analysis (skip age, gender, race)
                    enforce_detection=False,
                    silent=True,
                )
                # DeepFace may return a list (one entry per face); we always take the first face
                result = analysis[0] if isinstance(analysis, list) else analysis
                emotions: Dict[str, float] = result["emotion"]   # raw scores for each emotion
                dominant: str = result["dominant_emotion"]        # the emotion with the highest score

                # Accumulate emotion scores for the distribution calculation below
                for emo, score in emotions.items():
                    emotion_totals[emo] = emotion_totals.get(emo, 0.0) + score

                frame_emotions.append({
                    "timestamp":       round(float(timestamp), 2),
                    "dominant_emotion": dominant,
                    "emotion_scores":  {k: round(float(v), 2) for k, v in emotions.items()},
                })
            except Exception:
                # If no face is detected in this frame (e.g. candidate looked away), skip silently
                pass

        frame_index += 1

    cap.release()  # release the video file handle so the OS can free resources

    # ── Handle case where NO frames were analyzed (no face found) ─────────────
    if not frame_emotions:
        return {
            "frame_emotions":      [],
            "emotion_distribution": {},
            "confidence_index":    0.0,
            "nervousness_score":   0.0,
        }

    # ── Compute emotion distribution (%) ──────────────────────────────────────
    # total_weight = sum of all raw emotion scores across all frames
    total_weight = float(sum(emotion_totals.values()))
    distribution: Dict[str, float] = {
        emo: round(float(score) / total_weight * 100, 2)  # convert to percentage
        for emo, score in emotion_totals.items()
    }

    # ── Confidence index (0–10) ────────────────────────────────────────────────
    # "Confident" candidates show more happy + neutral expressions.
    # Formula: (happy% + neutral%) / 100 × 10, capped at 10
    positive = float(distribution.get("happy", 0)) + float(distribution.get("neutral", 0))
    confidence_index = round(min(positive / 100 * 10, 10), 2)

    # ── Nervousness score (0–10) ───────────────────────────────────────────────
    # "Nervous" candidates show more fear + sad + angry expressions.
    # Formula: (fear% + sad% + angry%) / 100 × 10, capped at 10
    negative = (
        float(distribution.get("fear", 0))
        + float(distribution.get("sad", 0))
        + float(distribution.get("angry", 0))
    )
    nervousness_score = round(min(negative / 100 * 10, 10), 2)

    return {
        "frame_emotions":       frame_emotions,
        "emotion_distribution": distribution,
        "confidence_index":     confidence_index,
        "nervousness_score":    nervousness_score,
    }


async def analyze_video_emotions(video_path: str) -> Dict[str, Any]:
    """
    Async wrapper around the synchronous emotion analysis.
    Runs the blocking OpenCV/DeepFace code in a background thread pool
    so the FastAPI event loop stays free for other requests.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _analyze_frames_sync, video_path)
