import { createServer, type Server } from "node:http";

/** REQ-9.1: mutated in place by `main.ts` as the sidecar/model resolution progress — read by the `/ready` handler below. Mirrors `apps/api`'s `HealthController` (REQ-1.8): `/health` is pure liveness, `/ready` reflects real dependency state. */
export interface HealthState {
  sidecarReady: boolean;
}

export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/ready") {
      res.writeHead(state.sidecarReady ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: state.sidecarReady ? "ready" : "not_ready" }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  server.listen(port);
  return server;
}
