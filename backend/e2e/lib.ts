import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type Ev = { seq: number; ts: string; runId: string; type: string; [k: string]: any };

export type Server = { url: string; stop: () => Promise<void>; logs: () => string };

// Boots the backend on its own port and data dir; resolves once /healthz answers.
export async function startServer(env: Record<string, string>): Promise<Server> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const { GCS_BUCKET, ...base } = process.env;
  let out = "";
  const child: ChildProcess = spawn(path.join(BACKEND, "node_modules/.bin/tsx"), ["src/index.ts"], {
    cwd: BACKEND,
    env: { ...base, INTERNAL_TOKEN: "e2e-token", ...env, PORT: String(port) },
  });
  child.stdout?.on("data", (d) => (out += d));
  child.stderr?.on("data", (d) => (out += d));
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${url}/healthz`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
    if (i === 99) throw new Error(`backend did not boot:\n${out.slice(-2000)}`);
  }
  return {
    url,
    logs: () => out,
    stop: () =>
      new Promise((r) => {
        child.once("exit", () => r());
        child.kill("SIGTERM");
      }),
  };
}

export async function json(url: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const r = await fetch(url, init);
  const text = await r.text();
  try {
    return { status: r.status, body: JSON.parse(text) };
  } catch {
    return { status: r.status, body: text };
  }
}

export function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  return json(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

// Reads the SSE stream until `until` says stop or the timeout passes, returns every event seen.
export async function collect(
  url: string,
  opts: { until?: (e: Ev, all: Ev[]) => boolean; timeoutMs: number; headers?: Record<string, string>; onEvent?: (e: Ev) => void },
): Promise<Ev[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  const events: Ev[] = [];
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: opts.headers });
    if (!r.ok || !r.body) throw new Error(`SSE ${url} -> ${r.status}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const e = JSON.parse(data) as Ev;
        events.push(e);
        opts.onEvent?.(e);
        if (opts.until?.(e, events)) {
          ctrl.abort();
          return events;
        }
      }
    }
  } catch (err) {
    if (!ctrl.signal.aborted) throw err;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

export const finished = (e: Ev) => e.type === "run.finished";

export function countBy(events: Ev[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const e of events) c[e.type] = (c[e.type] ?? 0) + 1;
  return c;
}

// Checks every run must pass, mock or real: numbering, ordering, every agent parks, report before finish.
export function assertRunShape(events: Ev[], assert: typeof import("node:assert/strict")) {
  assert.ok(events.length > 0, "no events");
  events.forEach((e, i) => assert.equal(e.seq, i + 1, `seq gap at index ${i}: got ${e.seq}`));
  assert.equal(events[0].type, "run.created");
  const types = events.map((e) => e.type);
  const idx = (t: string) => types.indexOf(t);
  assert.ok(idx("sandbox.started") > 0, "sandbox.started missing");
  assert.ok(idx("repo.profile") > idx("sandbox.started"), "repo.profile before sandbox.started");
  assert.ok(idx("report.ready") > 0, "report.ready missing");
  assert.ok(idx("run.finished") > idx("report.ready"), "run.finished must come after report.ready");
  const spawned = new Set(events.filter((e) => e.type === "agent.spawned").map((e) => e.agentId));
  const done = new Set(events.filter((e) => e.type === "agent.done").map((e) => e.agentId));
  for (const a of spawned) assert.ok(done.has(a), `agent ${a} never finished`);
  const profile = events.find((e) => e.type === "repo.profile")!;
  assert.ok(Array.isArray(profile.files) && profile.files.length > 0, "repo.profile.files must be a flat, non-empty array");
  const files = new Set<string>(profile.files);
  const dropped = new Set(events.filter((e) => e.type === "finding.dropped").map((e) => e.findingId));
  for (const f of events.filter((e) => e.type === "finding.added").map((e) => e.finding)) {
    if (!files.has(f.file)) assert.ok(dropped.has(f.id), `finding ${f.id} cites ${f.file}, not in the repo, and was not dropped`);
  }
  const report = events.find((e) => e.type === "report.ready")!;
  assert.ok(report.score >= 0 && report.score <= 100, `score ${report.score} out of range`);
  assert.match(report.markdown, /\/ 100/);
}
