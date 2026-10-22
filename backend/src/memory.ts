import { readJson, writeJson } from "./store.js";
import type { Event, RunState } from "./types.js";

// memory.json in the bucket: what the crew learned across runs.
type Memory = {
  runsByRepoCommit: Record<string, { runId: string; score: number }>;
  recipes: Record<string, string>;
  doNot: string[];
};

const DEFAULT_RECIPES: Record<string, string> = {
  pnpm: "corepack enable && pnpm i --frozen-lockfile=false",
  yarn: "corepack enable && yarn install",
  npm: "npm ci || npm i",
  uv: "uv sync",
  poetry: "pip install poetry && poetry install",
  pip: "pip install -r requirements.txt",
  cargo: "cargo fetch",
  go: "go mod download",
};

let mem: Memory = { runsByRepoCommit: {}, recipes: { ...DEFAULT_RECIPES }, doNot: [] };
let saveTimer: NodeJS.Timeout | undefined;

export async function loadMemory() {
  const m = await readJson("memory.json");
  if (m) mem = { runsByRepoCommit: m.runsByRepoCommit ?? {}, recipes: { ...DEFAULT_RECIPES, ...m.recipes }, doNot: m.doNot ?? [] };
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeJson("memory.json", mem), 500);
}

export function memoryJson(): string {
  return JSON.stringify({ recipes: mem.recipes, doNot: mem.doNot });
}

export function repoKey(repoUrl: string, sha: string): string | null {
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  return m ? `${m[1]}/${m[2]}@${sha}`.toLowerCase() : null;
}

export async function headSha(repoUrl: string): Promise<string | null> {
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/i);
  if (!m) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/commits/HEAD`, {
      headers: { Accept: "application/vnd.github.sha", "User-Agent": "crew" },
      signal: AbortSignal.timeout(3000),
    });
    return r.ok ? (await r.text()).trim() : null;
  } catch {
    return null;
  }
}

export function lookup(key: string | null): { runId: string; score: number } | null {
  return key ? mem.runsByRepoCommit[key] ?? null : null;
}

export function learnFromEvent(s: RunState, e: Event) {
  if (e.type === "install.done" && e.ok && e.manager && e.command) {
    if (mem.recipes[e.manager] !== e.command) {
      mem.recipes[e.manager] = e.command;
      save();
    }
  }
  if (e.type === "finding.dropped" && e.reason === "classifier_disagreed") {
    const f = s.findings.find((x) => x.id === e.findingId);
    if (f?.note) {
      mem.doNot = [`do not report: ${f.note}`, ...mem.doNot].slice(0, 3);
      save();
    }
  }
  if (e.type === "run.finished" && e.status === "complete" && s.profile.commit) {
    const key = repoKey(s.repoUrl, s.profile.commit);
    if (key && s.findings.length > 0) {
      mem.runsByRepoCommit[key] = { runId: s.id, score: s.score.total };
      save();
    }
  }
}
