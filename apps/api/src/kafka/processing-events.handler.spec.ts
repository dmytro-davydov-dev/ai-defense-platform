import { MissionStatus } from "../../generated/prisma/client";
import { handleProcessingEventMessage } from "./processing-events.handler";

function envelopeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    eventId: "event-1",
    eventType: "PROCESSING_STARTED",
    eventVersion: 1,
    occurredAt: "2026-01-01T00:00:00Z",
    correlationId: "corr-1",
    causationId: null,
    producer: "vision-service",
    payload: { missionId: "mission-1" },
    ...overrides,
  });
}

describe("handleProcessingEventMessage (REQ-3.8/3.9/3.14)", () => {
  let missionsService: { transition: jest.Mock };
  let processedEventsRepository: { markProcessed: jest.Mock };
  let dlqProducer: { send: jest.Mock };

  beforeEach(() => {
    missionsService = { transition: jest.fn().mockResolvedValue(undefined) };
    processedEventsRepository = {
      markProcessed: jest.fn().mockResolvedValue(true),
    };
    dlqProducer = { send: jest.fn().mockResolvedValue(undefined) };
  });

  it("transitions the mission to the mapped status and records the event as processed", async () => {
    await handleProcessingEventMessage(envelopeJson(), {
      missionsService: missionsService,
      processedEventsRepository: processedEventsRepository,
      dlqProducer: dlqProducer,
    });

    expect(processedEventsRepository.markProcessed).toHaveBeenCalledWith(
      "event-1",
      "api",
    );
    expect(missionsService.transition).toHaveBeenCalledWith(
      "mission-1",
      MissionStatus.PROCESSING,
      { correlationId: "corr-1" },
    );
    expect(dlqProducer.send).not.toHaveBeenCalled();
  });

  it("maps PROCESSING_COMPLETED/PROCESSING_FAILED to COMPLETED/FAILED", async () => {
    await handleProcessingEventMessage(
      envelopeJson({ eventType: "PROCESSING_COMPLETED" }),
      {
        missionsService: missionsService,
        processedEventsRepository: processedEventsRepository,
        dlqProducer: dlqProducer,
      },
    );
    expect(missionsService.transition).toHaveBeenCalledWith(
      "mission-1",
      MissionStatus.COMPLETED,
      expect.anything(),
    );

    await handleProcessingEventMessage(
      envelopeJson({ eventId: "event-2", eventType: "PROCESSING_FAILED" }),
      {
        missionsService: missionsService,
        processedEventsRepository: processedEventsRepository,
        dlqProducer: dlqProducer,
      },
    );
    expect(missionsService.transition).toHaveBeenCalledWith(
      "mission-1",
      MissionStatus.FAILED,
      expect.anything(),
    );
  });

  it("skips the transition entirely for a duplicate delivery (REQ-3.8)", async () => {
    processedEventsRepository.markProcessed.mockResolvedValue(false);

    await handleProcessingEventMessage(envelopeJson(), {
      missionsService: missionsService,
      processedEventsRepository: processedEventsRepository,
      dlqProducer: dlqProducer,
    });

    expect(missionsService.transition).not.toHaveBeenCalled();
  });

  it("skips unknown eventTypes without recording or transitioning", async () => {
    await handleProcessingEventMessage(
      envelopeJson({ eventType: "SOMETHING_ELSE" }),
      {
        missionsService: missionsService,
        processedEventsRepository: processedEventsRepository,
        dlqProducer: dlqProducer,
      },
    );

    expect(processedEventsRepository.markProcessed).not.toHaveBeenCalled();
    expect(missionsService.transition).not.toHaveBeenCalled();
  });

  it("dead-letters after exhausting retries (REQ-3.9/3.10)", async () => {
    missionsService.transition.mockRejectedValue(new Error("db down"));

    await handleProcessingEventMessage(envelopeJson(), {
      missionsService: missionsService,
      processedEventsRepository: processedEventsRepository,
      dlqProducer: dlqProducer,
    });

    expect(missionsService.transition).toHaveBeenCalledTimes(3);
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
    expect(dlqPayload.payload.topic).toBe("aidefense.processing-events");
  });
});
