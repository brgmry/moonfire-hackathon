"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Agent, Chunk, RunState } from "@rvr/contract";
import { Sprite } from "./Sprite";

type Rect = { x: number; y: number; w: number; h: number };
const DOCK = 24;

/** Slice-and-dice treemap: alternating cuts, good enough to read and cheap to draw. */
function layout(chunks: Chunk[], W: number, H: number): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  const tot = chunks.reduce((a, c) => a + c.bytes, 0) || 1;
  let x = 0, y = 0, w = W, h = H, horiz = true, rem = tot;
  for (const c of chunks) {
    const frac = c.bytes / rem;
    let r: Rect;
    if (horiz) { const cw = w * frac; r = { x, y, w: cw, h }; x += cw; w -= cw; }
    else { const ch = h * frac; r = { x, y, w, h: ch }; y += ch; h -= ch; }
    rem -= c.bytes; horiz = !horiz; out[c.id] = r;
  }
  return out;
}

function Avatar({ a, rects, W, idx, now, onBubble }: { a: Agent; rects: Record<string, Rect>; W: number; idx: number; now: number; onBubble?: never }) {
  const r = a.chunkId ? rects[a.chunkId] : undefined;
  const target = r ? { x: r.x + 6 + (idx % 3) * 10, y: r.y + 12 } : { x: W / 2 - 6, y: 8 };
  const [pos, setPos] = useState({ x: W / 2 - 6, y: 8 });
  useLayoutEffect(() => { const id = requestAnimationFrame(() => setPos(target)); return () => cancelAnimationFrame(id); }, [target.x, target.y]);
  const found = a.lastFoundAt && now - Date.parse(a.lastFoundAt) < 1000;
  void onBubble;
  return <Sprite role={a.role} className={`${a.status === "done" ? "done" : ""} ${found ? "found" : ""}`} style={{ left: pos.x, top: pos.y }} title={`${a.role} ${a.chunkId ?? ""} ${a.file ?? ""}`.trim()} />;
}

export function Screen({ state, now }: { state: RunState; now: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 300, H: 200 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight - DOCK }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const rects = useMemo(() => layout(state.chunks, size.W, size.H), [state.chunks, size.W, size.H]);
  const agents = Object.values(state.agents);
  const flyers = agents.filter((a) => a.role === "orchestrator" || a.role === "explorer");
  const docked = agents.filter((a) => a.role !== "orchestrator" && a.role !== "explorer");
  const bubbles = state.recent.findings.filter((f) => now - Date.parse(f.ts) < 4000).slice(-6)
    .map((f) => ({ f, finding: state.findings.find((x) => x.id === f.id) }))
    .filter((b) => b.finding);
  const booting = state.chunks.length === 0;
  const p = state.profile;

  return (
    <div className={`screen ${state.screenshotUrl ? "shot" : ""}`} ref={ref} style={state.screenshotUrl ? { backgroundImage: `url(${state.screenshotUrl})` } : undefined}>
      {booting && (
        <div className="boot">
          README vs Reality 1.0<br />
          {!state.repoUrl && <>&gt; waiting for a repo <span className="cur" /></>}
          {state.repoUrl && !p && <>&gt; git clone {state.repoUrl} --depth 50 <span className="cur" /></>}
          {p && <>&gt; {p.name} · ★{p.stars} · {Object.entries(p.languages).map(([k, v]) => `${k} ${v}`).join(" · ")} · {p.fileCount} files<br /></>}
          {p && !state.install && <>&gt; installing <span className="cur" /></>}
          {state.install && <>&gt; {state.install.manager} install {state.install.ok ? "ok" : "failed"} in {Math.round(state.install.durationMs / 1000)}s<br />&gt; chunking <span className="cur" /></>}
        </div>
      )}
      {!state.screenshotUrl && state.chunks.map((c) => {
        const r = rects[c.id]; if (!r) return null;
        const hot = state.recent.hotChunks[c.id] && now - Date.parse(state.recent.hotChunks[c.id]) < 900;
        const mem = state.memoryHits.includes(c.id);
        return <div key={c.id} className={`tile ${c.sampled ? "sampled" : ""} ${hot ? "hot" : ""} ${mem ? "memory" : ""}`} style={{ left: r.x, top: r.y, width: Math.max(0, r.w - 1), height: Math.max(0, r.h - 1) }}>{c.path}</div>;
      })}
      {flyers.map((a, i) => <Avatar key={a.agentId} a={a} rects={rects} W={size.W} idx={i} now={now} />)}
      {bubbles.map(({ f, finding }) => {
        const a = state.agents[finding!.agentId];
        const r = a?.chunkId ? rects[a.chunkId] : undefined;
        const x = r ? Math.min(r.x + 6, size.W * 0.5) : 8, y = r ? Math.max(0, r.y - 14) : 24;
        return <div key={f.id} className={`bub ${finding!.severity}`} style={{ left: x, top: y }}>{finding!.file.split("/").pop()}:{finding!.line} {finding!.note}</div>;
      })}
      <div className="dock">
        {docked.map((a) => <Sprite key={a.agentId} role={a.role} className={a.status === "done" ? "done" : ""} title={a.role} />)}
        {state.compile && <span className="lbl">builds {state.compile.compiles ? `${Math.round(state.compile.durationMs / 1000)}s ${(state.compile.buildSizeBytes / 1e6).toFixed(1)}MB ${state.compile.warnings} warn` : "FAIL"}</span>}
        {state.run && <span className="lbl">{state.run.kind === "api" ? `endpoints ${state.run.endpointsOk}/${state.run.endpointsTotal}` : `tests ${state.run.testsPassed}/${state.run.testsPassed + state.run.testsFailed}`}</span>}
        {state.claims.length > 0 && <span className="lbl">claims {state.claims.filter((c) => c.status === "delivered").length}/{state.claims.length}</span>}
      </div>
    </div>
  );
}
