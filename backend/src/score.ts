import { round1 } from "./reducer.js";
import type { DimensionScore, Finding, RunState } from "./types.js";

// The rubric in specs/00-contract.md. The sandbox never sends a score.
export const MAX: Record<string, number> = {
  claims: 25,
  runs: 15,
  compiles: 10,
  quality: 15,
  architecture: 10,
  tests: 10,
  dead_code: 5,
  security: 5,
  docs: 5,
};

const SEVERITY_RANK = { major: 0, minor: 1, good: 2 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function counts(fs: Finding[]) {
  return {
    major: fs.filter((f) => f.severity === "major").length,
    minor: fs.filter((f) => f.severity === "minor").length,
    good: fs.filter((f) => f.severity === "good").length,
  };
}

function top(fs: Finding[]): string[] {
  return [...fs].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 3).map((f) => f.id);
}

// Paths the planner chose to skip (vendored, generated, docs, fixtures) are not code we failed to read.
const isSkipped = (c: RunState["chunks"][number]) => c.skipped === true || c.priority === 0;

export function coverage(s: RunState): { covered: number; total: number; sampled: number; chunks: number } {
  const counted = s.chunks.filter((c) => !isSkipped(c));
  const total = counted.reduce((t, c) => t + (c.bytes || 0), 0);
  const covered = counted.filter((c) => !c.sampled).reduce((t, c) => t + (c.bytes || 0), 0);
  return { covered, total, sampled: counted.filter((c) => c.sampled).length, chunks: counted.length };
}

// The image ships Python and Node only. Other toolchains are the sandbox's gap, not the repo's.
const TOOLCHAIN: Record<string, string> = {
  go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", scala: "Scala", rb: "Ruby", php: "PHP", c: "C", cpp: "C++",
  cs: "C#", swift: "Swift", ex: "Elixir", dart: "Dart", lua: "Lua", zig: "Zig",
};
const SUPPORTED_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun", "pip", "uv", "poetry"]);

