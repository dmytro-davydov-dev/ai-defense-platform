"""REQ-4.6/4.12: video metadata extraction."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from vision_service.metadata.extract import MetadataExtractionError, extract_video_metadata

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_VIDEO = REPO_ROOT / "samples" / "sample-mission-clip.mp4"


def test_extract_video_metadata_reads_real_properties() -> None:
    metadata = extract_video_metadata(SAMPLE_VIDEO)

    assert metadata.fps == pytest.approx(4.0)
    assert metadata.frameCount == 12
    assert metadata.width == 64
    assert metadata.height == 48
    assert metadata.durationSeconds == pytest.approx(3.0)


def test_extract_video_metadata_checksum_matches_file_contents() -> None:
    expected = hashlib.sha256(SAMPLE_VIDEO.read_bytes()).hexdigest()

    metadata = extract_video_metadata(SAMPLE_VIDEO)

    assert metadata.checksumSha256 == expected


def test_extract_video_metadata_raises_for_a_missing_file() -> None:
    with pytest.raises(MetadataExtractionError):
        extract_video_metadata(REPO_ROOT / "samples" / "does-not-exist.mp4")


def test_extract_video_metadata_raises_for_a_corrupt_file(tmp_path: Path) -> None:
    corrupt = tmp_path / "corrupt.mp4"
    corrupt.write_bytes(b"not a real video file")
    with pytest.raises(MetadataExtractionError):
        extract_video_metadata(corrupt)
