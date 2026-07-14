/** Persistence-agnostic shape the rest of the app works with — never `@prisma/client` types directly outside the repository. */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  roles: string[];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  roleIds: string[];
}
