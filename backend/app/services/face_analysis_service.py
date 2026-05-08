"""
services/face_analysis_service.py – OpenCV-based face detection on interview videos.

Inspired by the ISP reference project (github.com/Imtry100/ISP) which uses
haarcascade_frontalface_default.xml for face presence detection.

Unlike DeepFace (emotion detection, which requires heavy GPU resources), this service
uses OpenCV's built-in Haar Cascade classifier which:
  - Is bundled with opencv-python — no extra downloads needed
  - Runs fast on CPU with no GPU required
  - Provides real anti-cheat signals: face absence and multiple-face detection

Processing pipeline:
  1. ffmpeg extracts 1 JPEG frame every SAMPLE_RATE_SECONDS from the answer video
  2. Each frame is converted to grayscale and histogram-equalized for robust detection
  3. haarcascade_frontalface_default.xml runs detectMultiScale on each frame
  4. Metrics are aggregated and stored into MongoDB as answers.$.face_analytics

This service is called from video_processor.py Step C via asyncio.run_in_executor
(blocking/CPU-bound operations must not block the event loop).
"""

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict

import cv2
import numpy as np

# ── Configuration constants ────────────────────────────────────────────────────
SAMPLE_RATE_SECONDS = 2     # Extract 1 frame every N seconds (30 frames for a 60s answer)
MIN_FACE_SIZE       = (40, 40)  # Minimum face bounding box in pixels (filters tiny false positives)
SCALE_FACTOR        = 1.1   # Haar Cascade pyramid scale (1.1 = fine-grained, slightly slower)
MIN_NEIGHBORS       = 5     # How many neighbours a rect must retain (higher = fewer false positives)

# OpenCV bundles the haarcascade XML files inside the package.
# cv2.data.haarcascades returns the path to that bundled directory.
FACE_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


def _load_cascade() -> cv2.CascadeClassifier:
    """
    Load the Haar Cascade frontal-face detector bundled with opencv-python.

    Raises RuntimeError if the cascade file is not found (usually means
    opencv-python is not installed or the installation is corrupt).
    """
    cascade = cv2.CascadeClassifier(FACE_CASCADE_PATH)
    if cascade.empty():
        raise RuntimeError(
            f"Failed to load Haar Cascade from: {FACE_CASCADE_PATH}\n"
            "Make sure opencv-python is installed:  pip install opencv-python"
        )
    return cascade


def _extract_frames(video_path: str) -> list:
    """
    Use ffmpeg to extract one JPEG frame every SAMPLE_RATE_SECONDS from the video.

    All frames are loaded into memory as numpy arrays before the temp directory
    is cleaned up, so callers get a plain list of BGR images.

    Args:
        video_path: Full path to the uploaded .webm or .mp4 interview video.

    Returns:
        List of numpy arrays, each shaped (H, W, 3) in BGR colour order.
        Returns an empty list if ffmpeg fails or the video has no decodable frames.
    """
    frames = []

    with tempfile.TemporaryDirectory() as tmpdir:
        output_pattern = os.path.join(tmpdir, "frame_%04d.jpg")

        # -vf fps=1/N selects one frame every N seconds
        # -q:v 2     sets high JPEG quality (lower number = higher quality)
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vf", f"fps=1/{SAMPLE_RATE_SECONDS}",
            "-q:v", "2",
            output_pattern,
            "-loglevel", "error",   # suppress info/warning spam
        ]

        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            # ffmpeg can return non-zero for harmless warnings; log and continue
            print(f"[FaceAnalysis] ffmpeg note: {proc.stderr[:250]}")

        # Load all extracted frames before the temp directory is deleted
        for frame_file in sorted(Path(tmpdir).glob("frame_*.jpg")):
            img = cv2.imread(str(frame_file))
            if img is not None:
                frames.append(img)

    return frames


