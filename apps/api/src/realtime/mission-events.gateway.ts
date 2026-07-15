import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { JwtPayload } from "../auth/auth.types";
import type {
  MissionEventsPublisherLike,
  RealtimeMissionEvent,
} from "./mission-events-publisher";
import { extractBearerToken, missionRoom } from "./ws-auth.util";

/**
 * REQ-6.5: relays a mission's `aidefense.processing-events` and
 * `aidefense.detections` (already persisted/transitioned by
 * `processing-events.handler.ts`/`detections.handler.ts`) to any
 * browser client subscribed to that mission, over Socket.IO (the user's
 * chosen transport — see docs/mvp-plan/PRD-Phase-6.md Section 7/11).
 *
 * Authorization model matches every REST mission read (REQ-2.4/2.5): a
 * valid, unexpired JWT is required to keep the connection open at all,
 * but any authenticated user may subscribe to any mission ID — RBAC
 * stays the two flat roles, no per-mission ownership check, same as
 * `GET /missions/:id` (Security_Baseline.md).
 */
@WebSocketGateway({
  namespace: "/missions",
  cors: { origin: true, credentials: true },
})
export class MissionEventsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    MissionEventsPublisherLike
{
  private readonly logger = new Logger(MissionEventsGateway.name);

  @WebSocketServer()
  private server: Server | undefined;

  // Injected (RealtimeModule registers its own JwtModule.register(...),
  // same secret/config source as AuthModule) rather than constructed
  // directly, so this gateway's JWT verification is unit-testable with a
  // plain mock, the same pattern every other dependency in this codebase
  // follows.
  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = extractBearerToken(client.handshake);
    if (!token) {
      this.logger.warn(`socket ${client.id}: no JWT provided, disconnecting`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub) {
        throw new Error("AUTH_INVALID_TOKEN_PAYLOAD");
      }
      client.data.userId = payload.sub;
    } catch (error) {
      this.logger.warn(
        `socket ${client.id}: JWT verification failed (${
          error instanceof Error ? error.message : String(error)
        }), disconnecting`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`socket ${client.id} disconnected`);
  }

  /** REQ-6.12: the frontend calls this after connecting, once per mission detail view it has open. */
  @SubscribeMessage("subscribeMission")
  handleSubscribeMission(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { missionId?: string } | undefined,
  ): void {
    if (!body?.missionId) {
      return;
    }
    void client.join(missionRoom(body.missionId));
  }

  @SubscribeMessage("unsubscribeMission")
  handleUnsubscribeMission(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { missionId?: string } | undefined,
  ): void {
    if (!body?.missionId) {
      return;
    }
    void client.leave(missionRoom(body.missionId));
  }

  /**
   * `MissionEventsPublisherLike` — called by
   * `processing-events.handler.ts`/`detections.handler.ts` after a
   * successful side effect. A no-op (not a throw) if the gateway hasn't
   * finished initializing its server yet, consistent with every other
   * "best-effort, never fail the Kafka message" posture in this module.
   */
  publishMissionEvent(missionId: string, event: RealtimeMissionEvent): void {
    this.server?.to(missionRoom(missionId)).emit("missionEvent", event);
  }
}
