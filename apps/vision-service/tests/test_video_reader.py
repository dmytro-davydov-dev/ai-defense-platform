"""REQ-4.2/4.12: VideoReader — bounded-memory frame iteration."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vision_service.video.reader import VideoOpenError, VideoReader

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_VIDEO = REPO_ROOT / "samples" / "sample-mission-clip.mp4"


def test_frames_yields_one_ndarray_per_frame() -> None:
    with VideoReader(SAMPLE_VIDEO) as reader:
        frames = list(reader.frames())

    assert len(frames) == 12
    for frame in frames:
        assert isinstance(frame, np.ndarray)
        assert frame.shape == (48, 64, 3)
        assert frame.dtype == np.uint8


def test_frames_are_a_generator_not_a_buffered_list() -> None:
    """REQ-4.2: `frames()` must be lazy — calling it must not itself
    decode anything until iterated.
    """
    with VideoReader(SAMPLE_VIDEO) as reader:
        generator = reader.frames()
        assert not isinstance(generator, list)
        first = next(generator)
        assert first.shape == (48, 64, 3)


def test_context_manager_releases_capture() -> None:
    with VideoReader(SAMPLE_VIDEO) as reader:
        pass
    # Released capture reports not-opened; reading from it fails closed
    # (empty generator) rather than raising.
    assert list(reader.frames()) == []


def test_open_error_for_a_nonexistent_path() -> None:
    with pytest.raises(VideoOpenError):
        VideoReader(REPO_ROOT / "samples" / "does-not-exist.mp4")


def test_open_error_for_a_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.mp4"
    corrupt.write_bytes(b"not a real video file")
    with pytest.raises(VideoOpenError):
        VideoReader(corrupt)
