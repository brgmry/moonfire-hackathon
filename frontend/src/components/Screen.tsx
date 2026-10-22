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

function Avatar({ a, rects, W, idx, now, onClick }: { a: Agent; rects: Record<string, Rect>; W: number; idx: number; now: number; onClick?: () => void }) {
  const r = a.chunkId ? rects[a.chunkId] : undefined;
  const target = r ? { x: r.x + 4 + (idx % 3) * 14, y: r.y + 12 } : { x: W / 2 - 18, y: 4 };
  const [pos, setPos] = useState({ x: W / 2 - 6, y: 8 });
  useLayoutEffect(() => { const id = requestAnimationFrame(() => setPos(target)); return () => cancelAnimationFrame(id); }, [target.x, target.y]);
  const found = !!a.lastFoundAt && now - Date.parse(a.lastFoundAt) < 1200;
  const frame = found ? "found" : a.status === "done" ? "idle" : (Math.floor(now / 250) % 2 ? "working" : "idle");
  const tip = `${a.role}${a.chunkId ? " on " + a.chunkId.replace(/^c_?/, "") : ""}${a.file ? ", reading " + a.file : ""} (${a.model}${a.status === "done" ? ", done" : ""})`;
  return <Sprite role={a.role} frame={frame} className={`${a.status === "done" ? "done" : ""} ${found ? "found" : ""} ${onClick ? "clickable" : ""}`} style={{ left: pos.x, top: pos.y }} title={tip} onClick={onClick} />;
}

export function Screen({ state, now, grid = true, off = false, selChunk, pulse, onChunk, onWake }: { state: RunState; now: number; grid?: boolean; off?: boolean; selChunk?: string | null; pulse?: string | null; onChunk?: (chunkId: string) => void; onWake?: () => void }) {
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
    <div className={`screen ${state.screenshotUrl ? "shot" : ""} ${grid ? "" : "nogrid"} ${off ? "off" : ""}`} ref={ref} style={state.screenshotUrl ? { backgroundImage: `url(${state.screenshotUrl})` } : undefined} onClick={off ? onWake : undefined}>
      {off && <div className="boot" data-tip="click to wake">&gt; it is now safe to turn off your crew.<br />&gt; (it kept running anyway) <span className="cur" /></div>}
      {!off && booting && (
        <div className="boot">
          README vs Reality 1.0<br />
          {!state.repoUrl && <>&gt; waiting for a repo <span className="cur" /></>}
          {state.repoUrl && !p && <>&gt; git clone {state.repoUrl} --depth 50 <span className="cur" /></>}
          {p && <>&gt; {p.name} · ★{p.stars} · {Object.entries(p.languages).map(([k, v]) => `${k} ${v}`).join(" · ")} · {p.fileCount} files<br /></>}
          {p && !state.install && <>&gt; installing <span className="cur" /></>}
          {state.install && <>&gt; {state.install.manager} install {state.install.ok ? "ok" : "failed"} in {Math.round(state.install.durationMs / 1000)}s<br />&gt; chunking <span className="cur" /></>}
        </div>
      )}
      {!off && !state.screenshotUrl && state.chunks.map((c) => {
        const r = rects[c.id]; if (!r) return null;
        const hot = state.recent.hotChunks[c.id] && now - Date.parse(state.recent.hotChunks[c.id]) < 900;
        const mem = state.memoryHits.includes(c.id);
        const n = state.findings.filter((f) => f.valid && f.chunkId === c.id).length;
        const tip = `${c.path}: ${c.files.length} files, ${(c.bytes / 1000).toFixed(0)}KB, ${n} finding${n === 1 ? "" : "s"}${c.sampled ? ", sampled (not explored)" : ""}${mem ? ", from memory" : ""}. click to filter evidence`;
        return <button type="button" key={c.id} className={`tile ${c.sampled ? "sampled" : ""} ${hot || pulse === c.id ? "hot" : ""} ${mem ? "memory" : ""} ${selChunk === c.id ? "sel" : ""}`} style={{ left: r.x, top: r.y, width: Math.max(0, r.w - 1), height: Math.max(0, r.h - 1) }} title={tip} onClick={() => onChunk?.(c.id)}>{c.path}</button>;
      })}
      {!off && flyers.map((a, i) => <Avatar key={a.agentId} a={a} rects={rects} W={size.W} idx={i} now={now} onClick={a.chunkId ? () => onChunk?.(a.chunkId!) : undefined} />)}
      {!off && bubbles.map(({ f, finding }) => {
        const a = state.agents[finding!.agentId];
        const r = a?.chunkId ? rects[a.chunkId] : undefined;
        const x = r ? Math.min(r.x + 6, size.W * 0.5) : 8, y = r ? Math.max(0, r.y - 18) : 24;
        return <div key={f.id} className={`bub ${finding!.severity}`} style={{ left: x, top: y }}>{finding!.file.split("/").pop()}:{finding!.line} {finding!.note}</div>;
      })}
      {!off && <div className="dock">
        {docked.map((a) => { const found = !!a.lastFoundAt && now - Date.parse(a.lastFoundAt) < 1200; return <Sprite key={a.agentId} role={a.role} scale={1.25} frame={found ? "found" : a.status === "done" ? "idle" : (Math.floor(now / 250) % 2 ? "working" : "idle")} className={a.status === "done" ? "done" : ""} title={`${a.role} (${a.model}${a.status === "done" ? ", done" : ", working"})`} />; })}
        {state.compile && <span className="lbl" title={state.compile.command ? `ran: ${state.compile.command}` : "compile result"}>builds {state.compile.compiles ? `${Math.round(state.compile.durationMs / 1000)}s ${(state.compile.buildSizeBytes / 1e6).toFixed(1)}MB ${state.compile.warnings} warn` : "FAIL"}</span>}
        {state.run && <span className="lbl" title={state.run.errorsTail ? `last error: ${state.run.errorsTail}` : "run result"}>{state.run.kind === "api" ? `endpoints ${state.run.endpointsOk}/${state.run.endpointsTotal}` : `tests ${state.run.testsPassed}/${state.run.testsPassed + state.run.testsFailed}`}</span>}
        {state.claims.length > 0 && <span className="lbl" title="README claims delivered in full">claims {state.claims.filter((c) => c.status === "delivered").length}/{state.claims.length}</span>}
      </div>}
    </div>
  );
}
