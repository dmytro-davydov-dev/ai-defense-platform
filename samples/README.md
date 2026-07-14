# Samples

Small, synthetic, deterministic fixtures used by test suites — none of
these are real footage or licensed third-party content, per
[`docs/architecture/Repository_Structure.md`](../docs/architecture/Repository_Structure.md)'s
"datasets and model binaries are not committed unless explicitly
licensed and small" rule. Both files here are generated in-repo (see
below), not sourced externally, so there is no license to track beyond
this repository's own.

## `sample-mission-clip.mp4`

Used by `apps/vision-service`'s Phase 4 (REQ-4.2/4.6/4.12) tests —
video reader, metadata extraction, and the `commands_consumer.py`
integration test.

- 64x48 pixels, 4 fps, 12 frames (3 seconds), `mp4v` codec.
- Each frame is a flat BGR color, `value = (frame_index * 20) % 256`
  for all three channels — fully deterministic, no camera/real-world
  content.
- Regenerate with `apps/vision-service/scripts/generate_samples.py`.

## `sample-frame.png`

Used by the image-reader test (REQ-4.3).

- 64x48 pixels.
- Deterministic per-pixel gradient: `(x % 256, y % 256, (x + y) % 256)`
  in BGR — again no real-world content.
- Regenerate with `apps/vision-service/scripts/generate_samples.py`.
