// The shared schema. Mirrors specs/00-contract.md. Frontend and backend both import this and nothing else.

export type Role = 'orchestrator' | 'explorer' | 'claims' | 'compiler' | 'runner' | 'classifier' | 'git' | 'writer';
export type Dimension = 'claims' | 'runs' | 'compiles' | 'quality' | 'architecture' | 'tests' | 'dead_code' | 'security' | 'docs';
export type FindingDimension = 'dead_code' | 'architecture' | 'quality' | 'tests' | 'security' | 'docs';
export type Severity = 'good' | 'minor' | 'major';
export type ClaimStatus = 'delivered' | 'partial' | 'missing';
export type RunStatus = 'created' | 'running' | 'complete' | 'partial' | 'failed';
export type RunnerKind = 'cloudrun' | 'local' | 'mock';

export const ROLES: Role[] = ['orchestrator', 'explorer', 'claims', 'compiler', 'runner', 'classifier', 'git', 'writer'];

/** Accent colour per role. Matches assets/avatars/README.md once the sprites land. */
export const ROLE_ACCENT: Record<Role, string> = {
  orchestrator: '#FFD23F', explorer: '#FF7A1A', claims: '#3FA7FF', compiler: '#9BE22E',
  runner: '#FF4D4D', classifier: '#B388FF', git: '#2EC4B6', writer: '#FF6BB5',
};

/** Rubric maxima, in display order. The backend computes points; the frontend only renders. */
export const DIMENSIONS: { key: Dimension; max: number; label: string }[] = [
  { key: 'claims', max: 25, label: 'claims' },
  { key: 'runs', max: 15, label: 'runs' },
  { key: 'compiles', max: 10, label: 'compiles' },
  { key: 'quality', max: 15, label: 'quality' },
  { key: 'architecture', max: 10, label: 'architecture' },
  { key: 'tests', max: 10, label: 'tests' },
  { key: 'dead_code', max: 5, label: 'dead code' },
  { key: 'security', max: 5, label: 'security' },
  { key: 'docs', max: 5, label: 'docs' },
];

export interface RepoProfile {
  name: string; defaultBranch: string; commit: string; stars: number;
  languages: Record<string, number>; packageManager: string; framework: string;
  hasTests: boolean; hasBuild: boolean; hasDockerfile: boolean; fileCount: number; files: string[];
}
export interface Chunk { id: string; path: string; files: string[]; bytes: number; churn: number; sampled: boolean }
export interface Finding {
  id: string; agentId: string; chunkId: string; dimension: FindingDimension; severity: Severity;
  file: string; line: number; quote: string; note: string; valid: boolean;
}
export interface Claim {
  id: string; text: string; readmeLine: number; status: ClaimStatus; evidenceFile: string; quality: number; note?: string;
}
export interface Tokens { in: number; out: number; cacheRead: number; costGbp?: number }
export interface CompileResult { compiles: boolean; command: string; durationMs: number; buildSizeBytes: number; warnings: number; errorsTail: string }
export interface RunResult {
  runs: boolean; kind: 'cli' | 'api' | 'web' | 'lib'; testsPassed: number; testsFailed: number;
  endpointsOk: number; endpointsTotal: number; errorsTail: string;
}
export interface Author { name: string; email: string; commits: number; lines: number; chunks: Record<string, number> }
export interface Contributors { authors: Author[]; truncated: boolean; fork: boolean }
export interface DimensionScore { points: number; max: number; top: string[] }

/** Every event the backend numbers and broadcasts. Payload fields sit flat on the event. The sandbox sends these without `seq`. */
export type EventPayload =
  | { type: 'run.created'; repoUrl: string; by: string }
  | { type: 'presence.join'; name: string }
  | { type: 'presence.leave'; name: string }
  | { type: 'sandbox.started'; executionId: string; runner: RunnerKind }
  | ({ type: 'repo.profile' } & RepoProfile)
  | { type: 'install.done'; ok: boolean; manager: string; durationMs: number; errorsTail: string }
  | { type: 'chunk.created'; chunk: Chunk }
  | { type: 'agent.spawned'; agentId: string; role: Role; chunkId?: string; model: string }
  | { type: 'agent.working'; agentId: string; file: string }
  | { type: 'agent.done'; agentId: string; tokens: Tokens }
  | { type: 'finding.added'; finding: Finding }
  | { type: 'finding.dropped'; findingId: string; reason: 'file_not_in_repo' | 'classifier_disagreed' | 'quote_not_found' }
  | { type: 'claim.added'; claim: Claim }
  | ({ type: 'compile.done' } & CompileResult)
  | ({ type: 'run.done' } & RunResult)
  | { type: 'app.screenshot'; url: string }
  | ({ type: 'contributors' } & Contributors)
  | { type: 'score.updated'; dimension: Dimension; points: number; max: number; top: string[]; note?: string }
  | { type: 'report.ready'; score: number; dimensions: Record<Dimension, DimensionScore>; markdown: string; tokens: Tokens }
  | { type: 'memory.hit'; chunkId: string; source: string }
  | { type: 'run.finished'; status: 'complete' | 'partial' | 'failed'; reason?: string }
  | { type: 'action'; action: string; chunkId?: string; findingId?: string; by: string };

