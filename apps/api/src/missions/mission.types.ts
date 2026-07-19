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
  // Orthogonal to `status`/`deletedAt` — see schema.prisma's comment on
  // `Mission.archivedAt`. `null` means active/visible in the default
  // list. Deliberately not present on `CreateMissionInput`/
  // `UpdateMissionMetadataInput` below: it's never set at creation and
  // never touched by a metadata edit, only by
  // `MissionsRepository.archive()`/`unarchive()`.
  archivedAt: Date | null;
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
