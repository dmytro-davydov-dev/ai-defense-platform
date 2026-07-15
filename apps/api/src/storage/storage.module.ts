import { Module } from "@nestjs/common";
import { EdgeAuthModule } from "../edge-auth/edge-auth.module";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";

@Module({
  // EdgeAuthModule: GET /storage/download-url accepts JwtOrDeviceAuthGuard
  // (Phase 9 REQ-9.13/9.15) alongside its existing JwtAuthGuard route.
  imports: [EdgeAuthModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
