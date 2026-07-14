import { AuditService } from "./audit.service";
import type { AuditRepository } from "./audit.repository";

describe("AuditService (REQ-2.10/2.13)", () => {
  it("delegates to the repository, passing through an explicit transaction executor when given", async () => {
    const repository = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as unknown as AuditRepository);

    const input = {
      actorUserId: "user-1",
      action: "mission.created",
      targetType: "mission",
    };
    const fakeTx = { marker: "tx" };

    await service.record(input, fakeTx as never);

    expect(repository.create).toHaveBeenCalledWith(input, fakeTx);
  });

  it("delegates without an executor for standalone events", async () => {
    const repository = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new AuditService(repository as unknown as AuditRepository);

    const input = { action: "auth.login_failed", targetType: "user" };
    await service.record(input);

    expect(repository.create).toHaveBeenCalledWith(input, undefined);
  });
});
