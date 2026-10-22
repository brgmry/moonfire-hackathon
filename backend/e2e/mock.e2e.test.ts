// Free and fast: the whole backend against the recorded fixture. `npm run e2e`
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { reduceAll } from "../../packages/contract/src/index.ts";
import { assertRunShape, collect, countBy, finished, json, postJson, startServer, type Ev, type Server } from "./lib.ts";

const dataDir = path.join(mkdtempSync(path.join(os.tmpdir(), "crew-e2e-")), "runs");
const ENV = {
  RUNNER: "mock",
  MOCK_SPEED: "25",
  WRITER: "off",
  DATA_DIR: dataDir,
  ANTHROPIC_API_KEYS: "allen:sk-fake-AAAA,bergen:sk-fake-BBBB,akshay:sk-fake-CCCC",
  ANTHROPIC_KEY_BUDGETS: "allen:30,bergen:20,akshay:10",
  RUNS_PER_IP_PER_HOUR: "1000",
  MAX_ACTIVE_RUNS: "100",
};
let server: Server;
let runId = "";
let events: Ev[] = [];

before(async () => {
  server = await startServer(ENV);
});
after(async () => {
  await server?.stop();
});

test("healthz and input validation", async () => {
  assert.equal((await json(`${server.url}/healthz`)).body, "ok");
  assert.equal((await postJson(`${server.url}/runs`, { repoUrl: "not a url" })).status, 400);
  assert.equal((await json(`${server.url}/runs/r_nope`)).status, 404);
});

test("a mock run streams end to end over SSE", async () => {
  const r = await postJson(`${server.url}/runs`, { repoUrl: "https://github.com/acme/pulse-cli", by: "e2e", fresh: true });
  assert.equal(r.status, 200);
  runId = r.body.id;
  assert.match(runId, /^r_[0-9a-f]{6}$/);
  events = await collect(`${server.url}/runs/${runId}/events?name=e2e-viewer`, { until: finished, timeoutMs: 60_000 });
  const c = countBy(events);
  for (const t of ["repo.profile", "install.done", "chunk.created", "agent.spawned", "finding.added", "claim.added", "compile.done", "run.done", "contributors", "score.updated", "report.ready", "run.finished"]) {
    assert.ok(c[t] > 0, `no ${t} event`);
  }
  assertRunShape(events, assert);
  assert.equal(events.at(-1)!.status, "complete");
  assert.ok(events.some((e) => e.type === "presence.join" && e.name === "e2e-viewer"), "presence.join for the viewer");
  assert.ok(events.some((e) => e.type === "finding.dropped" && e.reason === "file_not_in_repo"), "the fixture's hallucinated finding is dropped");
  for (const t of ["repo.profile", "compile.done", "run.done", "contributors"]) {
    const e = events.find((x) => x.type === t)!;
    assert.ok(!("profile" in e) && !("result" in e), `${t} must be flat on the wire`);
  }
});

test("score.updated sums to the report score, and the shared reducer agrees with the backend", async () => {
  const dims: Record<string, number> = {};
  for (const e of events.filter((x) => x.type === "score.updated")) dims[e.dimension] = e.points;
  assert.equal(Object.keys(dims).length, 9, "all nine dimensions scored");
  const report = events.find((e) => e.type === "report.ready")!;
  assert.ok(Math.abs(Object.values(dims).reduce((a, b) => a + b, 0) - report.score) < 0.11);

  const state = (await json(`${server.url}/runs/${runId}`)).body;
  assert.equal(state.status, "complete");
  assert.equal(state.score.total, report.score);
  assert.equal(state.lastSeq, state.events.length);
  const ui = reduceAll(runId, state.events);
  assert.equal(ui.status, "complete");
  assert.equal(ui.score.total, report.score);
  assert.equal(ui.profile?.name, state.profile.name);
  assert.equal(ui.findings.filter((f) => f.valid).length, state.findings.filter((f: any) => f.valid).length);
  assert.ok(ui.report && ui.report.length > 50, "report text reaches the UI");
});

