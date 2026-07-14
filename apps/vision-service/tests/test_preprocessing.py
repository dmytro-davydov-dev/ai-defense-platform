"""REQ-4.4/4.12: resize/normalize preprocessing."""

from __future__ import annotations

import numpy as np
import pytest

from vision_service.frames.preprocessing import normalize, resize


def _sample_frame() -> np.ndarray:
    return np.full((48, 64, 3), 128, dtype=np.uint8)


def test_resize_changes_shape_keeps_dtype() -> None:
    frame = _sample_frame()

    resized = resize(frame, width=32, height=24)

    assert resized.shape == (24, 32, 3)
    assert resized.dtype == np.uint8


def test_resize_does_not_mutate_input() -> None:
    frame = _sample_frame()
    original = frame.copy()

    resize(frame, width=16, height=16)

    assert np.array_equal(frame, original)


@pytest.mark.parametrize(("width", "height"), [(0, 10), (10, 0), (-1, 10)])
def test_resize_rejects_non_positive_dimensions(width: int, height: int) -> None:
    with pytest.raises(ValueError, match="width/height must be positive"):
        resize(_sample_frame(), width=width, height=height)


def test_normalize_converts_uint8_to_float32_in_unit_range() -> None:
    frame = np.array([[[0, 128, 255]]], dtype=np.uint8)

    normalized = normalize(frame)

    assert normalized.dtype == np.float32
    assert normalized.shape == frame.shape
    np.testing.assert_allclose(normalized[0, 0], [0.0, 128 / 255, 1.0], atol=1e-6)


def test_normalize_does_not_mutate_input() -> None:
    frame = _sample_frame()
    original = frame.copy()

    normalize(frame)

    assert np.array_equal(frame, original)
