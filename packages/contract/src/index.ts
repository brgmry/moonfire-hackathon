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
  orchestrator: '#ffd23f', explorer: '#5ad1ff', claims: '#ff8ad8', compiler: '#ffa552',
  runner: '#8dff7a', classifier: '#c9a6ff', git: '#ffffff', writer: '#f6f2b0',
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

/** Every event the backend numbers and broadcasts. The sandbox sends these without `seq`. */
export type EventPayload =
  | { type: 'run.created'; repoUrl: string; by: string }
  | { type: 'presence.join'; name: string }
  | { type: 'presence.leave'; name: string }
  | { type: 'sandbox.started'; executionId: string; runner: RunnerKind }
  | { type: 'repo.profile'; profile: RepoProfile }
  | { type: 'install.done'; ok: boolean; manager: string; durationMs: number; errorsTail: string }
  | { type: 'chunk.created'; chunk: Chunk }
  | { type: 'agent.spawned'; agentId: string; role: Role; chunkId?: string; model: string }
  | { type: 'agent.working'; agentId: string; file: string }
  | { type: 'agent.done'; agentId: string; tokens: Tokens }
  | { type: 'finding.added'; finding: Finding }
  | { type: 'finding.dropped'; findingId: string; reason: 'file_not_in_repo' | 'classifier_disagreed' | 'quote_not_found' }
  | { type: 'claim.added'; claim: Claim }
  | { type: 'compile.done'; result: CompileResult }
  | { type: 'run.done'; result: RunResult }
  | { type: 'app.screenshot'; url: string }
  | { type: 'contributors'; contributors: Contributors }
  | { type: 'score.updated'; dimension: Dimension; points: number; max: number; top: string[] }
  | { type: 'report.ready'; score: number; dimensions: Record<Dimension, DimensionScore>; markdown: string; tokens: Tokens }
  | { type: 'memory.hit'; chunkId: string; source: string }
  | { type: 'run.finished'; status: 'complete' | 'partial' | 'failed'; reason?: string };

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
    case 'repo.profile': return { ...n, profile: e.profile };
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
    case 'compile.done': return { ...n, compile: e.result };
    case 'run.done': return { ...n, run: e.result };
    case 'app.screenshot': return { ...n, screenshotUrl: e.url };
    case 'contributors': return { ...n, contributors: e.contributors };
    case 'score.updated': {
      const dimensions = { ...n.score.dimensions, [e.dimension]: { points: e.points, max: e.max, top: e.top } };
      const total = Object.values(dimensions).reduce((acc, d) => acc + (d?.points ?? 0), 0);
      return { ...n, score: { total: Math.round(total), dimensions } };
    }
    case 'report.ready': return { ...n, report: e.markdown, score: { total: e.score, dimensions: e.dimensions }, tokens: e.tokens };
    case 'memory.hit': return { ...n, memoryHits: [...n.memoryHits, e.chunkId] };
    case 'run.finished': return { ...n, status: e.status };
    default: return n;
  }
}

export function reduceAll(id: string, events: RunEvent[]): RunState {
  return events.reduce(apply, initialState(id));
}
