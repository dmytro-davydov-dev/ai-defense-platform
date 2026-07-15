/**
 * REQ-6.5: minimal shape this module needs from a socket.io `Socket`'s
 * handshake — narrowed to an interface (same pattern as
 * `KafkaProducerLike`) so `extractBearerToken` is unit-testable without
 * a real socket.io server.
 */
export interface HandshakeLike {
  readonly auth?: Record<string, unknown>;
  readonly query?: Record<string, unknown>;
  readonly headers: Record<string, string | string[] | undefined>;
}

/**
 * A browser's socket.io client can't set a custom `Authorization`
 * header on the initial handshake as easily as `fetch` can, so this
 * accepts the JWT from any of three places, in priority order:
 * `auth.token` (the documented, preferred way — `io(url, { auth: { token } })`),
 * a `token` query parameter (fallback for clients/tools that can't set
 * `auth`), or a real `Authorization: Bearer ...` header (parity with
 * every REST call, REQ-2.4). Returns `undefined` if none is present or
 * well-formed — the gateway disconnects the socket in that case.
 */
export function extractBearerToken(
  handshake: HandshakeLike,
): string | undefined {
  const authToken = handshake.auth?.["token"];
  if (typeof authToken === "string" && authToken.length > 0) {
    return authToken;
  }

  const queryToken = handshake.query?.["token"];
  if (typeof queryToken === "string" && queryToken.length > 0) {
    return queryToken;
  }

  const header = handshake.headers["authorization"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue?.startsWith("Bearer ")) {
    return headerValue.slice("Bearer ".length);
  }

  return undefined;
}

/** Builds the socket.io room name a mission's events are broadcast to. */
export function missionRoom(missionId: string): string {
  return `mission:${missionId}`;
}
