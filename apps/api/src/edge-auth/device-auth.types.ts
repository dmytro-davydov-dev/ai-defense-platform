/**
 * Phase 9 (docs/mvp-plan/PRD-Phase-9.md REQ-9.9/9.10,
 * docs/adr/ADR-011-device-identity-and-sync-transport.md): what
 * `DeviceAuthGuard` attaches to `request.device` after a bearer token
 * verifies against `edge_devices.token_hash`. Deliberately narrow —
 * unlike `AuthenticatedUser`, there are no roles: a device credential
 * only ever reaches device-facing routes, never `operator`/`admin`-gated
 * ones (see the ADR's Decision section).
 */
export interface AuthenticatedDevice {
  readonly id: string;
  readonly deviceId: string;
}
