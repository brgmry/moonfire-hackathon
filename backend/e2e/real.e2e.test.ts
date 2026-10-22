// Real agents on a real repo, costs a few pence. Two modes:
//   local:  npm run e2e:real                       (boots the backend with RUNNER=local)
//   cloud:  E2E_API_URL=https://api-...run.app npm run e2e:real
// E2E_REPO picks the repo (default: the pinned python-slugify demo repo). E2E_WEB_URL also checks the page loads.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { reduceAll } from "../../packages/contract/src/index.ts";
import { assertRunShape, collect, countBy, finished, json, postJson, startServer, type Ev, type Server } from "./lib.ts";

const REPO = process.env.E2E_REPO ?? "https://github.com/un33k/python-slugify#35aca63fc2672cba2c739ff6dff685a4f26a4f9a";
const REMOTE = process.env.E2E_API_URL?.replace(/\/$/, "");
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 11 * 60 * 1000);

let server: Server | undefined;
let api = REMOTE ?? "";
let runId = "";
let events: Ev[] = [];
let spentBefore = 0;

const spent = async () => ((await json(`${api}/keys`)).body as any[]).reduce((t, k) => t + (k.spentUsd ?? 0), 0);

before(async () => {
  if (!REMOTE) {
    server = await startServer({ RUNNER: "local", DATA_DIR: path.join(mkdtempSync(path.join(os.tmpdir(), "crew-real-")), "runs") });
    api = server.url;
  }
  spentBefore = await spent();
});
after(async () => {
  await server?.stop();
});

test(`a real run on ${REPO} completes with evidence`, { timeout: TIMEOUT + 30_000 }, async () => {
  const started = Date.now();
  const r = await postJson(`${api}/runs`, { repoUrl: REPO, by: "e2e", fresh: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  runId = r.body.id;
  console.log(`run ${runId} on ${api}`);
  let lastLog = 0;
  events = await collect(`${api}/runs/${runId}/events?name=e2e`, {
    until: finished,
    timeoutMs: TIMEOUT,
    onEvent: (e) => {
      if (["repo.profile", "install.done", "compile.done", "run.done", "contributors", "report.ready", "run.finished", "key.exhausted"].includes(e.type) || Date.now() - lastLog > 20_000) {
        lastLog = Date.now();
        console.log(`  +${Math.round((Date.now() - started) / 1000)}s ${e.seq} ${e.type}`);
      }
    },
  });
  const c = countBy(events);
  console.log("  events:", JSON.stringify(c));
  if (server && !events.some(finished)) console.log(server.logs().slice(-3000));
  assert.ok(events.some(finished), "run did not finish in time");
  assertRunShape(events, assert);

  const fin = events.at(-1)!;
  assert.equal(fin.status, "complete", `run ended ${fin.status}: ${fin.reason ?? ""}`);
  const profile = events.find((e) => e.type === "repo.profile")!;
  assert.ok(profile.commit, "profile.commit");
  assert.ok(events.find((e) => e.type === "install.done")?.ok, "install ok");
  assert.ok((c["chunk.created"] ?? 0) >= 2, "at least two chunks");
  const valid = events.filter((e) => e.type === "finding.added" && !events.some((d) => d.type === "finding.dropped" && d.findingId === e.finding.id));
  assert.ok(valid.length >= 5, `only ${valid.length} valid findings`);
  for (const e of valid) {
    assert.ok(e.finding.quote && e.finding.quote.split("\n").length <= 3, `finding ${e.finding.id} quote must be 1-3 lines`);
    assert.ok(["dead_code", "architecture", "quality", "tests", "security", "docs"].includes(e.finding.dimension));
    assert.ok(["good", "minor", "major"].includes(e.finding.severity));
  }
  assert.ok((c["claim.added"] ?? 0) >= 1, "claims from the README");
  assert.ok(c["compile.done"] === 1, "compile.done once");
  assert.ok(c["run.done"] === 1, "run.done once");
  assert.ok(c["contributors"] === 1, "contributors once");
  const run = events.find((e) => e.type === "run.done")!;
  console.log(`  run.done: kind=${run.kind} runs=${run.runs} tests ${run.testsPassed}/${run.testsPassed + run.testsFailed}`);
  const report = events.find((e) => e.type === "report.ready")!;
  console.log(`  score ${report.score}, tokens ${JSON.stringify(report.tokens)}, ${Math.round((Date.now() - started) / 1000)}s`);
  assert.ok(report.tokens.in > 0, "token usage reported");

  const state = (await json(`${api}/runs/${runId}`)).body;
  const ui = reduceAll(runId, state.events);
  assert.equal(ui.score.total, report.score, "UI reducer and backend agree on the score");
});

test("spend lands on the key pool", async () => {
  const keys = (await json(`${api}/keys`)).body;
  console.log("  keys:", JSON.stringify(keys));
  if (keys.length === 0) return; // no pool configured, claude CLI login locally
  assert.ok((await spent()) > spentBefore, "spentUsd went up");
});

test("the same commit again replays from memory without a sandbox", { timeout: 120_000 }, async () => {
  const r = await postJson(`${api}/runs`, { repoUrl: REPO, by: "e2e" });
  const again = await collect(`${api}/runs/${r.body.id}/events`, { until: finished, timeoutMs: 110_000 });
  const c = countBy(again);
  assert.ok((c["memory.hit"] ?? 0) > 0, "memory.hit events");
  assert.equal(again.find((e) => e.type === "sandbox.started")?.executionId, "memory");
  const first = events.find((e) => e.type === "report.ready")!.score;
  const second = again.find((e) => e.type === "report.ready")!.score;
  assert.ok(Math.abs(first - second) < 0.11, `memory replay scored ${second}, the original ${first}`);
});

test("the run page loads", { skip: !process.env.E2E_WEB_URL }, async () => {
  const r = await fetch(`${process.env.E2E_WEB_URL!.replace(/\/$/, "")}/run/${runId}`);
  assert.equal(r.status, 200);
});
