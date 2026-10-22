import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, finishById, getRun } from "../runs.js";
import { memoryJson } from "../memory.js";
import { allKeysEnv } from "../keys.js";
import { sandboxEnv, type Runner } from "./index.js";
import type { RunState } from "../types.js";

// Runs sandbox/main.py on this laptop with the same env the Cloud Run job gets.
const ROOT = existsSync(path.resolve("sandbox/main.py")) ? path.resolve(".") : path.resolve("..");

function python(): string {
  if (process.env.SANDBOX_PYTHON) return process.env.SANDBOX_PYTHON;
  const venv = path.join(ROOT, "sandbox/.venv/bin/python");
  return existsSync(venv) ? venv : "python3";
}

function launch(run: RunState, extra: Record<string, string> = {}) {
  const workdir = mkdtempSync(path.join(os.tmpdir(), `crew-${run.id}-`));
  // The backend's own PORT and test-runner vars must not reach the repo under test.
  const { PORT: _port, NODE_TEST_CONTEXT: _ntc, NODE_OPTIONS: _no, ...inherited } = process.env;
  const env = {
    ...inherited,
    ...sandboxEnv(run, extra),
    API_URL: `http://localhost:${process.env.PORT ?? 8080}`,
    MEMORY_JSON: memoryJson(),
    ...(allKeysEnv() ? { ANTHROPIC_API_KEYS: allKeysEnv() } : {}),
    WORKDIR: path.join(workdir, "work"),
    MAX_CHUNKS: process.env.MAX_CHUNKS ?? "24",
    MAX_PARALLEL: process.env.MAX_PARALLEL ?? "8",
  };
  const child = spawn(python(), [path.join(ROOT, "sandbox/main.py")], { env, cwd: ROOT });
  appendEvent(run.id, { type: "sandbox.started", executionId: `local-${child.pid}`, runner: "local" });
  const prefix = (l: string) => process.stderr.write(`[sandbox ${run.id}] ${l}`);
  child.stderr.on("data", (d) => prefix(String(d)));
  child.stdout.on("data", (d) => {
    if (process.env.SANDBOX_STDOUT) prefix(String(d));
  });
  child.on("exit", (code) => {
    prefix(`exited ${code}\n`);
    // Give the last event batch time to land, then close the run if the sandbox did not.
    setTimeout(() => {
      const r = getRun(run.id);
      if (r && !["complete", "partial", "failed"].includes(r.state.status)) finishById(run.id, code === 0 ? undefined : `sandbox exited ${code}`);
    }, 5000);
  });
}

export const localRunner: Runner = {
  async start(run) {
    launch(run);
  },
  async rerunChunk(run, chunkId) {
    launch(run, { RERUN_CHUNK: chunkId, RERUN_CHUNK_JSON: JSON.stringify(run.chunks.find((c) => c.id === chunkId) ?? {}) });
  },
};
