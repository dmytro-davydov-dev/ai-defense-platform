import { EVENT_TYPES } from "@ai-defense/event-schemas";
import { EdgeEventsService } from "./edge-events.service";
import type { ProcessedEventsRepository } from "../processed-events/processed-events.repository";
import type { OutboxRepository } from "../outbox/outbox.repository";
import type { EdgeDevicesRepository } from "./edge-devices.repository";
import { UnsupportedEdgeEventTypeError } from "./edge-event.types";

const DEVICE = { id: "device-1", deviceId: "jetson-01" };

function makeHealthEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "11111111-1111-1111-1111-111111111111",
    eventType: EVENT_TYPES.DEVICE_HEALTH_REPORTED,
    occurredAt: "2026-07-15T00:00:00.000Z",
    payload: {
      deviceId: "jetson-01",
      reportedAt: "2026-07-15T00:00:00.000Z",
      bufferDepth: 3,
      lastSyncAt: null,
      uptimeSeconds: 120,
      status: "ok",
    },
    ...overrides,
  };
}

describe("EdgeEventsService (REQ-9.6/9.7/9.10/9.11)", () => {
  let processedEventsRepository: { markProcessed: jest.Mock };
  let outboxRepository: { insert: jest.Mock };
  let edgeDevicesRepository: { touchSync: jest.Mock };
  let service: EdgeEventsService;

  beforeEach(() => {
    processedEventsRepository = {
      markProcessed: jest.fn().mockResolvedValue(true),
    };
    outboxRepository = {
      insert: jest.fn().mockResolvedValue("outbox-event-id"),
    };
    edgeDevicesRepository = {
      touchSync: jest.fn().mockResolvedValue(undefined),
    };

    service = new EdgeEventsService(
      processedEventsRepository as unknown as ProcessedEventsRepository,
      outboxRepository as unknown as OutboxRepository,
      edgeDevicesRepository as unknown as EdgeDevicesRepository,
    );
  });

  it("accepts a new event, writes one outbox row, and touches device sync", async () => {
    const result = await service.ingest(DEVICE, [makeHealthEvent()], "corr-1");

    expect(result).toEqual({ accepted: 1, duplicates: 0 });
    expect(outboxRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: "edge_device",
        aggregateId: "jetson-01",
        eventType: EVENT_TYPES.DEVICE_HEALTH_REPORTED,
        correlationId: "corr-1",
        causationId: null,
      }),
    );
    expect(edgeDevicesRepository.touchSync).toHaveBeenCalledWith("device-1");
  });

  it("REQ-9.7: a redelivered eventId is counted as a duplicate and writes no outbox row", async () => {
    processedEventsRepository.markProcessed.mockResolvedValue(false);

    const result = await service.ingest(DEVICE, [makeHealthEvent()], undefined);

    expect(result).toEqual({ accepted: 0, duplicates: 1 });
    expect(outboxRepository.insert).not.toHaveBeenCalled();
    // Still touches sync — a device that only redelivers already-seen
    // events was still seen and still synced just now.
    expect(edgeDevicesRepository.touchSync).toHaveBeenCalledWith("device-1");
  });

  it("handles a mixed batch of new and duplicate events", async () => {
    processedEventsRepository.markProcessed
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await service.ingest(
      DEVICE,
      [
        makeHealthEvent({ eventId: "11111111-1111-1111-1111-111111111111" }),
        makeHealthEvent({ eventId: "22222222-2222-2222-2222-222222222222" }),
      ],
      undefined,
    );

    expect(result).toEqual({ accepted: 1, duplicates: 1 });
    expect(outboxRepository.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported eventType before writing anything", async () => {
    await expect(
      service.ingest(
        DEVICE,
        [makeHealthEvent({ eventType: "EDGE_DETECTION_PUBLISHED" })],
        undefined,
      ),
    ).rejects.toBeInstanceOf(UnsupportedEdgeEventTypeError);

    expect(processedEventsRepository.markProcessed).not.toHaveBeenCalled();
    expect(outboxRepository.insert).not.toHaveBeenCalled();
  });
});
