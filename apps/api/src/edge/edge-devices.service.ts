import { randomBytes, createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { EdgeDevicesRepository } from "./edge-devices.repository";
import {
  EdgeDeviceValidationError,
  type EdgeDeviceRecord,
  type RegisterDeviceInput,
} from "./edge-device.types";

/** Bytes of entropy in a generated device token before hex-encoding — 256 bits, the same order of magnitude this platform's JWT signing secret is expected to be. */
const DEVICE_TOKEN_BYTES = 32;

/**
 * PRD-Phase-9 (docs/mvp-plan/PRD-Phase-9.md) REQ-9.9,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md: device
 * registration and lifecycle. `register()` is the only place a device's
 * bearer token is ever generated or visible in plaintext — the response
 * carries it once; `EdgeDevicesRepository` stores only its SHA-256 hash.
 */
@Injectable()
export class EdgeDevicesService {
  constructor(private readonly edgeDevicesRepository: EdgeDevicesRepository) {}

  /** @returns the new device record plus its plaintext bearer token — the only time this token is ever available again. */
  async register(
    input: RegisterDeviceInput,
  ): Promise<{ device: EdgeDeviceRecord; token: string }> {
    const existing = await this.edgeDevicesRepository.findByDeviceId(
      input.deviceId,
    );
    if (existing) {
      throw new EdgeDeviceValidationError(
        `a device with deviceId ${input.deviceId} is already registered`,
      );
    }

    const token = randomBytes(DEVICE_TOKEN_BYTES).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const device = await this.edgeDevicesRepository.insert({
      ...input,
      tokenHash,
    });
    return { device, token };
  }

  listAll(): Promise<EdgeDeviceRecord[]> {
    return this.edgeDevicesRepository.findAll();
  }

  async getById(id: string): Promise<EdgeDeviceRecord> {
    const device = await this.edgeDevicesRepository.findById(id);
    if (!device) {
      throw new NotFoundException(`edge device ${id} not found`);
    }
    return device;
  }

  /** REQ-9.9: the only supported way to invalidate a device's access — there is no token rotation in this phase (see ADR-011's Consequences). */
  async revoke(id: string): Promise<EdgeDeviceRecord> {
    await this.getById(id);
    await this.edgeDevicesRepository.revoke(id);
    return this.getById(id);
  }
}