export type EventType = EventPayload['type'];
export type RunEvent = EventPayload & { seq: number; ts: string; runId: string };

export interface Agent {
  agentId: string; role: Role; chunkId?: string; model: string;
  status: 'working' | 'done'; file?: string; tokens?: Tokens;
  spawnedAt: string; lastActiveAt: string; lastFoundAt?: string;
}

/** The full run, as `GET /runs/:id` returns it and as the frontend reducer builds it from events. */
export interface RunState {
  id: string; repoUrl: string; by: string; status: RunStatus; runner?: RunnerKind;
  profile?: RepoProfile; install?: { ok: boolean; manager: string; durationMs: number; errorsTail: string };
  chunks: Chunk[]; agents: Record<string, Agent>; findings: Finding[]; claims: Claim[];
  compile?: CompileResult; run?: RunResult; screenshotUrl?: string; contributors?: Contributors;
  score: { total: number; dimensions: Partial<Record<Dimension, DimensionScore>> };
  report?: string; tokens: Tokens; presence: string[]; memoryHits: string[]; lastSeq: number;
  /** Timestamps of recent activity, so the UI can animate from state alone. */
  recent: { findings: { id: string; ts: string }[]; hotChunks: Record<string, string> };
}

export function initialState(id: string): RunState {
  return {
    id, repoUrl: '', by: '', status: 'created', chunks: [], agents: {}, findings: [], claims: [],
    score: { total: 0, dimensions: {} }, tokens: { in: 0, out: 0, cacheRead: 0 }, presence: [], memoryHits: [],
    lastSeq: 0, recent: { findings: [], hotChunks: {} },
  };
}

