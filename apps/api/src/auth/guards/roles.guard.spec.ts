import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";
import { ROLE_NAMES } from "../../roles/roles.constants";
import type { AuthenticatedUser } from "../auth.types";

function makeContext(user: AuthenticatedUser | undefined): ExecutionContext {
  const fakeContext = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return fakeContext as unknown as ExecutionContext;
}

describe("RolesGuard (REQ-2.5/2.13)", () => {
  const operatorUser: AuthenticatedUser = {
    userId: "user-1",
    email: "op@example.com",
    roles: [ROLE_NAMES.OPERATOR],
  };

  function makeGuard(requiredRoles: string[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
    };
    return new RolesGuard(reflector as unknown as Reflector);
  }

  it("passes unauthenticated-metadata routes (no @Roles decorator) through", () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext(operatorUser))).toBe(true);
  });

  it("passes when the user has one of the required roles", () => {
    const guard = makeGuard([ROLE_NAMES.OPERATOR, ROLE_NAMES.ADMIN]);
    expect(guard.canActivate(makeContext(operatorUser))).toBe(true);
  });

  it("throws ForbiddenException when the user lacks every required role", () => {
    const guard = makeGuard([ROLE_NAMES.ADMIN]);
    expect(() => guard.canActivate(makeContext(operatorUser))).toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException when there's no user on the request at all", () => {
    const guard = makeGuard([ROLE_NAMES.OPERATOR]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
