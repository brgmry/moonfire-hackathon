import "./env.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { serve } from "@hono/node-server";
import { activeRuns, appendEvent, createRun, getRun, listRuns, newRunId, restore, subscribe } from "./runs.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { headSha, loadMemory, lookup, repoKey } from "./memory.js";
import { pickRunner } from "./runner/index.js";
import { loadKeys, publicView } from "./keys.js";
import type { Event, RunState } from "./types.js";

const PORT = Number(process.env.PORT ?? 8080);
const INTERNAL_TOKEN = (process.env.INTERNAL_TOKEN ?? "dev").trim();
const ORIGINS = (process.env.CORS_ORIGIN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const runner = pickRunner();

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (ORIGINS.includes("*") || ORIGINS.includes(origin)) return origin;
      if (origin.startsWith("http://localhost:") || origin.endsWith(".vercel.app")) return origin;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

// Site gate: when SITE_TOKEN is set, every public route needs it, as a bearer header or ?token= (EventSource cannot set headers).
// /health and /internal/* are excluded: Cloud Run probes the first, sandboxes authenticate on the second with their own tokens.
const SITE_TOKEN = (process.env.SITE_TOKEN ?? "").trim();
app.use("*", async (c, next) => {
  if (!SITE_TOKEN || c.req.method === "OPTIONS") return next();
  const path = new URL(c.req.url).pathname;
  if (path === "/health" || path === "/healthz" || path.startsWith("/internal/")) return next();
  const given = (c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.query("token") ?? "").trim();
  const a = Buffer.from(given), b = Buffer.from(SITE_TOKEN);
  if (a.length === b.length && timingSafeEqual(a, b)) return next();
  return c.json({ error: "password required" }, 401);
});

app.get("/healthz", (c) => c.text("ok"));
// Cloud Run's front end answers /healthz itself, so probe /health there.
app.get("/health", (c) => c.text("ok"));

// Credit left per key, no secrets.
app.get("/keys", (c) => c.json(publicView()));

app.get("/runs", (c) =>
  c.json(listRuns().map((s) => ({ id: s.id, repoUrl: s.repoUrl, status: s.status, score: s.score.total, lastSeq: s.lastSeq }))),
);

// Whatever a person pastes from GitHub (a ?tab= link, a file under /blob/, an issue, /tree/<ref>/sub/dir,
// http, no scheme) becomes https://github.com/<owner>/<repo>, plus /tree/<ref> or #<sha> when pinned.
export function normalizeRepoUrl(raw: string): { url: string; owner: string; repo: string } | null {
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const [owner, repoSeg, kind, ref] = u.pathname.split("/").filter(Boolean);
  if (!owner || !repoSeg) return null;
  let [repo, atRef] = repoSeg.replace(/\.git$/i, "").split("@");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
  const hashSha = /^#[0-9a-f]{7,40}$/i.test(u.hash) ? u.hash.slice(1) : undefined;
  const pin = hashSha ?? atRef ?? (["tree", "commit", "blob"].includes(kind ?? "") ? ref : undefined);
  const base = `https://github.com/${owner}/${repo}`;
  const url = !pin ? base : /^[0-9a-f]{7,40}$/i.test(pin) ? `${base}#${pin}` : `${base}/tree/${pin}`;
  return { url, owner, repo };
}

// 404 means missing or private: say so now instead of a sandbox failing to clone. Rate limits pass.
async function repoExists(owner: string, repo: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "User-Agent": "crew" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, signal: AbortSignal.timeout(3000) });
    return r.status !== 404;
  } catch {
    return true;
  }
}

// Anyone with the link can start a run, and each costs real credit: cap runs per network and in flight.
const MAX_ACTIVE = Number(process.env.MAX_ACTIVE_RUNS ?? 6);
const PER_IP_PER_HOUR = Number(process.env.RUNS_PER_IP_PER_HOUR ?? 10);
const startsByIp = new Map<string, number[]>();

