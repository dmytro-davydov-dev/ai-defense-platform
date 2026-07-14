import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./users.repository";
import type { CreateUserInput, UserRecord } from "./user.types";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.usersRepository.findByEmail(email);
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.usersRepository.findById(id);
  }

  createUser(input: CreateUserInput): Promise<UserRecord> {
    return this.usersRepository.create(input);
  }
}
