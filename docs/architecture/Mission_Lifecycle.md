---
title: Mission Lifecycle
type: architecture
tags: [architecture, backend, frontend, phase2, phase5, phase6]
status: active
---

# Mission Lifecycle

A companion, operator-facing read of [[Mission_State_Machine]]: what a
mission's states actually mean end to end, and how the `apps/web` UI
represents state that is *not* part of the state machine (connection
status, which video artifact is on screen) — a distinction that's easy
to blur from the UI alone.

## The state machine (source of truth)

```text
DRAFT ──────▶ QUEUED ──────▶ PROCESSING ──┬──▶ COMPLETED
                                            └──▶ FAILED
```

Enforced server-side in `MissionService.transition()`
(`apps/api`) — never a free-text status column. Full state-by-state
meaning, legal transitions, and the "why not a DB constraint" rationale
live in [[Mission_State_Machine]]; this note only summarizes:

| State        | Meaning                                                            |
| ------------ | ------------------------------------------------------------------- |
| `DRAFT`      | Created, metadata editable, no video yet or upload in progress.    |
| `QUEUED`     | Operator submitted for processing.                                 |
| `PROCESSING` | Vision worker has started (Phase 4 consumer callback).             |
| `COMPLETED`  | Processing finished; detections/artifacts exist (Phase 4/5).       |
| `FAILED`     | Processing failed; `FAILED → QUEUED` resubmission is allowed.      |

## The "Mark ..." transition buttons

`apps/web/src/features/missions/TransitionControls.tsx` renders one
button per **legal** transition from the mission's current state,
mirroring the same table `apps/api` enforces
(`missionStateMachine.ts`, REQ-6.10):

| Target state | Button label            |
| ------------- | ------------------------ |
| `DRAFT`       | Reset to draft          |
| `QUEUED`      | Submit for processing   |
| `PROCESSING`  | Mark processing         |
| `COMPLETED`   | Mark completed          |
| `FAILED`      | Mark failed             |

Only `DRAFT → QUEUED` ("Submit for processing") is meant to be clicked
by an operator in normal use. The `PROCESSING`/`COMPLETED`/`FAILED`
buttons exist because the Kafka consumer that should drive those
transitions automatically (Phase 3/4) isn't wired up end to end yet —
they're manual stand-ins for a system event, not a workflow step an
operator is expected to perform. None of these buttons carries a phase
suffix in its label.

## UI state that is *not* mission state

Two pieces of the mission detail page look like lifecycle state but
aren't — they don't touch `MissionService.transition()` at all.

**"Live" / "Reconnecting…" badge** — next to the status chip on
`MissionDetailPage.tsx`. Reflects whether the browser's WebSocket
(`useMissionSocket`, joining `apps/api`'s `MissionEventsGateway`,
REQ-6.5) is currently connected — purely a socket-connectivity
indicator, unrelated to the mission's `status` field.

**"Live overlay" vs. "Pre-annotated (Phase 5)"** — a toggle in
`features/video/VideoPlayerWithOverlay.tsx` choosing which video is on
screen, not which processing stage the mission is in:

- *Live overlay* (`value="raw"`) plays the raw uploaded video with
  detection boxes drawn dynamically on a `<canvas>` in real time.
- *Pre-annotated* plays a separate artifact
  (`missions/{id}/annotated.mp4`) that Phase 5's vision pipeline
  (`storage/minio_client.py`) already baked detection boxes into,
  frame by frame — see [[Detection_And_Tracking]].

The "(Phase 5)" in the button's label is a citation to the roadmap
phase that produces that artifact, not a lifecycle marker — it tells
the operator which pipeline stage generated what they're looking at.
Drawing overlay boxes on top of the pre-annotated video would double
them up, which is why the toggle is exclusive (`ToggleButtonGroup`).

## Summary

The mission's real workflow position is always one of the five
`Mission_State_Machine` states. "Live" and "(Phase 5)" are UI labels
about connection status and video-artifact provenance respectively —
useful context, but orthogonal to lifecycle state.

---

## Related Notes

- [[Mission_State_Machine]] — the authoritative state machine this note summarizes and builds on.
- [[Web_Shell]] — the `apps/web` implementation these UI elements live in.
- [[Detection_And_Tracking]] — Phase 5's detect/track/publish pipeline that produces the annotated video artifact.
- [[PRD-Phase-2]] — REQ-2.2 (state machine), REQ-2.7/2.8.
- [[PRD-Phase-6]] — REQ-6.5 (real-time gateway), REQ-6.10 (transition controls).
- [[PRD-Phase-5]] — the annotated-video artifact this note references.
