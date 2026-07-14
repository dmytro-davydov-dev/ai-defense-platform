import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateUserInput, UserRecord } from "./user.types";

const userWithRolesInclude = {
  roles: { include: { role: true } },
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: userWithRolesInclude,
    });
    return user ? toUserRecord(user) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });
    return user ? toUserRecord(user) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        roles: {
          create: input.roleIds.map((roleId) => ({
            role: { connect: { id: roleId } },
          })),
        },
      },
      include: userWithRolesInclude,
    });
    return toUserRecord(user);
  }
}

/** Local shape of what `userWithRolesInclude` produces — avoids leaking Prisma's payload type outside this file. */
interface PrismaUserWithRoles {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  roles: { role: { name: string } }[];
}

function toUserRecord(user: PrismaUserWithRoles): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    displayName: user.displayName,
    roles: user.roles.map((userRole) => userRole.role.name),
  };
}
