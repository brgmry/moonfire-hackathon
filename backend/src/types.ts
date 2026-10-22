// Shapes from specs/00-contract.md. Payload fields sit flat on the event.

export type Event = {
  seq: number;
  ts: string;
  runId: string;
  type: string;
  [key: string]: any;
};

export type Dimension =
  | "claims"
  | "runs"
  | "compiles"
  | "quality"
  | "architecture"
  | "tests"
  | "dead_code"
  | "security"
  | "docs";

export type Finding = {
  id: string;
  agentId: string;
  chunkId: string;
  dimension: "dead_code" | "architecture" | "quality" | "tests" | "security" | "docs";
  severity: "good" | "minor" | "major";
  file: string;
  line: number;
  quote: string;
  note: string;
  valid: boolean;
  dropReason?: string;
};

export type Claim = {
  id: string;
  text: string;
  readmeLine: number;
  status: "delivered" | "partial" | "missing";
  evidenceFile?: string;
  quality: number;
  note?: string;
};

export type Chunk = {
  id: string;
  path: string;
  files: string[];
  bytes: number;
  churn: number;
  sampled: boolean;
  name?: string;
  focus?: string;
  priority?: number;
  skipped?: boolean;
};

export type Agent = {
  agentId: string;
  role: string;
  chunkId?: string;
  model?: string;
  status: "spawned" | "working" | "done";
  file?: string;
  tokens?: { in: number; out: number; cacheRead: number };
};

export type Tokens = { in: number; out: number; cacheRead: number; costGbp?: number };

export type DimensionScore = { points: number; max: number; top: string[]; note?: string };

export type RunState = {
  id: string;
  repoUrl: string;
  by?: string;
  status: "created" | "running" | "complete" | "partial" | "failed";
  reason?: string;
  executionId?: string;
  runner?: string;
  profile: Record<string, any>;
  install: Record<string, any>;
  chunks: Chunk[];
  agents: Agent[];
  findings: Finding[];
  claims: Claim[];
  compile: Record<string, any>;
  run: Record<string, any>;
  contributors: Record<string, any>;
  screenshot?: string;
  score: { total: number; dimensions: Record<string, DimensionScore> };
  report: string;
  tokens: Tokens;
  memoryHits: { chunkId: string; source: string }[];
  presence: string[];
  lastSeq: number;
};