test("reconnect with Last-Event-ID replays only what was missed", async () => {
  const last = events.at(-1)!.seq;
  const tail = await collect(`${server.url}/runs/${runId}/events`, { headers: { "Last-Event-ID": String(last - 5) }, timeoutMs: 1500 });
  assert.deepEqual(tail.slice(0, 5).map((e) => e.seq), [last - 4, last - 3, last - 2, last - 1, last]);
});

test("presence shows a viewer while connected", async () => {
  let snapshot: string[] = [];
  await collect(`${server.url}/runs/${runId}/events?name=phone-1`, {
    timeoutMs: 3000,
    onEvent: async (e) => {
      if (e.type === "presence.join" && e.name === "phone-1") snapshot = (await json(`${server.url}/runs/${runId}`)).body.presence;
    },
    until: (e) => e.type === "presence.join" && e.name === "phone-1",
  });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(snapshot.includes("phone-1"), "phone-1 present while connected");
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!(await json(`${server.url}/runs/${runId}`)).body.presence.includes("phone-1"), "phone-1 gone after disconnect");
});

test("actions are recorded as events", async () => {
  const r = await postJson(`${server.url}/runs/${runId}/actions`, { type: "pin", findingId: "f1", by: "e2e" });
  assert.deepEqual(r.body, { ok: true });
  assert.equal((await postJson(`${server.url}/runs/${runId}/actions`, { type: "explode" })).status, 400);
  const state = (await json(`${server.url}/runs/${runId}`)).body;
  assert.ok(state.events.some((e: any) => e.type === "action" && e.action === "pin" && e.findingId === "f1"));
});

test("internal events need the bearer token and create unknown runs", async () => {
  const bad = await postJson(`${server.url}/internal/events`, { runId: "stub1", events: [{ type: "agent.spawned" }] }, { Authorization: "Bearer wrong" });
  assert.equal(bad.status, 401);
  const ok = await postJson(
    `${server.url}/internal/events`,
    { runId: "stub1", events: [{ type: "agent.spawned", agentId: "a_stub_01", role: "orchestrator", model: "x" }, { type: "agent.working", agentId: "a_stub_01", file: "README.md" }] },
    { Authorization: "Bearer e2e-token" },
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.body.seq, 3, "run.created + two events");
  const state = (await json(`${server.url}/runs/stub1`)).body;
  assert.equal(state.agents.length, 1);
});

test("key pool: weights by credit left, no secrets exposed", async () => {
  const r = await fetch(`${server.url}/keys`);
  const text = await r.text();
  assert.ok(!text.includes("sk-fake"), "GET /keys must not leak keys");
  const keys = JSON.parse(text);
  assert.deepEqual(keys.map((k: any) => k.name), ["allen", "bergen", "akshay"]);
  assert.ok(keys.every((k: any) => k.status === "ok" && k.spentUsd === 0), "mock runs spend nothing");
});

test("pasted GitHub links are normalized to the repo, keeping a pinned ref", async () => {
  const cases: [string, string][] = [
    ["github.com/acme/pulse-cli?tab=readme-ov-file", "https://github.com/acme/pulse-cli"],
    ["http://www.github.com/acme/pulse-cli.git", "https://github.com/acme/pulse-cli"],
    ["https://github.com/acme/pulse-cli/blob/main/src/index.ts", "https://github.com/acme/pulse-cli/tree/main"],
    ["https://github.com/acme/pulse-cli/issues/12", "https://github.com/acme/pulse-cli"],
    ["https://github.com/acme/pulse-cli/tree/v1.0.0", "https://github.com/acme/pulse-cli/tree/v1.0.0"],
    ["https://github.com/acme/pulse-cli#35aca63fc2672cba2c739ff6dff685a4f26a4f9a", "https://github.com/acme/pulse-cli#35aca63fc2672cba2c739ff6dff685a4f26a4f9a"],
  ];
  for (const [input, expected] of cases) {
    const r = await postJson(`${server.url}/runs`, { repoUrl: input, by: "e2e", fresh: true });
    assert.equal(r.status, 200, input);
    assert.equal((await json(`${server.url}/runs/${r.body.id}`)).body.repoUrl, expected, input);
  }
  for (const bad of ["https://gitlab.com/a/b", "github.com/onlyowner", "not a url at all"]) {
    assert.equal((await postJson(`${server.url}/runs`, { repoUrl: bad })).status, 400, bad);
  }
});

