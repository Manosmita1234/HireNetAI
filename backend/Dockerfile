# ────────────────────────────────────────────────────────────────────────────
# Stage 1 – Python base with system dependencies
# ────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# Install ffmpeg + OpenCV system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgl1 \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ────────────────────────────────────────────────────────────────────────────
# Stage 2 – Install Python dependencies
# ────────────────────────────────────────────────────────────────────────────
FROM base AS deps

COPY requirements.txt .

# Install PyTorch (CPU) separately first to control version
RUN pip install --no-cache-dir torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu

# Install WhisperX from GitHub (not on PyPI)
RUN pip install --no-cache-dir git+https://github.com/m-bain/whisperX.git

# Install remaining requirements
RUN pip install --no-cache-dir -r requirements.txt

# ────────────────────────────────────────────────────────────────────────────
# Stage 3 – Final image (copy app code)
# ────────────────────────────────────────────────────────────────────────────
FROM deps AS final

COPY app/ ./app/
COPY .env .env

# Create uploads directory
RUN mkdir -p app/uploads

EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
