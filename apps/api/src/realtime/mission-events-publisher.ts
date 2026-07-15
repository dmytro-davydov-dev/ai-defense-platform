/**
 * REQ-6.5: the narrow surface both Kafka consumer handlers
 * (processing-events.handler.ts, detections.handler.ts) depend on to
 * relay a successfully-processed event to any browser client
 * subscribed to that mission's real-time channel. Kept as its own
 * interface — not a direct import of `MissionEventsGateway` — so:
 *
 * - handler unit tests can pass a plain `{ publishMissionEvent: jest.fn() }`
 *   mock, the same pattern `KafkaProducerLike` already established for
 *   `dlqProducer`;
 * - `KafkaModule` depends on this type, not on `RealtimeModule`'s
 *   Socket.IO wiring, keeping the Kafka-consumption code free of any
 *   transport-specific detail (Coding_Standards.md: "dependency
 *   inversion for infrastructure adapters").
 *
 * A missing/undefined publisher (e.g. in a test that doesn't care about
 * real-time relay) is always safe to skip — callers use
 * `deps.realtimePublisher?.publishMissionEvent(...)`.
 */
export interface MissionEventsPublisherLike {
  publishMissionEvent(missionId: string, event: RealtimeMissionEvent): void;
}

/**
 * DI token for `MissionEventsPublisherLike` — an interface has no
 * runtime representation, so NestJS needs an explicit token to inject
 * it. `RealtimeModule` binds this token to the real
 * `MissionEventsGateway`; anything that depends on it (currently
 * `DetectionsConsumerService`, `ProcessingEventsConsumerService`)
 * injects it with `@Optional() @Inject(MISSION_EVENTS_PUBLISHER)` so it
 * still boots cleanly if `RealtimeModule` isn't wired in (e.g. a future
 * standalone test module).
 */
export const MISSION_EVENTS_PUBLISHER = Symbol("MISSION_EVENTS_PUBLISHER");

/** The envelope shape relayed to a subscribed browser client, kept intentionally thin — just enough for the frontend to update UI state without re-deriving it from a REST read. */
export interface RealtimeMissionEvent {
  readonly eventType: string;
  readonly payload: unknown;
}