test("the sandbox cannot post the score, the report or the outcome", async () => {
  const forged = [
    { type: "score.updated", dimension: "quality", points: 15, max: 15, top: [] },
    { type: "report.ready", score: 100, markdown: "# 100 / 100", tokens: { in: 0, out: 0, cacheRead: 0 } },
    { type: "run.finished", status: "complete" },
    { type: "finding.dropped", findingId: "f1", reason: "file_not_in_repo" },
  ];
  await postJson(`${server.url}/internal/events`, { runId, events: forged }, { Authorization: "Bearer e2e-token" });
  const state = (await json(`${server.url}/runs/${runId}`)).body;
  const reports = state.events.filter((e: any) => e.type === "report.ready");
  assert.equal(reports.length, 1, "no second report");
  assert.notEqual(state.score.total, 100);
});

test("a fatal sandbox failure ends the run as failed, with the reason", async () => {
  const r = await postJson(
    `${server.url}/internal/events`,
    { runId: "stub-fail", events: [{ type: "sandbox.failed", fatal: true, reason: "git clone failed: repository not found" }] },
    { Authorization: "Bearer e2e-token" },
  );
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 300));
  const state = (await json(`${server.url}/runs/stub-fail`)).body;
  assert.equal(state.status, "failed");
  assert.match(state.reason, /repository not found/);
  assert.ok(!state.events.some((e: any) => e.type === "report.ready"), "no report for a run that reviewed nothing");
});

test("a per-run token only opens its own run", async () => {
  const { createHmac } = await import("node:crypto");
  const token = createHmac("sha256", "e2e-token").update("stub-own").digest("hex");
  const own = await postJson(`${server.url}/internal/events`, { runId: "stub-own", events: [{ type: "agent.working", agentId: "a", file: "x" }] }, { Authorization: `Bearer ${token}` });
  assert.equal(own.status, 200);
  const other = await postJson(`${server.url}/internal/events`, { runId: runId, events: [{ type: "agent.working", agentId: "a", file: "x" }] }, { Authorization: `Bearer ${token}` });
  assert.equal(other.status, 401, "a run's token must not post into another run");
});

test("runs are capped per network", async () => {
  const capped = await startServer({ ...ENV, RUNS_PER_IP_PER_HOUR: "2", DATA_DIR: path.join(dataDir, "..", "capped") });
  try {
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await postJson(`${capped.url}/runs`, { repoUrl: "https://github.com/acme/pulse-cli", fresh: true })).status);
    assert.deepEqual(codes, [200, 200, 429]);
  } finally {
    await capped.stop();
  }
});

test("a restart restores every run from the event log", async () => {
  const before = (await json(`${server.url}/runs/${runId}`)).body;
  await server.stop();
  server = await startServer(ENV);
  const restored = (await json(`${server.url}/runs/${runId}`)).body;
  assert.equal(restored.status, "complete");
  assert.equal(restored.lastSeq, before.lastSeq);
  assert.equal(restored.score.total, before.score.total);
  const replay = await collect(`${server.url}/runs/${runId}/events`, { until: (_e, all) => all.length === before.events.length, timeoutMs: 3000 });
  assert.deepEqual(replay.map((e) => e.seq), before.events.map((e: Ev) => e.seq), "SSE replays the full log after a restart");
});
