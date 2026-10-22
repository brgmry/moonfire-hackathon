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

export function coverage(s: RunState): { covered: number; total: number; sampled: number; chunks: number } {
  const total = s.chunks.reduce((t, c) => t + (c.bytes || 0), 0);
  const covered = s.chunks.filter((c) => !c.sampled).reduce((t, c) => t + (c.bytes || 0), 0);
  return { covered, total, sampled: s.chunks.filter((c) => c.sampled).length, chunks: s.chunks.length };
}

export function score(s: RunState): { total: number; dimensions: Record<string, DimensionScore> } {
  const valid = s.findings.filter((f) => f.valid !== false);
  const byDim = (d: string) => valid.filter((f) => f.dimension === d);
  const explored = valid.length > 0 || s.agents.some((a) => a.role === "explorer" && a.status === "done");
  const cov = coverage(s);
  const scale = cov.sampled > 0 && cov.total > 0 ? cov.covered / cov.total : 1;
  const sampledNote = cov.sampled > 0 ? `sampled ${cov.chunks - cov.sampled} of ${cov.chunks} chunks` : undefined;
  const d: Record<string, DimensionScore> = {};

  // claims: 15 × delivered/total + 10 × meanQuality/5
  {
    const cs = s.claims;
    if (cs.length === 0) {
      const noReadme = s.agents.some((a) => a.role === "claims" && a.status === "done");
      d.claims = { points: 0, max: MAX.claims, top: [], note: noReadme ? "no README claims found" : undefined };
    } else {
      const delivered = cs.filter((c) => c.status === "delivered").length;
      const meanQ = cs.reduce((t, c) => t + (Number(c.quality) || 0), 0) / cs.length;
      const missing = cs.filter((c) => c.status === "missing").concat(cs.filter((c) => c.status === "partial"));
      d.claims = {
        points: 15 * (delivered / cs.length) + 10 * (clamp(meanQ, 0, 5) / 5),
        max: MAX.claims,
        top: missing.slice(0, 3).map((c) => c.id),
        note: `${delivered} of ${cs.length} delivered`,
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
      if (r.kind === "api" && Number(r.endpointsTotal) > 0) {
        points += 10 * (Number(r.endpointsOk) / Number(r.endpointsTotal));
      } else if (passed + failed > 0) {
        points += 10 * (passed / (passed + failed));
      } else {
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
    if (c?.compiles) {
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
  const fromFindings = (dim: string, base: number, wMajor: number, wMinor: number, wGood: number, scaled: boolean) => {
    const fs = byDim(dim);
    if (!explored) return { points: 0, max: MAX[dim], top: [] };
    const n = counts(fs);
    let points = clamp(base - wMajor * n.major - wMinor * n.minor + wGood * n.good, 0, base);
    if (scaled) points *= scale;
    return { points, max: MAX[dim], top: top(fs), note: scaled ? sampledNote : undefined };
  };
  d.quality = fromFindings("quality", 15, 2, 0.5, 0.5, true);
  d.architecture = fromFindings("architecture", 10, 2, 0.5, 0.5, true);
  d.dead_code = fromFindings("dead_code", 5, 1, 0.25, 0, true);
  d.security = fromFindings("security", 5, 2, 0.5, 0, false);
  d.docs = fromFindings("docs", 5, 1, 0.25, 0, false);

  for (const k of Object.keys(d)) d[k].points = round1(d[k].points);
  const total = round1(Object.values(d).reduce((t, x) => t + x.points, 0));
  return { total, dimensions: d };
}