export function unsupportedToolchain(s: RunState): string | null {
  const pm = s.profile.packageManager;
  if (pm === "cargo") return "Rust";
  if (pm === "go") return "Go";
  if (pm && SUPPORTED_MANAGERS.has(pm)) return null;
  const top = Object.entries((s.profile.languages ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top && TOOLCHAIN[top] ? TOOLCHAIN[top] : null;
}

export function score(s: RunState): { total: number; dimensions: Record<string, DimensionScore> } {
  const valid = s.findings.filter((f) => f.valid !== false);
  const byDim = (d: string) => valid.filter((f) => f.dimension === d);
  // Explorers that returned something, not ones that merely finished: a failed agent is no evidence.
  const explorersRan = s.agents.filter((a) => a.role === "explorer" && a.status === "done" && (a.tokens?.out ?? 0) > 0).length;
  const exploredChunks = Math.max(explorersRan, new Set(valid.map((f) => f.chunkId)).size);
  const explored = exploredChunks > 0;
  // Penalties per four explored chunks, so a big repo is not punished for having more code to find things in.
  const norm = 1 / Math.max(1, exploredChunks / 4);
  const toolchain = unsupportedToolchain(s);
  const cov = coverage(s);
  const scale = cov.sampled > 0 && cov.total > 0 ? cov.covered / cov.total : 1;
  const sampledNote = cov.sampled > 0 ? `sampled ${cov.chunks - cov.sampled} of ${cov.chunks} chunks` : undefined;
  const d: Record<string, DimensionScore> = {};

  // claims: 15 × delivered/total + 10 × meanQuality/5
  {
    const cs = s.claims;
    if (cs.length === 0) {
      const agent = s.agents.find((a) => a.role === "claims");
      const note = agent?.status !== "done" ? undefined : (agent.tokens?.out ?? 0) > 0 ? "no README claims found" : "claims agent did not finish";
      d.claims = { points: 0, max: MAX.claims, top: [], note };
    } else {
      const delivered = cs.filter((c) => c.status === "delivered").length;
      const meanQ = cs.reduce((t, c) => t + (Number(c.quality) || 0), 0) / cs.length;
      const missing = cs.filter((c) => c.status === "missing").concat(cs.filter((c) => c.status === "partial"));
      // A README that promises little earns little: under three claims, the points scale down.
      const breadth = Math.min(1, cs.length / 3);
      d.claims = {
        points: (15 * (delivered / cs.length) + 10 * (clamp(meanQ, 0, 5) / 5)) * breadth,
        max: MAX.claims,
        top: missing.slice(0, 3).map((c) => c.id),
        note: `${delivered} of ${cs.length} delivered` + (breadth < 1 ? `, only ${cs.length} claim${cs.length > 1 ? "s" : ""} in the README` : ""),
      };
    }
  }

  // runs: starts 5; tests 10 × rate, no tests 3; api 10 × endpointsOk/endpointsTotal
  {
    const r = s.run;
    let points = 0;
    let note: string | undefined;
    if (r && Object.keys(r).length > 0) {
      if (r.runs) points += 5;
      const passed = Number(r.testsPassed) || 0;
      const failed = Number(r.testsFailed) || 0;
      // The better of what answered over HTTP (api, web) and what the tests say.
      const ratios: number[] = [];
      if (Number(r.endpointsTotal) > 0) ratios.push(Number(r.endpointsOk) / Number(r.endpointsTotal));
      if (passed + failed > 0) ratios.push(passed / (passed + failed));
      if (ratios.length > 0) points += 10 * Math.max(...ratios);
      else {
        points += 3;
        note = "no tests ran";
      }
    }
    d.runs = { points, max: MAX.runs, top: [], note };
  }

  // compiles: compiles 7, zero warnings 3, no build system 5
  {
    const c = s.compile;
    let points = 0;
    let note: string | undefined;
    const warnings = Array.isArray(c?.warnings) ? c.warnings.length : Number(c?.warnings) || 0;
    if (c?.compiles && (!c.command || c.command === "none")) {
      points = 5;
      note = "no build system";
    } else if (c?.compiles && /compileall/.test(String(c.command))) {
      points = 5;
      note = "syntax check only, nothing to build";
    } else if (c?.compiles) {
      points = 7 + (warnings === 0 ? 3 : 0);
    } else if (s.profile.hasBuild === false && (Object.keys(c ?? {}).length > 0 || s.profile.name)) {
      points = 5;
      note = "no build system";
    }
    d.compiles = { points, max: MAX.compiles, top: [], note };
  }

  // tests: test files present 4, pass rate × 6
  {
    const r = s.run;
    const passed = Number(r?.testsPassed) || 0;
    const failed = Number(r?.testsFailed) || 0;
    let points = s.profile.hasTests ? 4 : 0;
    if (passed + failed > 0) points += 6 * (passed / (passed + failed));
    d.tests = { points, max: MAX.tests, top: top(byDim("tests")), note: s.profile.hasTests === false ? "no test files" : undefined };
  }

  // finding-driven dimensions only count once explorers have reported
  // Finding-driven dimensions. No evidence either way is 70%, not full marks. Each major costs about a
  // quarter of the dimension, a minor very little, a good finding earns some back; all per four chunks.
  const BASE = 0.7;
  const W = { major: 0.25, minor: 0.015, good: 0.06 };
  const fromFindings = (dim: string, scaled: boolean, majorWeight = W.major) => {
    const fs = byDim(dim);
    if (!explored) {
      const anyExplorer = s.agents.some((a) => a.role === "explorer" && a.status === "done");
      return { points: 0, max: MAX[dim], top: [], note: anyExplorer ? "explorers returned nothing" : undefined };
    }
    const n = counts(fs);
    const ratio = clamp(BASE + norm * (W.good * n.good - majorWeight * n.major - W.minor * n.minor), 0, 1);
    let points = MAX[dim] * ratio;
    if (scaled) points *= scale;
    const note = fs.length === 0 ? "no findings either way" : scaled ? sampledNote : undefined;
    return { points, max: MAX[dim], top: top(fs), note };
  };
  d.quality = fromFindings("quality", true);
  d.architecture = fromFindings("architecture", true);
  d.dead_code = fromFindings("dead_code", true);
  d.security = fromFindings("security", false, 0.3);
  d.docs = fromFindings("docs", false);

  // A toolchain the sandbox lacks: compiles and runs take the repo's average on everything we could judge.
  if (toolchain) {
    const judged = ["claims", "quality", "architecture", "dead_code", "security", "docs"].filter((k) => d[k]);
    const avg = judged.reduce((t, k) => t + d[k].points / d[k].max, 0) / Math.max(1, judged.length);
    const note = `${toolchain} toolchain not in the sandbox, scored at the repo's average`;
    if (!s.compile?.compiles) d.compiles = { points: MAX.compiles * avg, max: MAX.compiles, top: [], note };
    if (!s.run?.runs) d.runs = { points: MAX.runs * avg, max: MAX.runs, top: [], note };
    const passed = Number(s.run?.testsPassed) || 0;
    const failed = Number(s.run?.testsFailed) || 0;
    if (passed + failed === 0) d.tests = { ...d.tests, points: (s.profile.hasTests ? 4 : 0) + 6 * avg, note };
  }

  for (const k of Object.keys(d)) d[k].points = round1(d[k].points);
  const total = round1(Object.values(d).reduce((t, x) => t + x.points, 0));
  return { total, dimensions: d };
}
