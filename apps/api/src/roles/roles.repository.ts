import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { RoleName } from "./roles.constants";

@Injectable()
export class RolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent — safe to call on every boot (mirrors StorageService.ensureBucketExists). */
  async upsertByName(name: RoleName) {
    return this.prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  async findByNames(names: readonly RoleName[]) {
    return this.prisma.role.findMany({ where: { name: { in: [...names] } } });
  }
}
