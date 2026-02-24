"""
services/emotion_service.py – Frame extraction (OpenCV) + emotion analysis (DeepFace).

Pipeline:
  1. Extract one frame per second from the video
  2. Analyse each frame with DeepFace
  3. Compute emotion distribution, confidence index, nervousness score
"""

import asyncio
import os
from pathlib import Path
from typing import Dict, List, Any

import cv2


def _analyze_frames_sync(video_path: str) -> Dict[str, Any]:
    """
    Synchronous: extracts frames every second and runs DeepFace on each.
    Returns emotion distribution, confidence index, and nervousness score.
    """
    from deepface import DeepFace

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_interval = int(fps)   # 1 frame per second

    frame_emotions: List[Dict[str, Any]] = []
    emotion_totals: Dict[str, float] = {}
    frame_index = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Only process every `frame_interval` frames (≈ 1 per second)
        if frame_index % frame_interval == 0:
            timestamp = frame_index / fps
            try:
                analysis = DeepFace.analyze(
                    img_path=frame,
                    actions=["emotion"],
                    enforce_detection=False,
                    silent=True,
                )
                # DeepFace may return a list; take first face
                result = analysis[0] if isinstance(analysis, list) else analysis
                emotions: Dict[str, float] = result["emotion"]
                dominant: str = result["dominant_emotion"]

                # Accumulate for distribution
                for emo, score in emotions.items():
                    emotion_totals[emo] = emotion_totals.get(emo, 0.0) + score

                frame_emotions.append(
                    {
                        "timestamp": round(timestamp, 2),
                        "dominant_emotion": dominant,
                        "emotion_scores": {k: round(v, 2) for k, v in emotions.items()},
                    }
                )
            except Exception as e:
                # If face not detected in frame, skip silently
                pass

        frame_index += 1

    cap.release()

    if not frame_emotions:
        return {
            "frame_emotions": [],
            "emotion_distribution": {},
            "confidence_index": 0.0,
            "nervousness_score": 0.0,
        }

    # ── Emotion distribution (%) ──────────────────────────────────────────────
    total_weight = sum(emotion_totals.values())
    distribution: Dict[str, float] = {
        emo: round((score / total_weight) * 100, 2)
        for emo, score in emotion_totals.items()
    }

    # ── Confidence index ─────────────────────────────────────────────────────
    # Positive emotions = happy + neutral → higher confidence
    positive = distribution.get("happy", 0) + distribution.get("neutral", 0)
    confidence_index = round(min(positive / 100 * 10, 10), 2)

    # ── Nervousness score ─────────────────────────────────────────────────────
    # Fear + Sad + Angry indicate nervousness
    negative = (
        distribution.get("fear", 0)
        + distribution.get("sad", 0)
        + distribution.get("angry", 0)
    )
    nervousness_score = round(min(negative / 100 * 10, 10), 2)

    return {
        "frame_emotions": frame_emotions,
        "emotion_distribution": distribution,
        "confidence_index": confidence_index,
        "nervousness_score": nervousness_score,
    }


async def analyze_video_emotions(video_path: str) -> Dict[str, Any]:
    """Async wrapper – runs blocking OpenCV/DeepFace in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _analyze_frames_sync, video_path)
