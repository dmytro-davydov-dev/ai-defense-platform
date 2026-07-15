import { handleDetectionMessage } from "./detections.handler";

function envelopeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    eventId: "event-1",
    eventType: "DETECTION_PUBLISHED",
    eventVersion: 1,
    occurredAt: "2026-01-01T00:00:00Z",
    correlationId: "corr-1",
    causationId: "cause-1",
    producer: "vision-service",
    payload: {
      missionId: "mission-1",
      frameIndex: 3,
      frameTimestampMs: 750,
      trackId: 7,
      label: "person",
      confidence: 0.91,
      boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    },
    ...overrides,
  });
}

describe("handleDetectionMessage (REQ-6.1)", () => {
  let detectionsService: { record: jest.Mock };
  let processedEventsRepository: { markProcessed: jest.Mock };
  let dlqProducer: { send: jest.Mock };
  let realtimePublisher: { publishMissionEvent: jest.Mock };

  beforeEach(() => {
    detectionsService = { record: jest.fn().mockResolvedValue(undefined) };
    processedEventsRepository = {
      markProcessed: jest.fn().mockResolvedValue(true),
    };
    dlqProducer = { send: jest.fn().mockResolvedValue(undefined) };
    realtimePublisher = { publishMissionEvent: jest.fn() };
  });

  it("persists the detection and records it as processed under its own consumer name", async () => {
    await handleDetectionMessage(envelopeJson(), {
      detectionsService,
      processedEventsRepository,
      dlqProducer,
      realtimePublisher,
    });

    expect(processedEventsRepository.markProcessed).toHaveBeenCalledWith(
      "event-1",
      "api-detections",
    );
    expect(detectionsService.record).toHaveBeenCalledWith({
      missionId: "mission-1",
      frameIndex: 3,
      frameTimestampMs: 750,
      trackId: 7,
      label: "person",
      confidence: 0.91,
      boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    });
    expect(dlqProducer.send).not.toHaveBeenCalled();
  });

  it("relays a successfully-persisted detection to the real-time publisher (REQ-6.5)", async () => {
    await handleDetectionMessage(envelopeJson(), {
      detectionsService,
      processedEventsRepository,
      dlqProducer,
      realtimePublisher,
    });

    expect(realtimePublisher.publishMissionEvent).toHaveBeenCalledWith(
      "mission-1",
      {
        eventType: "DETECTION_PUBLISHED",
        payload: expect.objectContaining({ trackId: 7 }),
      },
    );
  });

  it("works without a real-time publisher configured", async () => {
    await expect(
      handleDetectionMessage(envelopeJson(), {
        detectionsService,
        processedEventsRepository,
        dlqProducer,
      }),
    ).resolves.toBeUndefined();
  });

  it("skips persistence entirely for a duplicate delivery (REQ-3.8-style idempotency)", async () => {
    processedEventsRepository.markProcessed.mockResolvedValue(false);

    await handleDetectionMessage(envelopeJson(), {
      detectionsService,
      processedEventsRepository,
      dlqProducer,
      realtimePublisher,
    });

    expect(detectionsService.record).not.toHaveBeenCalled();
    expect(realtimePublisher.publishMissionEvent).not.toHaveBeenCalled();
  });

  it("skips unknown eventTypes without recording or persisting", async () => {
    await handleDetectionMessage(
      envelopeJson({ eventType: "SOMETHING_ELSE" }),
      {
        detectionsService,
        processedEventsRepository,
        dlqProducer,
        realtimePublisher,
      },
    );

    expect(processedEventsRepository.markProcessed).not.toHaveBeenCalled();
    expect(detectionsService.record).not.toHaveBeenCalled();
  });

  it("dead-letters after exhausting retries and never relays in real time", async () => {
    detectionsService.record.mockRejectedValue(new Error("db down"));

    await handleDetectionMessage(envelopeJson(), {
      detectionsService,
      processedEventsRepository,
      dlqProducer,
      realtimePublisher,
    });

    expect(detectionsService.record).toHaveBeenCalledTimes(3);
    expect(realtimePublisher.publishMissionEvent).not.toHaveBeenCalled();
    expect(dlqProducer.send).toHaveBeenCalledTimes(1);
    const calls = dlqProducer.send.mock.calls as [
      { topic: string; messages: { key: string; value: string }[] },
    ][];
    const call = calls[0];
    if (!call) {
      throw new Error("expected dlqProducer.send to have been called");
    }
    expect(call[0].topic).toBe("aidefense.dead-letter");
    expect(call[0].messages[0]?.key).toBe("mission-1");
    const dlqPayload = JSON.parse(call[0].messages[0]?.value ?? "{}") as {
      causationId: string;
      payload: { attempts: number; topic: string };
    };
    expect(dlqPayload.causationId).toBe("event-1");
    expect(dlqPayload.payload.attempts).toBe(3);
    expect(dlqPayload.payload.topic).toBe("aidefense.detections");
  });
});
