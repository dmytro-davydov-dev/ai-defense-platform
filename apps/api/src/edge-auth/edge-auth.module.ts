import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DeviceAuthGuard } from "./device-auth.guard";
import { JwtOrDeviceAuthGuard } from "./jwt-or-device-auth.guard";

/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md): the guards an
 * edge device authenticates with, kept in their own small module (same
 * shape as `OutboxModule`/`ProcessedEventsModule` — no controller) so
 * `StorageModule`/`ModelRegistryModule` can import just the guard
 * surface without pulling in the rest of `EdgeModule`'s device-registry/
 * event-ingestion machinery, and so `EdgeModule` itself can import it
 * for `POST /edge/events`'s `DeviceAuthGuard`.
 *
 * `AuthModule` is re-exported (not just imported) because
 * `JwtOrDeviceAuthGuard`'s constructor genuinely depends on the
 * `JwtAuthGuard` token — unlike `JwtAuthGuard`/`RolesGuard` themselves,
 * which Nest can instantiate anywhere they're referenced via
 * `@UseGuards()` (no/framework-global constructor deps), a guard with a
 * real dependency needs that dependency's owning module reachable from
 * *its consumer's* import graph, not just this module's own. Without
 * this, `StorageModule`/`ModelRegistryModule` (which only import
 * `EdgeAuthModule`, not `AuthModule` directly) fail to construct
 * `JwtOrDeviceAuthGuard` with `UnknownDependenciesException` — see
 * https://docs.nestjs.com/faq/common-errors.
 */
@Module({
  imports: [AuthModule],
  providers: [DeviceAuthGuard, JwtOrDeviceAuthGuard],
  exports: [AuthModule, DeviceAuthGuard, JwtOrDeviceAuthGuard],
})
export class EdgeAuthModule {}
