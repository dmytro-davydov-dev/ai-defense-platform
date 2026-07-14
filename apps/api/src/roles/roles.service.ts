import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RolesRepository } from "./roles.repository";
import { ALL_ROLE_NAMES, type RoleName } from "./roles.constants";

/**
 * REQ-2.5. Seeds `operator`/`admin` on every boot (idempotent upsert) so
 * a fresh database always has both roles available for registration —
 * no separate manual seed step required, same reasoning as
 * StorageService's on-startup bucket creation (REQ-2.9).
 */
@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly rolesRepository: RolesRepository) {}

  async onModuleInit(): Promise<void> {
    await Promise.all(
      ALL_ROLE_NAMES.map((name) => this.rolesRepository.upsertByName(name)),
    );
    this.logger.log(`Seeded roles: ${ALL_ROLE_NAMES.join(", ")}`);
  }

  async getIdsByNames(names: readonly RoleName[]): Promise<string[]> {
    const roles = await this.rolesRepository.findByNames(names);
    return roles.map((role) => role.id);
  }
}
