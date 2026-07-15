import { Injectable } from "@nestjs/common";
import { DetectionsRepository } from "./detections.repository";
import type { DetectionRecord, InsertDetectionInput } from "./detection.types";

/**
 * REQ-6.1/6.2: thin application service over `DetectionsRepository`, per
 * Coding_Standards.md's "application services orchestrate use cases" —
 * `DetectionsController`/`MissionsController` and
 * `detections.handler.ts` depend on this stable interface, never the
 * repository directly.
 */
@Injectable()
export class DetectionsService {
  constructor(private readonly detectionsRepository: DetectionsRepository) {}

  record(input: InsertDetectionInput): Promise<void> {
    return this.detectionsRepository.insert(input);
  }

  listForMission(missionId: string): Promise<DetectionRecord[]> {
    return this.detectionsRepository.findByMissionId(missionId);
  }
}