app.post("/runs", async (c) => {
  const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now();
  const starts = (startsByIp.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (starts.length >= PER_IP_PER_HOUR) return c.json({ error: `${starts.length} runs from your network in the last hour; try again later` }, 429);
  if (activeRuns() >= MAX_ACTIVE) return c.json({ error: `the crew is busy with ${MAX_ACTIVE} runs; try again in a minute` }, 429);
  const body = await c.req.json().catch(() => ({}));
  const parsed = normalizeRepoUrl(String(body.repoUrl ?? ""));
  if (!parsed) return c.json({ error: "paste a GitHub repo link, like https://github.com/owner/repo" }, 400);
  if (process.env.RUNNER !== "mock" && !(await repoExists(parsed.owner, parsed.repo)))
    return c.json({ error: `github.com/${parsed.owner}/${parsed.repo} was not found, or it is private` }, 400);
  const repoUrl = parsed.url;
  starts.push(now);
  startsByIp.set(ip, starts);
  const id = newRunId();
  const run = createRun(id, repoUrl, body.by);
  appendEvent(id, { type: "run.created", repoUrl, by: body.by ?? "anon" });
  void start(run.state, Boolean(body.fresh));
  return c.json({ id });
});

// Same repo at the same commit: replay what the crew found last time instead of starting a sandbox.
async function start(s: RunState, fresh: boolean) {
  if (!fresh && process.env.MEMORY !== "off") {
    const sha = await headSha(s.repoUrl);
    const hit = lookup(sha ? repoKey(s.repoUrl, sha) : null);
    const old = hit ? getRun(hit.runId) : undefined;
    if (old && old.state.id !== s.id) return replayMemory(s, old.events);
  }
  await runner.start(s);
}

const REPLAYED = new Set(["repo.profile", "install.done", "chunk.created", "agent.spawned", "agent.done", "finding.added", "finding.dropped", "claim.added", "compile.done", "run.done", "app.screenshot", "contributors"]);

async function replayMemory(s: RunState, events: Event[]) {
  appendEvent(s.id, { type: "sandbox.started", executionId: "memory", runner: "mock" });
  const sourceRun = events[0]?.runId;
  const hitChunks = new Set<string>();
  for (const e of events) {
    if (!REPLAYED.has(e.type)) continue;
    if (e.type === "finding.dropped" && e.reason !== "classifier_disagreed") continue;
    const { seq, ts, runId, ...rest } = e;
    if (e.type === "agent.done") rest.tokens = { in: 0, out: 0, cacheRead: 0 };
    await new Promise((r) => setTimeout(r, e.type === "finding.added" ? 60 : 30));
    appendEvent(s.id, rest);
    if (e.type === "chunk.created" && !hitChunks.has(e.chunk.id)) {
      hitChunks.add(e.chunk.id);
      appendEvent(s.id, { type: "memory.hit", chunkId: e.chunk.id, source: `run ${sourceRun}` });
    }
  }
}

app.get("/runs/:id", (c) => {
  const run = getRun(c.req.param("id"));
  // events let the frontend rebuild state with the shared reducer in packages/contract.
  return run ? c.json({ ...run.state, events: run.events }) : c.json({ error: "not found" }, 404);
});

app.get("/runs/:id/events", (c) => {
  const id = c.req.param("id");
  const run = getRun(id);
  if (!run) return c.json({ error: "not found" }, 404);
  const name = c.req.query("name")?.slice(0, 40);
  const after = Number(c.req.header("Last-Event-ID") ?? c.req.query("after") ?? 0) || 0;
  c.header("Cache-Control", "no-cache");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    // run.events is ordered by seq; the writer walks it, woken by each new event.
    let i = run.events.findIndex((e) => e.seq > after);
    if (i < 0) i = run.events.length;
    let wake: (() => void) | null = null;
    let closed = false;
    const unsub = subscribe(id, () => wake?.());
    const ping = setInterval(() => void stream.write(": ping\n\n").catch(() => {}), 30_000);
    stream.onAbort(() => {
      closed = true;
      wake?.();
    });
    if (name) appendEvent(id, { type: "presence.join", name });
    try {
      while (!closed) {
        while (i < run.events.length && !closed) {
          const e = run.events[i++];
          await stream.writeSSE({ id: String(e.seq), data: JSON.stringify(e) });
        }
        if (closed) break;
        await new Promise<void>((r) => (wake = r));
        wake = null;
      }
    } finally {
      clearInterval(ping);
      unsub();
      if (name) appendEvent(id, { type: "presence.leave", name });
    }
  });
});

app.post("/runs/:id/actions", async (c) => {
  const id = c.req.param("id");
  const run = getRun(id);
  if (!run) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (!["rerun_chunk", "pin"].includes(body.type)) return c.json({ error: "type must be rerun_chunk or pin" }, 400);
  appendEvent(id, { type: "action", action: body.type, chunkId: body.chunkId, findingId: body.findingId, by: body.by });
  if (body.type === "rerun_chunk" && body.chunkId) void runner.rerunChunk(run.state, body.chunkId);
  return c.json({ ok: true });
});

const BACKEND_ONLY = new Set(["run.created", "presence.join", "presence.leave", "sandbox.started", "score.updated", "report.ready", "memory.hit", "run.finished", "action"]);

// Each sandbox gets RUN_TOKEN = HMAC(INTERNAL_TOKEN, runId): a token stolen by repo code only reaches its own run.
export function runToken(runId: string): string {
  return createHmac("sha256", INTERNAL_TOKEN).update(runId).digest("hex");
}

function authorized(header: string | undefined, runId: string): boolean {
  const got = Buffer.from(header ?? "");
  return [`Bearer ${INTERNAL_TOKEN}`, `Bearer ${runToken(runId)}`].some((ok) => {
    const want = Buffer.from(ok);
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

app.post("/internal/events", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.runId || !Array.isArray(body.events)) return c.json({ error: "body must be { runId, events: [] }" }, 400);
  if (!authorized(c.req.header("Authorization"), String(body.runId))) return c.json({ error: "unauthorized" }, 401);
  // A run the backend did not start (a stub job, a manual test) gets created on first contact.
  if (!getRun(body.runId)) {
    createRun(body.runId, "");
    appendEvent(body.runId, { type: "run.created", repoUrl: body.events.find((e: any) => e.repoUrl)?.repoUrl ?? "", by: "sandbox" });
  }
  // The sandbox runs untrusted code: it may report what it saw, never the score, the report or the outcome.
  let seq = 0;
  for (const e of body.events) {
    if (!e || typeof e.type !== "string" || BACKEND_ONLY.has(e.type)) continue;
    if (e.type === "finding.dropped" && !["quote_not_found", "classifier_disagreed"].includes(e.reason)) continue;
    seq = appendEvent(body.runId, e).seq;
  }
  return c.json({ ok: true, seq });
});

const restored = await restore();
await loadMemory();
await loadKeys();
serve({ fetch: app.fetch, port: PORT }, () =>
  console.log(JSON.stringify({ severity: "INFO", msg: `backend on :${PORT}`, runner: process.env.RUNNER ?? "mock", restored })),
);
