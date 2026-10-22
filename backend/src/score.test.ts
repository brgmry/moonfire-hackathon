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

test("mini fixture scores 74.5 by the rubric", () => {
  const r = scoreFixture(path.resolve("fixtures/mini.jsonl"));
  assert.equal(r.dimensions.claims.points, 9);
  assert.equal(r.dimensions.runs.points, 13.3);
  assert.equal(r.dimensions.quality.points, 13);
  assert.equal(r.dimensions.security.points, 3);
  assert.equal(r.total, 74.5);
});

// Bergen's fixture writes its expected total in the header, e.g. `// expected total: 67`.
const frontendFixture = path.resolve("../frontend/fixtures/run.jsonl");
test("frontend fixture matches its header total", { skip: !existsSync(frontendFixture) }, () => {
  const header = readFileSync(frontendFixture, "utf8").split("\n").slice(0, 3).join("\n");
  const m = header.match(/expected[^0-9]*([0-9.]+)/i);
  if (!m) return;
  assert.equal(scoreFixture(frontendFixture).total, Number(m[1]));
});