def _count_faces_in_frame(frame: np.ndarray, cascade: cv2.CascadeClassifier) -> int:
    """
    Count the number of faces detected in a single BGR video frame.

    Steps:
      1. Convert BGR → Grayscale   (Haar Cascade requires single-channel input)
      2. equalizeHist              (normalises brightness; improves detection accuracy)
      3. detectMultiScale          (returns a list of (x, y, w, h) face bounding boxes)
      4. Return len(faces)

    Args:
        frame:   BGR numpy array from cv2.imread / ffmpeg output.
        cascade: Pre-loaded CascadeClassifier instance (loaded once, shared across frames).

    Returns:
        Integer number of faces detected (0, 1, or 2+).
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)   # normalise contrast across lighting conditions

    faces = cascade.detectMultiScale(
        gray,
        scaleFactor=SCALE_FACTOR,
        minNeighbors=MIN_NEIGHBORS,
        minSize=MIN_FACE_SIZE,
        flags=cv2.CASCADE_SCALE_IMAGE,
    )

    # detectMultiScale returns a numpy array of rects or an empty tuple
    return len(faces) if isinstance(faces, np.ndarray) else 0


def analyze_video_faces(video_path: str) -> Dict[str, Any]:
    """
    Run frame-by-frame face detection on an interview answer video.

    Called synchronously from video_processor.py via asyncio.run_in_executor
    because cv2 frame analysis is CPU-bound (blocking) and must not stall
    the FastAPI event loop.

    Returns a structured dict (stored in MongoDB at answers.$.face_analytics):

    {
        "total_frames_analyzed":  int,
        "frames_with_face":       int,   # frames with exactly 1 face
        "frames_without_face":    int,   # frames with 0 faces (candidate left camera)
        "frames_multiple_faces":  int,   # frames with 2+ faces (possible cheating)
        "face_absent_ratio":      float, # 0.0–1.0 (fraction of frames with no face)
        "multiple_face_ratio":    float, # 0.0–1.0 (fraction of frames with 2+ faces)
        "face_attention_score":   float, # 0–10 composite engagement score
        "status":                 str,   # "ok" | "no_frames" | "error"
    }

    face_attention_score formula:
        base    = face_present_ratio × 10       (up to 10 for always on-camera)
        penalty = multiple_face_ratio  × 3.0    (deduct up to 3 for cheating risk)
        score   = clamp(base − penalty, 0, 10)

    On error, status = "error" and face_attention_score = None so the scoring
    service can detect and skip this field gracefully.
    """
    result: Dict[str, Any] = {
        "total_frames_analyzed": 0,
        "frames_with_face":      0,
        "frames_without_face":   0,
        "frames_multiple_faces": 0,
        "face_absent_ratio":     0.0,
        "multiple_face_ratio":   0.0,
        "face_attention_score":  10.0,   # optimistic default; overwritten below
        "status":                "ok",
    }

    try:
        cascade = _load_cascade()

        print(f"[FaceAnalysis] Extracting frames from: {Path(video_path).name}")
        frames = _extract_frames(video_path)

        if not frames:
            print("[FaceAnalysis] No frames extracted — video may be empty or unreadable")
            result["status"] = "no_frames"
            return result

        total = len(frames)
        result["total_frames_analyzed"] = total
        print(f"[FaceAnalysis] Analysing {total} frames …")

        # ── Count faces in every sampled frame ────────────────────────────────
        for frame in frames:
            face_count = _count_faces_in_frame(frame, cascade)
            if face_count == 0:
                result["frames_without_face"] += 1
            elif face_count == 1:
                result["frames_with_face"] += 1
            else:  # 2 or more faces detected
                result["frames_with_face"]     += 1   # candidate is present at least
                result["frames_multiple_faces"] += 1   # but someone else is too

        # ── Compute ratios ────────────────────────────────────────────────────
        result["face_absent_ratio"]   = round(result["frames_without_face"]   / total, 3)
        result["multiple_face_ratio"] = round(result["frames_multiple_faces"] / total, 3)

        # ── Compute face attention score (0–10) ───────────────────────────────
        face_present_ratio = 1.0 - result["face_absent_ratio"]
        penalty            = result["multiple_face_ratio"] * 3.0
        score              = max(0.0, min(10.0, (face_present_ratio * 10.0) - penalty))
        result["face_attention_score"] = round(score, 2)

        print(
            f"[FaceAnalysis] ✓  present={result['frames_with_face']}/{total}  "
            f"absent={result['frames_without_face']}  "
            f"multi={result['frames_multiple_faces']}  "
            f"score={result['face_attention_score']}"
        )

    except Exception as exc:
        print(f"[FaceAnalysis] ERROR: {exc}")
        result["status"]               = "error"
        result["error_message"]        = str(exc)[:300]
        result["face_attention_score"] = None   # scorer will skip this field

    return result
