import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { apply, initialState } from "./reducer.js";
import { score } from "./score.js";
import { validateFinding } from "./validate.js";

// Folds a fixture the way the backend does: drop invalid findings, ignore recorded scores.
function scoreFixture(file: string) {
  const s = initialState("r_test");
  let seq = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    const e = JSON.parse(line);
    if (["score.updated", "report.ready", "run.finished"].includes(e.type)) continue;
    apply(s, { ...e, seq: ++seq, runId: "r_test" });
    if (e.type === "finding.added") {
      const reason = validateFinding(s, e.finding);
      if (reason) apply(s, { type: "finding.dropped", findingId: e.finding.id, reason, seq: ++seq, ts: "", runId: "r_test" });
    }
  }
  return score(s);
}

test("mini fixture scores 75.5 by the rubric", () => {
  const r = scoreFixture(path.resolve("fixtures/mini.jsonl"));
  assert.equal(r.dimensions.claims.points, 9);
  assert.equal(r.dimensions.runs.points, 14.3);
  assert.equal(r.dimensions.quality.points, 13);
  assert.equal(r.dimensions.security.points, 3);
  assert.equal(r.total, 75.5);
});

// Bergen's fixture writes its expected total in the header, e.g. `// expected total: 67`.
const frontendFixture = path.resolve("../frontend/fixtures/run.jsonl");
test("frontend fixture matches its header total", { skip: !existsSync(frontendFixture) }, () => {
  const header = readFileSync(frontendFixture, "utf8").split("\n").slice(0, 3).join("\n");
  const m = header.match(/expected[^0-9]*([0-9.]+)/i);
  if (!m) return;
  assert.equal(scoreFixture(frontendFixture).total, Number(m[1]));
});

test("rubric edge cases: failed explorers, big repos, missing toolchains, no build system", () => {
  const base = () => {
    const s = initialState("r_edge");
    s.profile = { name: "x/y", files: ["a.go"], hasTests: true, hasBuild: true, packageManager: "go", languages: { go: 100 } };
    return s;
  };
  // every explorer finished without output: no free points
  const failed = base();
  failed.agents = [{ agentId: "a_explorer_01", role: "explorer", status: "done", tokens: { in: 0, out: 0, cacheRead: 0 } }];
  const f = score(failed);
  assert.equal(f.dimensions.quality.points, 0);
  assert.equal(f.dimensions.quality.note, "explorers returned nothing");

  // 16 explored chunks with 4 majors in quality lose as much as 4 chunks with 1 major
  const big = base();
  big.agents = Array.from({ length: 16 }, (_, i) => ({ agentId: `a_explorer_${i}`, role: "explorer", status: "done" as const, tokens: { in: 1, out: 1, cacheRead: 0 } }));
  big.findings = Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, agentId: "a", chunkId: `c${i}`, dimension: "quality" as const, severity: "major" as const, file: "a.go", line: 1, quote: "x", note: "n", valid: true }));
  assert.equal(score(big).dimensions.quality.points, 13);

  // Go is not in the image: compiles and runs get the repo's average, with a note
  const g = score(big);
  assert.match(g.dimensions.compiles.note ?? "", /Go toolchain not in the sandbox/);
  assert.ok(g.dimensions.compiles.points > 0 && g.dimensions.runs.points > 0);

  // "no build system" is 5, not 10
  const nb = base();
  nb.profile.packageManager = "npm";
  nb.compile = { compiles: true, command: "none", warnings: 0 };
  assert.equal(score(nb).dimensions.compiles.points, 5);

  // planner-skipped chunks do not shrink coverage
  const sk = base();
  sk.profile.packageManager = "npm";
  sk.agents = big.agents.slice(0, 1);
  sk.chunks = [
    { id: "c1", path: "src", files: [], bytes: 1000, churn: 0, sampled: false, priority: 5 },
    { id: "c2", path: "docs", files: [], bytes: 9000, churn: 0, sampled: true, priority: 0, skipped: true },
  ];
  assert.equal(score(sk).dimensions.architecture.points, 10);
});
