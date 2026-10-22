// Fixture backend. Same API as specs/00-contract.md, fed by frontend/fixtures/run.jsonl (flat payloads, ts carries timing).
// Usage: npm run fixture   (listens on :4000). POST /runs starts a new replay; every client sees the same run.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reduceAll } from '../../packages/contract/src/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(path.join(here, '../fixtures/run.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const lines = raw.map((event, i) => ({ delayMs: i === 0 ? 0 : Date.parse(event.ts) - Date.parse(raw[i - 1].ts), event }));
const PORT = Number(process.env.PORT || 4000);
const runs = new Map(); // id -> { events: [], clients: Set, timers: [] }

function startRun(id, repoUrl, by) {
  const run = { id, events: [], clients: new Set(), timers: [] };
  runs.set(id, run);
  let t = 0;
  for (const { delayMs, event } of lines) {
    t += delayMs;
    run.timers.push(setTimeout(() => {
      const { ts: _ts, ...rest } = event; void _ts;
      const e = { ...rest, runId: id, seq: run.events.length + 1, ts: new Date().toISOString() };
      if (e.type === 'run.created') { e.repoUrl = repoUrl; e.by = by; }
      run.events.push(e);
      const line = `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`;
      for (const res of run.clients) res.write(line);
    }, t));
  }
  return run;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function json(res, code, body) { cors(res); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  if (url.pathname === '/healthz') { cors(res); return res.end('ok'); }
  if (req.method === 'POST' && url.pathname === '/runs') {
    const { repoUrl = 'https://github.com/acme/pulse-cli', by = 'anon' } = await body(req);
    const id = 'r_' + Math.random().toString(36).slice(2, 6);
    startRun(id, repoUrl, by);
    return json(res, 201, { id });
  }
  const m = url.pathname.match(/^\/runs\/([^/]+)(\/events|\/actions)?$/);
  if (!m) return json(res, 404, { error: 'not found' });
  let run = runs.get(m[1]) || (m[1] === 'demo' ? startRun('demo', 'https://github.com/acme/pulse-cli', 'Bergen') : null);
  if (!run) return json(res, 404, { error: 'no such run' });
  if (m[2] === '/events') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    for (const e of run.events) res.write(`data: ${JSON.stringify(e)}\n\n`);
    run.clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 30000);
    req.on('close', () => { clearInterval(ping); run.clients.delete(res); });
    return;
  }
  if (m[2] === '/actions' && req.method === 'POST') {
    const a = await body(req);
    const e = { type: 'presence.join', name: `${a.by || 'someone'} (${a.type})`, runId: run.id, seq: run.events.length + 1, ts: new Date().toISOString() };
    run.events.push(e);
    for (const c of run.clients) c.write(`data: ${JSON.stringify(e)}\n\n`);
    return json(res, 200, { ok: true });
  }
  return json(res, 200, reduceAll(run.id, run.events));
}).listen(PORT, () => console.log(`fixture backend on http://localhost:${PORT}  (open /run/demo in the frontend)`));
