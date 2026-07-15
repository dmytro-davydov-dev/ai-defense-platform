/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md REQ-9.9/9.10,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md): a registered
 * edge device. Never includes the bearer credential itself or its
 * hash — those exist only in `EdgeDevicesRepository`'s insert/lookup
 * queries, never in a value returned to a caller after registration.
 */
export interface EdgeDeviceRecord {
  readonly id: string;
  readonly deviceId: string;
  readonly displayName: string | null;
  readonly createdById: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date | null;
  readonly lastSyncAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface RegisterDeviceInput {
  readonly deviceId: string;
  readonly displayName?: string | null | undefined;
  readonly createdById?: string | null | undefined;
}

/** Thrown for a validation failure the DTO layer can't express alone (e.g. a duplicate `deviceId`) — mirrors `ModelRegistryValidationError`. */
export class EdgeDeviceValidationError extends Error {}
