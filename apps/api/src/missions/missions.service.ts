import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MissionStatus } from "../../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MissionsRepository } from "./missions.repository";
import {
  isLegalMissionTransition,
  MISSION_ILLEGAL_TRANSITION_CODE,
} from "./mission-state-machine";
import type {
  CreateMissionInput,
  MissionRecord,
  UpdateMissionMetadataInput,
} from "./mission.types";

interface ActionContext {
  actorUserId: string;
  correlationId?: string | undefined;
}

/**
 * REQ-2.7/2.8: application service orchestrating mission use cases.
 * `transition()` is the single place status ever changes — no
 * controller or repository caller may set `status` any other way
 * (Coding_Standards.md: "domain logic separated from controllers").
 */
@Injectable()
export class MissionsService {
  constructor(
    private readonly missionsRepository: MissionsRepository,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async createMission(
    input: CreateMissionInput,
    ctx: ActionContext,
  ): Promise<MissionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const mission = await this.missionsRepository.create(input, tx);
      await this.auditService.record(
        {
          actorUserId: ctx.actorUserId,
          action: "mission.created",
          targetType: "mission",
          targetId: mission.id,
          missionId: mission.id,
          correlationId: ctx.correlationId,
        },
        tx,
      );
      return mission;
    });
  }

  async getMission(id: string): Promise<MissionRecord> {
    const mission = await this.missionsRepository.findById(id);
    if (!mission) {
      throw new NotFoundException("MISSION_NOT_FOUND");
    }
    return mission;
  }

  listMissions(): Promise<MissionRecord[]> {
    return this.missionsRepository.findAll();
  }

  async updateMetadata(
    id: string,
    input: UpdateMissionMetadataInput,
    ctx: ActionContext,
  ): Promise<MissionRecord> {
    const mission = await this.getMission(id);
    // Mission_State_Machine.md: "DRAFT: metadata editable" — every other
    // state is a snapshot of what was submitted for processing.
    if (mission.status !== MissionStatus.DRAFT) {
      throw new ConflictException("MISSION_NOT_EDITABLE");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.missionsRepository.updateMetadata(
        id,
        input,
        tx,
      );
      await this.auditService.record(
        {
          actorUserId: ctx.actorUserId,
          action: "mission.metadata_updated",
          targetType: "mission",
          targetId: id,
          missionId: id,
          correlationId: ctx.correlationId,
        },
        tx,
      );
      return updated;
    });
  }

  /**
   * Check-then-write per Mission_State_Machine.md: read the current
   * state, validate the transition, then write the new state and its
   * audit row atomically. The status is re-checked inside the
   * transaction against the value read before it started, so a
   * concurrent transition loses this one with a clear conflict instead
   * of silently clobbering it.
   */
  async transition(
    id: string,
    targetState: MissionStatus,
    ctx: ActionContext,
  ): Promise<MissionRecord> {
    const mission = await this.getMission(id);

    if (!isLegalMissionTransition(mission.status, targetState)) {
      throw new ConflictException(
        `${MISSION_ILLEGAL_TRANSITION_CODE}:${mission.status}->${targetState}`,
      );
    }
    if (
      targetState === MissionStatus.QUEUED &&
      mission.status === MissionStatus.DRAFT &&
      !mission.videoObjectKey
    ) {
      throw new ConflictException("MISSION_VIDEO_REQUIRED");
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await this.missionsRepository.findById(id, tx);
      if (!current) {
        throw new NotFoundException("MISSION_NOT_FOUND");
      }
      if (current.status !== mission.status) {
        throw new ConflictException("MISSION_STATE_CHANGED_CONCURRENTLY");
      }

      const updated = await this.missionsRepository.updateStatus(
        id,
        targetState,
        tx,
      );
      await this.auditService.record(
        {
          actorUserId: ctx.actorUserId,
          action: "mission.transition",
          targetType: "mission",
          targetId: id,
          missionId: id,
          metadata: { from: mission.status, to: targetState },
          correlationId: ctx.correlationId,
        },
        tx,
      );
      return updated;
    });
  }

  async attachVideo(
    id: string,
    videoObjectKey: string,
    ctx: ActionContext,
  ): Promise<MissionRecord> {
    const mission = await this.getMission(id);
    if (mission.status !== MissionStatus.DRAFT) {
      throw new ConflictException("MISSION_NOT_EDITABLE");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.missionsRepository.setVideoObjectKey(
        id,
        videoObjectKey,
        tx,
      );
      await this.auditService.record(
        {
          actorUserId: ctx.actorUserId,
          action: "mission.video_attached",
          targetType: "mission",
          targetId: id,
          missionId: id,
          metadata: { videoObjectKey },
          correlationId: ctx.correlationId,
        },
        tx,
      );
      return updated;
    });
  }
}
