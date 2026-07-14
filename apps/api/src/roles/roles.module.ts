import { Module } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { RolesRepository } from "./roles.repository";

@Module({
  providers: [RolesService, RolesRepository],
  exports: [RolesService],
})
export class RolesModule {}
