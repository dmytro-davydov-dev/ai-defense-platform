"""REQ-5.5: multi-object tracking. See
docs/adr/ADR-006-detection-model-and-tracker.md for why this is a
minimal in-house IoU tracker rather than the external ByteTrack/
BoT-SORT packages the roadmap names.
"""

from __future__ import annotations

from dataclasses import dataclass

from vision_service.frames.models import BoundingBox, Detection

DEFAULT_IOU_THRESHOLD = 0.3
DEFAULT_MAX_MISSES = 5


def _iou(a: BoundingBox, b: BoundingBox) -> float:
    """Intersection-over-union of two pixel-space boxes. `0.0` for
    non-overlapping or degenerate (non-positive area) boxes rather
    than raising.
    """
    ax1, ay1, ax2, ay2 = a.x, a.y, a.x + a.width, a.y + a.height
    bx1, by1, bx2, by2 = b.x, b.y, b.x + b.width, b.y + b.height

    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h

    area_a = max(0.0, a.width) * max(0.0, a.height)
    area_b = max(0.0, b.width) * max(0.0, b.height)
    union = area_a + area_b - intersection

    return intersection / union if union > 0 else 0.0


@dataclass
class _Track:
    track_id: int
    label: str
    bounding_box: BoundingBox
    misses: int = 0


class Tracker:
    """Stateful, per-mission tracker: construct one instance per
    mission being processed, call `update()` once per frame in frame
    order, discard it once the mission finishes. Not safe to share
    across missions or to call out of frame order.

    Association is greedy, per-label IoU matching, highest-IoU-first —
    a single-tier simplification of ByteTrack's two-tier (high-conf
    then low-conf) matching, justified because REQ-5.3's confidence
    threshold already removes the low-confidence tier before detections
    ever reach the tracker. A track survives up to `max_misses`
    consecutive frames with no matching detection before it is dropped;
    an unmatched detection starts a new track ID.
    """

    def __init__(
        self,
        iou_threshold: float = DEFAULT_IOU_THRESHOLD,
        max_misses: int = DEFAULT_MAX_MISSES,
    ) -> None:
        self._iou_threshold = iou_threshold
        self._max_misses = max_misses
        self._tracks: list[_Track] = []
        self._next_track_id = 1

    def update(self, detections: list[Detection]) -> list[Detection]:
        """Returns a new list, same order and length as `detections`,
        each entry a copy with `trackId` populated. Does not mutate
        `detections`.
        """
        candidate_pairs: list[tuple[float, int, int]] = []
        for track_index, track in enumerate(self._tracks):
            for detection_index, detection in enumerate(detections):
                if detection.label != track.label:
                    continue
                iou = _iou(track.bounding_box, detection.boundingBox)
                if iou >= self._iou_threshold:
                    candidate_pairs.append((iou, track_index, detection_index))
        candidate_pairs.sort(key=lambda pair: pair[0], reverse=True)

        matched_track_indices: set[int] = set()
        detection_to_track: dict[int, int] = {}
        for _iou_value, track_index, detection_index in candidate_pairs:
            if track_index in matched_track_indices or detection_index in detection_to_track:
                continue
            matched_track_indices.add(track_index)
            detection_to_track[detection_index] = track_index

        surviving_tracks: list[_Track] = []

        # Age out tracks with no match this frame; drop after too many
        # consecutive misses.
        for track_index, track in enumerate(self._tracks):
            if track_index in matched_track_indices:
                continue
            track.misses += 1
            if track.misses <= self._max_misses:
                surviving_tracks.append(track)

        results: list[Detection] = []
        for detection_index, detection in enumerate(detections):
            matched_track_index = detection_to_track.get(detection_index)
            if matched_track_index is not None:
                track = self._tracks[matched_track_index]
                track.bounding_box = detection.boundingBox
                track.misses = 0
                surviving_tracks.append(track)
                results.append(detection.model_copy(update={"trackId": track.track_id}))
            else:
                new_track = _Track(
                    track_id=self._next_track_id,
                    label=detection.label,
                    bounding_box=detection.boundingBox,
                )
                self._next_track_id += 1
                surviving_tracks.append(new_track)
                results.append(detection.model_copy(update={"trackId": new_track.track_id}))

        self._tracks = surviving_tracks
        return results
