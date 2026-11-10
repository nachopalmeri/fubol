# syntax=docker/dockerfile:1

# Audio-based subtitle alignment sidecar. Kept separate from the web image so
# the Next.js container stays small and does not carry a Python toolchain.
#
# Two stages because ffsubsync pulls in `webrtcvad`, which ships no wheel and
# has to be compiled. The compiler stays in the builder and never reaches the
# runtime image.
FROM python:3.12-slim AS build

ENV PIP_NO_CACHE_DIR=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# ffsubsync's voice-activity detector imports `webrtcvad`, which still does
# `import pkg_resources` at module load. Python 3.12 does not ship that, and
# setuptools dropped it in 81 — installing the newest therefore does not help.
# Pinning below 81 is what actually provides the module; without it the aligner
# crashes with ModuleNotFoundError the moment it looks at the audio.
RUN pip install --no-cache-dir "setuptools<81" "ffsubsync==0.4.27"

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    PATH="/opt/venv/bin:$PATH"

# ffsubsync drives ffmpeg to read the audio track, so the binary is required.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/venv /opt/venv

RUN useradd --create-home --uid 1001 subsync
WORKDIR /app
COPY app.py ./
USER subsync

EXPOSE 8080
CMD ["python", "app.py"]
