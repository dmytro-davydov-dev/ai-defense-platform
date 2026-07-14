"""REQ-4.1/4.2/4.3: OpenCV-based video/image I/O — new for Phase 4
(docs/mvp-plan/PRD-Phase-4.md). See `reader.py` (video) and
`image_reader.py` (single images) — both feed the same downstream
`vision_service.frames`/`vision_service.annotation` utilities so the
pipeline isn't video-only from day one.
"""
