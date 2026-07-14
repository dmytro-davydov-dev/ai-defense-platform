import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ROLE_NAMES } from "../roles/roles.constants";
import type { CreateUserInput, UserRecord } from "../users/user.types";
import type { RecordAuditInput } from "../audit/audit.types";

describe("AuthService (REQ-2.4/2.6/2.13)", () => {
  let usersService: {
    findByEmail: jest.Mock<Promise<UserRecord | null>, [string]>;
    createUser: jest.Mock<Promise<UserRecord>, [CreateUserInput]>;
  };
  let rolesService: {
    getIdsByNames: jest.Mock<Promise<string[]>, [readonly string[]]>;
  };
  let auditService: { record: jest.Mock<Promise<void>, [RecordAuditInput]> };
  let jwtService: { sign: jest.Mock<string, [unknown]> };
  let service: AuthService;

  const existingUser: UserRecord = {
    id: "user-1",
    email: "operator@example.com",
    passwordHash: "",
    displayName: "Jane Operator",
    roles: [ROLE_NAMES.OPERATOR],
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn<Promise<UserRecord | null>, [string]>(),
      createUser: jest.fn<Promise<UserRecord>, [CreateUserInput]>(),
    };
    rolesService = {
      getIdsByNames: jest
        .fn<Promise<string[]>, [readonly string[]]>()
        .mockResolvedValue(["role-operator-id"]),
    };
    auditService = {
      record: jest
        .fn<Promise<void>, [RecordAuditInput]>()
        .mockResolvedValue(undefined),
    };
    jwtService = {
      sign: jest.fn<string, [unknown]>().mockReturnValue("signed.jwt.token"),
    };

    service = new AuthService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      usersService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rolesService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      auditService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jwtService as any,
    );

    existingUser.passwordHash = await service.hashPassword("correct-password");
  });

  describe("hashPassword/verifyPassword", () => {
    it("verifies a matching password and rejects a wrong one", async () => {
      const hash = await service.hashPassword("s3cret!");
      await expect(service.verifyPassword("s3cret!", hash)).resolves.toBe(true);
      await expect(service.verifyPassword("wrong", hash)).resolves.toBe(false);
    });
  });

  describe("register", () => {
    it("rejects a duplicate email without creating a user", async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      await expect(
        service.register({
          email: existingUser.email,
          password: "whatever123",
          displayName: "Someone",
        }),
      ).rejects.toThrow(ConflictException);

      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it("creates the user with a hashed password and the operator role, and issues a token", async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue({
        ...existingUser,
        id: "new-user",
      });

      const result = await service.register({
        email: "new@example.com",
        password: "whatever123",
        displayName: "New User",
      });

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@example.com",
          displayName: "New User",
          roleIds: ["role-operator-id"],
        }),
      );
      const createArgs = usersService.createUser.mock.calls[0]?.[0];
      if (!createArgs) {
        throw new Error("createUser was not called");
      }
      expect(createArgs.passwordHash).not.toBe("whatever123");

      expect(result.accessToken).toBe("signed.jwt.token");
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.register" }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.token_issued" }),
      );
    });
  });

  describe("login", () => {
    it("rejects and audits when the email doesn't exist, without leaking which check failed", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@example.com", password: "whatever" }),
      ).rejects.toThrow(UnauthorizedException);

      const call = auditService.record.mock.calls[0]?.[0];
      if (!call) {
        throw new Error("record was not called");
      }
      expect(call.action).toBe("auth.login_failed");
      expect(call.actorUserId).toBeUndefined();
    });

    it("rejects and audits on a wrong password", async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      await expect(
        service.login({
          email: existingUser.email,
          password: "wrong-password",
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.login_failed",
          actorUserId: existingUser.id,
        }),
      );
    });

    it("issues a token and audits login_success + token_issued on valid credentials", async () => {
      usersService.findByEmail.mockResolvedValue(existingUser);

      const result = await service.login({
        email: existingUser.email,
        password: "correct-password",
      });

      expect(result.accessToken).toBe("signed.jwt.token");
      expect(result.user.email).toBe(existingUser.email);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.login_success" }),
      );
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "auth.token_issued" }),
      );
    });
  });
});
