import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appendEvent } from "../runs.js";
import type { Runner } from "./index.js";

// Streams a recorded run through appendEvent with its own timing. Events the backend derives
// itself (scores, drops for missing files, the report, the finish) are skipped so the real scorer runs.
const BACKEND_TYPES = new Set([
  "run.created",
  "presence.join",
  "presence.leave",
  "sandbox.started",
  "score.updated",
  "report.ready",
  "memory.hit",
  "run.finished",
]);

const CANDIDATES = [
  process.env.FIXTURE,
  path.resolve("../frontend/fixtures/run.jsonl"),
  path.resolve("frontend/fixtures/run.jsonl"),
  path.resolve("../packages/contract/fixtures/run.jsonl"),
  path.resolve("fixtures/mini.jsonl"),
  path.resolve("backend/fixtures/mini.jsonl"),
].filter(Boolean) as string[];

export function fixturePath(): string {
  const p = CANDIDATES.find((c) => existsSync(c));
  if (!p) throw new Error("no fixture found");
  return p;
}

export function loadFixture(): Record<string, any>[] {
  return readFileSync(fixturePath(), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    // Bergen's fixture lines are { delayMs, event }; ours are bare events with ts.
    .map((l) => (l && l.event ? { ...l.event, delayMs: l.delayMs } : l))
    .filter((e) => e && typeof e.type === "string");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockRunner: Runner = {
  async start(run) {
    const speed = Number(process.env.MOCK_SPEED ?? 1);
    const events = loadFixture();
    appendEvent(run.id, { type: "sandbox.started", executionId: "mock", runner: "mock" });
    let prevTs: number | null = null;
    for (const e of events) {
      if (BACKEND_TYPES.has(e.type)) continue;
      if (e.type === "finding.dropped" && e.reason !== "classifier_disagreed") continue;
      const ts = Date.parse(e.ts);
      let gap = prevTs !== null && !Number.isNaN(ts) ? Math.min(Math.max(ts - prevTs, 0), 2000) : 300;
      if (typeof e.delayMs === "number") gap = e.delayMs;
      if (!Number.isNaN(ts)) prevTs = ts;
      await sleep(gap / speed);
      const { seq, ts: _ts, runId, delayMs, ...rest } = e;
      appendEvent(run.id, rest);
    }
  },
  async rerunChunk() {},
};
