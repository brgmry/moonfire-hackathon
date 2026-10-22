import { randomBytes } from "node:crypto";
import { apply, initialState } from "./reducer.js";
import { score } from "./score.js";
import { validateFinding } from "./validate.js";
import { writeReport } from "./writer.js";
import { loadAll, persist } from "./store.js";
import { learnFromEvent } from "./memory.js";
import { markExhausted, primaryKeyName, record } from "./keys.js";
import type { Event, RunState } from "./types.js";

type Run = {
  state: RunState;
  events: Event[];
  subs: Set<(e: Event) => void>;
  timeout?: NodeJS.Timeout;
  doneCheck?: NodeJS.Timeout;
  finishing: boolean;
  timedOut: boolean;
  primaryKey?: string;
  partialReason?: string;
};

const runs = new Map<string, Run>();
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS ?? 10 * 60 * 1000);
const SCORE_TRIGGERS = new Set([
  "repo.profile",
  "chunk.created",
  "finding.added",
  "finding.dropped",
  "claim.added",
  "compile.done",
  "run.done",
  "agent.done",
]);

export function newRunId(): string {
  return "r_" + randomBytes(3).toString("hex");
}

export function createRun(id: string, repoUrl: string, by?: string): Run {
  const run: Run = { state: initialState(id, repoUrl, by), events: [], subs: new Set(), finishing: false, timedOut: false };
  runs.set(id, run);
  return run;
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export function listRuns(): RunState[] {
  return [...runs.values()].map((r) => r.state);
}

export function subscribe(id: string, fn: (e: Event) => void): () => void {
  const run = runs.get(id);
  if (!run) return () => {};
  run.subs.add(fn);
  return () => run.subs.delete(fn);
}

// Numbers the event, folds it into the state, persists, broadcasts, then runs the backend's own reactions.
export function appendEvent(runId: string, input: Record<string, any>): Event {
  const run = runs.get(runId);
  if (!run) throw new Error(`no run ${runId}`);
  const { seq: _drop, runId: _r, ...rest } = input;
  const e: Event = { ...rest, seq: run.state.lastSeq + 1, ts: input.ts ?? new Date().toISOString(), runId, type: input.type };
  apply(run.state, e);
  run.events.push(e);
  persist(runId, run.events, e);
  console.log(JSON.stringify({ severity: "INFO", ...e }));
  for (const fn of run.subs) {
    try {
      fn(e);
    } catch {}
  }
  react(run, e);
  return e;
}

function react(run: Run, e: Event) {
  const id = run.state.id;
  learnFromEvent(run.state, e);

  // Spend per key: agents name the key they used, otherwise it went on the run's primary key.
  if (e.type === "sandbox.started") run.primaryKey ??= primaryKeyName();
  if (e.type === "agent.done" && run.state.runner !== "mock") {
    const a = run.state.agents.find((x) => x.agentId === e.agentId);
    record(e.key ?? run.primaryKey, a?.model, e.tokens);
  }
  if (e.type === "key.exhausted" && e.key) markExhausted(e.key, e.error ?? "reported by the sandbox");

  // The sandbox could not do the job (clone failed) or ran out of time: say so in the outcome.
  if (e.type === "sandbox.failed") {
    if (e.fatal) void finish(run, String(e.reason ?? "sandbox failed"), "failed");
    else run.partialReason = String(e.reason ?? "sandbox stopped early");
  }

  if (e.type === "finding.added") {
    const reason = validateFinding(run.state, e.finding);
    if (reason) appendEvent(id, { type: "finding.dropped", findingId: e.finding.id, reason });
  }

  if (SCORE_TRIGGERS.has(e.type)) rescore(run);

  if (e.type === "sandbox.started" && !run.timeout) {
    run.timeout = setTimeout(() => {
      run.timedOut = true;
      finish(run, "sandbox timeout after 10 min");
    }, SANDBOX_TIMEOUT_MS);
  }

  if (e.type === "agent.done" || e.type === "agent.spawned") {
    clearTimeout(run.doneCheck);
    run.doneCheck = setTimeout(() => {
      if (allAgentsDone(run.state)) finish(run);
    }, 2000);
  }
}

function rescore(run: Run) {
  const next = score(run.state);
  for (const [dim, d] of Object.entries(next.dimensions)) {
    const prev = run.state.score.dimensions[dim];
    if (!prev || prev.points !== d.points || prev.note !== d.note || prev.top.join() !== d.top.join()) {
      appendEvent(run.state.id, { type: "score.updated", dimension: dim, points: d.points, max: d.max, top: d.top, note: d.note });
    }
  }
}

function allAgentsDone(s: RunState): boolean {
  if (s.agents.length === 0) return false;
  const orch = s.agents.find((a) => a.role === "orchestrator");
  if (orch) return orch.status === "done" && s.agents.filter((a) => a.role !== "writer").every((a) => a.status === "done");
  return s.agents.every((a) => a.status === "done");
}

export async function finish(run: Run, reason?: string, forced?: "failed") {
  if (run.finishing || ["complete", "partial", "failed"].includes(run.state.status)) return;
  run.finishing = true;
  clearTimeout(run.timeout);
  clearTimeout(run.doneCheck);
  const id = run.state.id;
  if (forced === "failed") {
    // Nothing was reviewed, so no report to write and nothing to bill.
    appendEvent(id, { type: "run.finished", status: "failed", reason });
    run.finishing = false;
    return;
  }
  reason = reason ?? run.partialReason;
  try {
    rescore(run);
    const writerId = "a_writer_01";
    appendEvent(id, { type: "agent.spawned", agentId: writerId, role: "writer", model: "claude-sonnet-5-5" });
    const { markdown, usage, tokens, key } = await writeReport(run.state);
    appendEvent(id, { type: "agent.done", agentId: writerId, tokens: usage, key });
    appendEvent(id, { type: "report.ready", score: run.state.score.total, dimensions: run.state.score.dimensions, markdown, tokens });
  } catch (err) {
    console.error(JSON.stringify({ severity: "ERROR", msg: "writer failed", runId: id, err: String(err) }));
  }
  const s = run.state;
  const anyFinding = s.findings.some((f) => f.valid !== false);
  let status: "complete" | "partial" | "failed" = "complete";
  if (s.install?.ok === false && !anyFinding) {
    status = "failed";
    reason = reason ?? "install failed and no explorer produced a finding";
  } else if (run.timedOut || reason) status = "partial";
  appendEvent(id, { type: "run.finished", status, reason });
  run.finishing = false;
}

export function finishById(id: string, reason?: string) {
  const run = runs.get(id);
  if (run) return finish(run, reason);
}

// Rebuild every run from its event log. No reactions: the log already holds the derived events.
export async function restore(): Promise<number> {
  const logs = await loadAll();
  for (const [id, events] of logs) {
    const run = createRun(id, "");
    for (const e of events) {
      apply(run.state, e);
      run.events.push(e);
    }
  }
  return logs.size;
}
