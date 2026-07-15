import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { log } from "@ai-defense/observability";

/** Mirrors `vision_service.edge.sidecar`'s stdout detection-record shape exactly — see that module's docstring for the full IPC protocol this class is the Node side of. */
export interface SidecarDetectionEvent {
  readonly frameIndex: number;
  readonly frameTimestampMs: number;
  readonly trackId: number | null;
  readonly label: string;
  readonly confidence: number;
  readonly boundingBox: { x: number; y: number; width: number; height: number };
}

export type ParsedSidecarLine =
  | { readonly kind: "ready" }
  | { readonly kind: "detection"; readonly event: SidecarDetectionEvent }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ignored"; readonly reason: string };

/**
 * REQ-9.3: the pure half of the IPC protocol parser — no process, no
 * I/O, deliberately factored out of `PythonSidecarProcess` so it's
 * testable with plain strings rather than a real (or stubbed) child
 * process. Mirrors `vision_service.edge.sidecar`'s stdout contract
 * exactly: `{"type": "ready"}` / `{"type": "detection", ...}` /
 * `{"type": "error", "message": "..."}`, one JSON object per line.
 * Anything else (malformed JSON, an unrecognized `type`, a blank line)
 * is reported as `{kind: "ignored", reason}` rather than thrown —
 * a single corrupted line must never crash the whole edge agent.
 */
export function parseSidecarLine(line: string): ParsedSidecarLine {
  if (!line.trim()) {
    return { kind: "ignored", reason: "blank line" };
  }

  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return { kind: "ignored", reason: "not valid JSON" };
  }

  if (typeof record !== "object" || record === null || !("type" in record)) {
    return { kind: "ignored", reason: 'missing a "type" field' };
  }

  if (record.type === "ready") {
    return { kind: "ready" };
  }
  if (record.type === "detection") {
    return { kind: "detection", event: record as unknown as SidecarDetectionEvent };
  }
  if (record.type === "error") {
    const message = (record as { message?: unknown }).message;
    return { kind: "error", message: typeof message === "string" ? message : "unknown error" };
  }
  return { kind: "ignored", reason: `unrecognized type: ${String(record.type)}` };
}

export interface PythonSidecarOptions {
  readonly pythonExecutable: string;
  readonly cwd: string;
  readonly videoPath: string;
  readonly loop: boolean;
  readonly confidenceThreshold?: number | undefined;
  /** Set on the child's `VISION_SERVICE_DETECTION_MODEL_PATH` — the local path `model-resolver.ts` already downloaded, per docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md's "the sidecar never resolves its own model" decision. */
  readonly modelPath?: string | undefined;
  readonly onDetection: (event: SidecarDetectionEvent) => void;
  readonly onReady?: (() => void) | undefined;
  readonly onExit?: ((code: number | null) => void) | undefined;
}

/**
 * REQ-9.3 (docs/mvp-plan/PRD-Phase-9.md,
 * docs/adr/ADR-010-edge-runtime-language-and-inference-strategy.md):
 * spawns and supervises the `vision_service.edge.sidecar` child
 * process, parsing its newline-delimited JSON stdout protocol via
 * `parseSidecarLine()` above. Deliberately does not use any RPC/
 * message-queue library — see the ADR's "Alternative D" for why
 * `node:child_process` + `node:readline` is the whole mechanism.
 */
export class PythonSidecarProcess {
  private child: ChildProcess | undefined;

  constructor(private readonly options: PythonSidecarOptions) {}

  start(): void {
    const args = ["-m", "vision_service.edge.sidecar", "--video-path", this.options.videoPath];
    if (this.options.loop) {
      args.push("--loop");
    }
    if (this.options.confidenceThreshold !== undefined) {
      args.push("--confidence-threshold", String(this.options.confidenceThreshold));
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    if (this.options.modelPath) {
      env["VISION_SERVICE_DETECTION_MODEL_PATH"] = this.options.modelPath;
    }

    const child = spawn(this.options.pythonExecutable, args, { cwd: this.options.cwd, env });
    this.child = child;

    createInterface({ input: child.stdout }).on("line", (line: string) => {
      this.handleStdoutLine(line);
    });

    child.stderr.setEncoding("utf8");
    // sidecar.py's own `_log_stderr()` already emits structured JSON
    // lines — relayed as-is under a `sidecarLog` field rather than
    // re-parsed and re-shaped, so nothing here depends on the exact
    // fields that helper chooses to include.
    createInterface({ input: child.stderr }).on("line", (line: string) => {
      if (line.trim()) {
        log("info", "edge sidecar log", { sidecarLog: line });
      }
    });

    child.on("exit", (code) => {
      this.child = undefined;
      log("warn", "edge sidecar process exited", { code });
      this.options.onExit?.(code);
    });

    child.on("error", (error) => {
      log("error", "edge sidecar process failed to start", { error: error.message });
    });
  }

  private handleStdoutLine(line: string): void {
    const parsed = parseSidecarLine(line);
    if (parsed.kind === "ready") {
      this.options.onReady?.();
    } else if (parsed.kind === "detection") {
      this.options.onDetection(parsed.event);
    } else if (parsed.kind === "error") {
      log("error", "edge sidecar reported a fatal error", { message: parsed.message });
    } else {
      log("warn", "edge sidecar emitted an unrecognized stdout line, ignoring", {
        line,
        reason: parsed.reason,
      });
    }
  }

  stop(): void {
    this.child?.kill("SIGTERM");
  }

  get isRunning(): boolean {
    return this.child !== undefined;
  }
}
