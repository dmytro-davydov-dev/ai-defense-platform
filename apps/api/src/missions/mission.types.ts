import type { MissionStatus } from "../../generated/prisma/client";

export interface MissionRecord {
  id: string;
  title: string;
  description: string | null;
  status: MissionStatus;
  videoObjectKey: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMissionInput {
  title: string;
  description?: string | null | undefined;
  createdById: string;
}

export interface UpdateMissionMetadataInput {
  title?: string | undefined;
  description?: string | null | undefined;
}
