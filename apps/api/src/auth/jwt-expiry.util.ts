const DEFAULT_EXPIRES_IN_SECONDS = 3600;

/** Fails loudly at module-registration time rather than letting JwtModule accept `undefined` silently. */
export function getRequiredJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new Error("JWT_SECRET must be set (see .env.example)");
  }
  return secret;
}

/**
 * Parses `JWT_EXPIRES_IN` (e.g. "1h", "30m", "3600") into a plain
 * number of seconds. Used for both `JwtModule.register`'s
 * `signOptions.expiresIn` and the API response's `expiresInSeconds` —
 * kept as a number (not `ms`'s branded `StringValue` string type) so
 * both call sites share one plain, easily-unit-tested implementation.
 * Falls back to 1 hour if unset or unparseable.
 */
export function getJwtExpiresInSeconds(): number {
  const raw = process.env["JWT_EXPIRES_IN"] ?? "1h";
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) {
    return DEFAULT_EXPIRES_IN_SECONDS;
  }
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  const multiplier: Record<"s" | "m" | "h" | "d", number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * multiplier[unit];
}
