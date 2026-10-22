import type { Agent, Event, RunState } from "./types.js";

export function initialState(id: string, repoUrl = "", by?: string): RunState {
  return {
    id,
    repoUrl,
    by,
    status: "created",
    profile: {},
    install: {},
    chunks: [],
    agents: [],
    findings: [],
    claims: [],
    compile: {},
    run: {},
    contributors: {},
    score: { total: 0, dimensions: {} },
    report: "",
    tokens: { in: 0, out: 0, cacheRead: 0 },
    memoryHits: [],
    presence: [],
    lastSeq: 0,
  };
}

function payload(e: Event): Record<string, any> {
  const { seq, ts, runId, type, ...rest } = e;
  return rest;
}

// The sandbox sends these payloads flat (specs/00-contract.md); clients get them nested (packages/contract).
const NESTED: Record<string, string> = { "repo.profile": "profile", "compile.done": "result", "run.done": "result", contributors: "contributors" };

export function normalize(input: Record<string, any>): Record<string, any> {
  const key = NESTED[input.type];
  if (!key || input[key] !== undefined) return input;
  const { type, ts, seq, runId, ...rest } = input;
  return { type, ts, seq, runId, [key]: rest };
}

function agent(s: RunState, agentId: string): Agent | undefined {
  return s.agents.find((a) => a.agentId === agentId);
}

// One switch over the contract's event types. Mutates and returns the state.
export function apply(s: RunState, e: Event): RunState {
  s.lastSeq = Math.max(s.lastSeq, e.seq ?? 0);
  switch (e.type) {
    case "run.created":
      s.repoUrl = e.repoUrl;
      s.by = e.by;
      s.status = "created";
      break;
    case "presence.join":
      if (!s.presence.includes(e.name)) s.presence.push(e.name);
      break;
    case "presence.leave":
      s.presence = s.presence.filter((n) => n !== e.name);
      break;
    case "sandbox.started":
      s.status = "running";
      s.executionId = e.executionId;
      s.runner = e.runner;
      break;
    case "repo.profile":
      s.profile = e.profile ?? payload(e);
      break;
    case "install.done":
      s.install = payload(e);
      break;
    case "chunk.created":
      if (!s.chunks.some((c) => c.id === e.chunk.id)) s.chunks.push(e.chunk);
      break;
    case "agent.spawned": {
      const a = agent(s, e.agentId);
      if (a) a.status = "spawned";
      else s.agents.push({ agentId: e.agentId, role: e.role, chunkId: e.chunkId, model: e.model, status: "spawned" });
      break;
    }
    case "agent.working": {
      const a = agent(s, e.agentId);
      if (a) {
        a.status = "working";
        a.file = e.file;
      }
      break;
    }
    case "agent.done": {
      const a = agent(s, e.agentId);
      if (a) {
        a.status = "done";
        a.tokens = e.tokens;
      }
      if (e.tokens) {
        s.tokens.in += e.tokens.in ?? 0;
        s.tokens.out += e.tokens.out ?? 0;
        s.tokens.cacheRead += e.tokens.cacheRead ?? 0;
      }
      break;
    }
    case "finding.added":
      if (!s.findings.some((f) => f.id === e.finding.id)) s.findings.push({ valid: true, ...e.finding });
      break;
    case "finding.dropped": {
      const f = s.findings.find((x) => x.id === e.findingId);
      if (f) {
        f.valid = false;
        f.dropReason = e.reason;
      }
      break;
    }
    case "claim.added":
      if (!s.claims.some((c) => c.id === e.claim.id)) s.claims.push(e.claim);
      break;
    case "compile.done":
      s.compile = e.result ?? payload(e);
      break;
    case "run.done":
      s.run = e.result ?? payload(e);
      break;
    case "app.screenshot":
      s.screenshot = e.url;
      break;
    case "contributors":
      s.contributors = e.contributors ?? payload(e);
      break;
    case "score.updated": {
      s.score.dimensions[e.dimension] = { points: e.points, max: e.max, top: e.top ?? [], note: e.note };
      s.score.total = round1(Object.values(s.score.dimensions).reduce((t, d) => t + d.points, 0));
      break;
    }
    case "report.ready":
      s.report = e.markdown;
      s.tokens = e.tokens ?? s.tokens;
      if (typeof e.score === "number") s.score.total = e.score;
      break;
    case "memory.hit":
      s.memoryHits.push({ chunkId: e.chunkId, source: e.source });
      break;
    case "run.finished":
      s.status = e.status;
      s.reason = e.reason;
      break;
  }
  return s;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
