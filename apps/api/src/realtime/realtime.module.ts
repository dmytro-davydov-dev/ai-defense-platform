import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import {
  getJwtExpiresInSeconds,
  getRequiredJwtSecret,
} from "../auth/jwt-expiry.util";
import { MissionEventsGateway } from "./mission-events.gateway";
import { MISSION_EVENTS_PUBLISHER } from "./mission-events-publisher";

/**
 * REQ-6.5: binds the real `MissionEventsGateway` to the
 * `MISSION_EVENTS_PUBLISHER` token so `KafkaModule`'s consumer services
 * can depend on the narrow `MissionEventsPublisherLike` interface
 * instead of this module's Socket.IO-specific implementation.
 *
 * Registers its own `JwtModule` (same `JWT_SECRET`/`JWT_EXPIRES_IN`
 * source as `AuthModule`, REQ-2.4) rather than importing `AuthModule`
 * itself — the gateway only ever verifies tokens, never issues them, so
 * it doesn't need `AuthModule`'s full Users/Roles/Audit dependency graph.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getRequiredJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresInSeconds() },
    }),
  ],
  providers: [
    MissionEventsGateway,
    { provide: MISSION_EVENTS_PUBLISHER, useExisting: MissionEventsGateway },
  ],
  exports: [MissionEventsGateway, MISSION_EVENTS_PUBLISHER],
})
export class RealtimeModule {}
