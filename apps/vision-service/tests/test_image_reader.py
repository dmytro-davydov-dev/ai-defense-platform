"""REQ-4.3/4.12: single-image reader."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from vision_service.video.image_reader import ImageReadError, read_image

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_IMAGE = REPO_ROOT / "samples" / "sample-frame.png"


def test_read_image_returns_hwc_uint8_ndarray() -> None:
    image = read_image(SAMPLE_IMAGE)

    assert isinstance(image, np.ndarray)
    assert image.shape == (48, 64, 3)
    assert image.dtype == np.uint8


def test_read_image_raises_for_a_missing_path() -> None:
    with pytest.raises(ImageReadError):
        read_image(REPO_ROOT / "samples" / "does-not-exist.png")


def test_read_image_raises_for_a_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.png"
    corrupt.write_bytes(b"not a real image")
    with pytest.raises(ImageReadError):
        read_image(corrupt)
