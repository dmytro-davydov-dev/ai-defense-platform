// Production static server for the built SPA. Serves dist/ and exposes
// /health and /ready, per docs/mvp-plan/PRD-Phase-1.md REQ-1.8. Used by
// `pnpm start` and infrastructure/compose/docker-compose.yml — `vite dev`
// is used for local development instead.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT ?? 8080);

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/ready", (_req, res) => {
  res.status(200).json({ status: "ready" });
});

app.use(express.static(distDir));

// SPA fallback: any non-file, non-API route serves index.html.
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", message: `web listening on ${port}` }));
});
