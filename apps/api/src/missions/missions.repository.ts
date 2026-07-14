import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { PrismaExecutor } from "../prisma/prisma.types";
import type { MissionStatus } from "../../generated/prisma/client";
import type {
  CreateMissionInput,
  MissionRecord,
  UpdateMissionMetadataInput,
} from "./mission.types";

/** Coding_Standards.md: "repositories hide persistence details." The only place `prisma.mission` is touched directly. */
@Injectable()
export class MissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateMissionInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        createdById: input.createdById,
      },
    });
  }

  async findById(
    id: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord | null> {
    return executor.mission.findUnique({ where: { id } });
  }

  async findAll(
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord[]> {
    return executor.mission.findMany({ orderBy: { createdAt: "desc" } });
  }

  async updateMetadata(
    id: string,
    input: UpdateMissionMetadataInput,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
    });
  }

  async updateStatus(
    id: string,
    status: MissionStatus,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({ where: { id }, data: { status } });
  }

  async setVideoObjectKey(
    id: string,
    videoObjectKey: string,
    executor: PrismaExecutor = this.prisma,
  ): Promise<MissionRecord> {
    return executor.mission.update({ where: { id }, data: { videoObjectKey } });
  }
}
