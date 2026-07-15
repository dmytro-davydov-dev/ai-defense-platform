import { Injectable } from "@nestjs/common";
import { TelemetryRepository } from "./telemetry.repository";
import { parseTelemetryFile } from "./telemetry-parser";
import type { TelemetryRecord } from "./telemetry.types";

/**
 * REQ-7.2/7.3: thin application service over `TelemetryRepository` and
 * the CSV/GeoJSON parser, per Coding_Standards.md's "application
 * services orchestrate use cases" — `MissionsController` depends on
 * this stable interface, never the repository or parser directly.
 */
@Injectable()
export class TelemetryService {
  constructor(private readonly telemetryRepository: TelemetryRepository) {}

  /**
   * Parses and persists an uploaded telemetry file for a mission.
   * `TelemetryParseError` (malformed rows, out-of-order timestamps) is
   * left to propagate — `MissionsController` maps it to a 400, the same
   * "let the domain-specific error surface, translate at the
   * controller boundary" pattern `MissionsService.transition()` uses
   * for illegal state transitions.
   */
  async ingest(
    missionId: string,
    rawText: string,
  ): Promise<{ pointCount: number }> {
    const points = parseTelemetryFile(rawText);
    await this.telemetryRepository.insertMany(
      points.map((point) => ({ ...point, missionId })),
    );
    return { pointCount: points.length };
  }

  listForMission(missionId: string): Promise<TelemetryRecord[]> {
    return this.telemetryRepository.findByMissionId(missionId);
  }
}
