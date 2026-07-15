import { NotFoundException } from "@nestjs/common";
import { EdgeDevicesService } from "./edge-devices.service";
import type { EdgeDevicesRepository } from "./edge-devices.repository";
import { EdgeDeviceValidationError } from "./edge-device.types";

function makeDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: "device-1",
    deviceId: "jetson-01",
    displayName: null,
    createdById: "user-1",
    createdAt: new Date("2026-07-15T00:00:00.000Z"),
    lastSeenAt: null,
    lastSyncAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("EdgeDevicesService (REQ-9.9)", () => {
  let repository: {
    insert: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    findByDeviceId: jest.Mock;
    revoke: jest.Mock;
  };
  let service: EdgeDevicesService;

  beforeEach(() => {
    repository = {
      insert: jest
        .fn()
        .mockImplementation((input: Record<string, unknown>) =>
          Promise.resolve(makeDevice(input)),
        ),
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      findByDeviceId: jest.fn().mockResolvedValue(null),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    service = new EdgeDevicesService(
      repository as unknown as EdgeDevicesRepository,
    );
  });

  describe("register", () => {
    it("generates a plaintext token and stores only its hash", async () => {
      const { device, token } = await service.register({
        deviceId: "jetson-01",
      });

      expect(device.deviceId).toBe("jetson-01");
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: "jetson-01" }),
      );
      const insertedTokenHash = (
        repository.insert.mock.calls[0] as [{ tokenHash: string }]
      )[0].tokenHash;
      expect(insertedTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(insertedTokenHash).not.toBe(token);
    });

    it("rejects a duplicate deviceId", async () => {
      repository.findByDeviceId.mockResolvedValue(makeDevice());
      await expect(
        service.register({ deviceId: "jetson-01" }),
      ).rejects.toBeInstanceOf(EdgeDeviceValidationError);
      expect(repository.insert).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("404s for an unknown device", async () => {
      await expect(service.getById("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("revoke", () => {
    it("revokes an existing device and returns the updated record", async () => {
      repository.findById
        .mockResolvedValueOnce(makeDevice({ revokedAt: null }))
        .mockResolvedValueOnce(makeDevice({ revokedAt: new Date() }));

      const result = await service.revoke("device-1");

      expect(repository.revoke).toHaveBeenCalledWith("device-1");
      expect(result.revokedAt).not.toBeNull();
    });

    it("404s revoking an unknown device", async () => {
      await expect(service.revoke("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.revoke).not.toHaveBeenCalled();
    });
  });
});
