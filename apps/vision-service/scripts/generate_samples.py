"""Regenerates the synthetic fixtures under `samples/` (repo root) used
by Phase 4's tests (REQ-4.12) — see `samples/README.md`. Deterministic:
running this twice produces byte-identical output, so re-running it is
only needed if the fixture's shape/content intentionally changes.

Usage:
    uv run python scripts/generate_samples.py
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLES_DIR = REPO_ROOT / "samples"

VIDEO_PATH = SAMPLES_DIR / "sample-mission-clip.mp4"
VIDEO_WIDTH, VIDEO_HEIGHT = 64, 48
VIDEO_FPS = 4.0
VIDEO_FRAME_COUNT = 12

IMAGE_PATH = SAMPLES_DIR / "sample-frame.png"
IMAGE_WIDTH, IMAGE_HEIGHT = 64, 48


def generate_video() -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(VIDEO_PATH), fourcc, VIDEO_FPS, (VIDEO_WIDTH, VIDEO_HEIGHT))
    if not writer.isOpened():
        raise RuntimeError(f"could not open VideoWriter for {VIDEO_PATH}")
    try:
        for i in range(VIDEO_FRAME_COUNT):
            value = (i * 20) % 256
            frame = np.full((VIDEO_HEIGHT, VIDEO_WIDTH, 3), value, dtype=np.uint8)
            writer.write(frame)
    finally:
        writer.release()


def generate_image() -> None:
    frame = np.zeros((IMAGE_HEIGHT, IMAGE_WIDTH, 3), dtype=np.uint8)
    for y in range(IMAGE_HEIGHT):
        for x in range(IMAGE_WIDTH):
            frame[y, x] = (x % 256, y % 256, (x + y) % 256)
    if not cv2.imwrite(str(IMAGE_PATH), frame):
        raise RuntimeError(f"could not write image to {IMAGE_PATH}")


def main() -> None:
    SAMPLES_DIR.mkdir(exist_ok=True)
    generate_video()
    generate_image()
    print(f"wrote {VIDEO_PATH}")
    print(f"wrote {IMAGE_PATH}")


if __name__ == "__main__":
    main()