/** Pure reducer. The backend and the frontend both run this one, so the state never disagrees. */
export function apply(s: RunState, e: RunEvent): RunState {
  if (e.seq <= s.lastSeq) return s;
  const n: RunState = { ...s, lastSeq: e.seq };
  switch (e.type) {
    case 'run.created': return { ...n, repoUrl: e.repoUrl, by: e.by, status: 'running' };
    case 'presence.join': return { ...n, presence: n.presence.includes(e.name) ? n.presence : [...n.presence, e.name] };
    case 'presence.leave': return { ...n, presence: n.presence.filter(p => p !== e.name) };
    case 'sandbox.started': return { ...n, runner: e.runner };
    case 'repo.profile': { const { type, seq, ts, runId, ...flat } = e as RunEvent & { profile?: RepoProfile }; void type; void seq; void ts; void runId; const p = (flat as { profile?: RepoProfile }).profile ?? (flat as unknown as RepoProfile); return { ...n, profile: { ...p, languages: p.languages ?? {}, files: p.files ?? [] } }; }
    case 'install.done': return { ...n, install: { ok: e.ok, manager: e.manager, durationMs: e.durationMs, errorsTail: e.errorsTail } };
    case 'chunk.created': return { ...n, chunks: [...n.chunks.filter(c => c.id !== e.chunk.id), e.chunk] };
    case 'agent.spawned': return { ...n, agents: { ...n.agents, [e.agentId]: { agentId: e.agentId, role: e.role, chunkId: e.chunkId, model: e.model, status: 'working', spawnedAt: e.ts, lastActiveAt: e.ts } } };
    case 'agent.working': {
      const a = n.agents[e.agentId]; if (!a) return n;
      const hot = a.chunkId ? { ...n.recent.hotChunks, [a.chunkId]: e.ts } : n.recent.hotChunks;
      return { ...n, agents: { ...n.agents, [e.agentId]: { ...a, file: e.file, lastActiveAt: e.ts } }, recent: { ...n.recent, hotChunks: hot } };
    }
    case 'agent.done': {
      const a = n.agents[e.agentId]; if (!a) return n;
      const t = n.tokens;
      return { ...n, agents: { ...n.agents, [e.agentId]: { ...a, status: 'done', tokens: e.tokens } },
        tokens: { in: t.in + e.tokens.in, out: t.out + e.tokens.out, cacheRead: t.cacheRead + e.tokens.cacheRead } };
    }
    case 'finding.added': {
      const a = n.agents[e.finding.agentId];
      const agents = a ? { ...n.agents, [e.finding.agentId]: { ...a, lastFoundAt: e.ts } } : n.agents;
      return { ...n, agents, findings: [...n.findings.filter(f => f.id !== e.finding.id), e.finding],
        recent: { ...n.recent, findings: [...n.recent.findings.slice(-11), { id: e.finding.id, ts: e.ts }] } };
    }
    case 'finding.dropped': return { ...n, findings: n.findings.map(f => f.id === e.findingId ? { ...f, valid: false } : f) };
    case 'claim.added': return { ...n, claims: [...n.claims.filter(c => c.id !== e.claim.id), e.claim] };
    case 'compile.done': { const { type, seq, ts, runId, ...r } = e as RunEvent & { result?: CompileResult }; void type; void seq; void ts; void runId; return { ...n, compile: ((r as { result?: CompileResult }).result ?? (r as unknown as CompileResult)) }; }
    case 'run.done': { const { type, seq, ts, runId, ...r } = e as RunEvent & { result?: RunResult }; void type; void seq; void ts; void runId; return { ...n, run: ((r as { result?: RunResult }).result ?? (r as unknown as RunResult)) }; }
    case 'app.screenshot': return { ...n, screenshotUrl: e.url };
    case 'contributors': { const c = (e as RunEvent & { contributors?: Contributors }).contributors ?? { authors: e.authors ?? [], truncated: !!e.truncated, fork: !!e.fork }; return { ...n, contributors: c }; }
    case 'score.updated': {
      const dimensions = { ...n.score.dimensions, [e.dimension]: { points: e.points, max: e.max, top: e.top } };
      const total = Object.values(dimensions).reduce((acc, d) => acc + (d?.points ?? 0), 0);
      return { ...n, score: { total: Math.round(total * 10) / 10, dimensions } };
    }
    case 'report.ready': return { ...n, report: e.markdown, score: { total: e.score, dimensions: e.dimensions }, tokens: e.tokens };
    case 'memory.hit': return { ...n, memoryHits: [...n.memoryHits, e.chunkId] };
    case 'run.finished': return { ...n, status: e.status };
    case 'action': return n;
    default: return n;
  }
}

export function reduceAll(id: string, events: RunEvent[]): RunState {
  return events.reduce(apply, initialState(id));
}

/** `GET /runs/:id` as the backend returns it (agents as an array, empty objects for absent parts). Normalise into RunState. */
export function fromServerState(j: Record<string, unknown>, id: string): RunState {
  const base = initialState(id);
  const has = (o: unknown) => !!o && typeof o === 'object' && Object.keys(o as object).length > 0;
  const agentsRaw = Array.isArray(j.agents) ? (j.agents as Agent[]) : Object.values((j.agents as Record<string, Agent>) ?? {});
  const agents: Record<string, Agent> = {};
  for (const a of agentsRaw) agents[a.agentId] = { ...a, spawnedAt: a.spawnedAt ?? '', lastActiveAt: a.lastActiveAt ?? '', status: a.status === 'done' ? 'done' : 'working' };
  const mh = (j.memoryHits as ({ chunkId: string } | string)[]) ?? [];
  return {
    ...base,
    repoUrl: (j.repoUrl as string) ?? '', by: (j.by as string) ?? '', status: (j.status as RunStatus) ?? 'created', runner: j.runner as RunnerKind | undefined,
    profile: has(j.profile) ? (j.profile as RepoProfile) : undefined,
    install: has(j.install) ? (j.install as RunState['install']) : undefined,
    chunks: (j.chunks as Chunk[]) ?? [], agents, findings: (j.findings as Finding[]) ?? [], claims: (j.claims as Claim[]) ?? [],
    compile: has(j.compile) ? (j.compile as CompileResult) : undefined, run: has(j.run) ? (j.run as RunResult) : undefined,
    screenshotUrl: (j.screenshotUrl as string) ?? (j.screenshot as string) ?? undefined,
    contributors: has(j.contributors) ? (j.contributors as Contributors) : undefined,
    score: (j.score as RunState['score']) ?? base.score, report: (j.report as string) || undefined,
    tokens: (j.tokens as Tokens) ?? base.tokens, presence: (j.presence as string[]) ?? [],
    memoryHits: mh.map((m) => (typeof m === 'string' ? m : m.chunkId)), lastSeq: (j.lastSeq as number) ?? 0,
  };
}
