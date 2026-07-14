import { Module } from "@nestjs/common";
import { OutboxRepository } from "./outbox.repository";

/** REQ-3.6: exported for MissionsModule; no controller — nothing calls the outbox directly over HTTP. */
@Module({
  providers: [OutboxRepository],
  exports: [OutboxRepository],
})
export class OutboxModule {}
