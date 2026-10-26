"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { RunState } from "@rvr/contract";

export type MenuItem = { label: string; onClick?: () => void; disabled?: boolean; tip?: string; sep?: boolean; checked?: boolean };
export type Menus = Record<"File" | "Edit" | "Special", MenuItem[]>;

function fmtTok(n: number) { return n >= 1000 ? `${Math.round(n / 1000)}k tok` : `${n} tok`; }
export function fmtDur(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function Timer({ state }: { state: RunState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (state.finishedAt) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [state.finishedAt]);
  if (!state.startedAt) return null;
  const end = state.finishedAt ? Date.parse(state.finishedAt) : now;
  const ms = end - Date.parse(state.startedAt);
  const done = !!state.finishedAt;
  return <span className={`chip timer ${done ? "on" : ""}`} data-tip={done ? `finished in ${fmtDur(ms)}, from first event to run.finished` : "running: time since the first event"}>⏱ {fmtDur(ms)}</span>;
}

export function MenuBar({ state, connected, recorded, menus, title }: { state?: RunState; connected?: boolean; recorded?: boolean; menus?: Menus; title?: string }) {
  const [clock, setClock] = useState("");
  const [open, setOpen] = useState<keyof Menus | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  const tok = state ? state.tokens.in + state.tokens.out : 0;
  const cache = state && state.tokens.in ? Math.round((100 * state.tokens.cacheRead) / state.tokens.in) : 0;
  const names = (Object.keys(menus ?? {}) as (keyof Menus)[]);
  return (
    <div className="menubar" ref={ref}>
      <Link href="/" className="logo" aria-label="home" data-tip="back to the main screen" />
      <Link href="/" data-tip="back to the main screen">{title ?? state?.profile?.name ?? "README vs Reality"}</Link>
      {names.map((n) => (
        <span key={n} className={`menu ${open === n ? "open" : ""}`}>
          <button type="button" className="mtitle" onClick={() => setOpen(open === n ? null : n)} onMouseEnter={() => { if (open) setOpen(n); }} aria-haspopup="menu" aria-expanded={open === n}>{n}</button>
          {open === n && (
            <div className="dropdown" role="menu">
              {menus![n].map((it, i) => it.sep ? <hr key={i} /> : (
                <button key={i} type="button" role="menuitem" disabled={it.disabled} data-tip={it.tip} onClick={() => { setOpen(null); it.onClick?.(); }}>
                  <span className="chk">{it.checked ? "✓" : ""}</span>{it.label}
                </button>
              ))}
            </div>
          )}
        </span>
      ))}
      <span className="sp" />
      {state?.presence.map((p) => <span key={p} className="chip on" data-tip={`${p} has this run open`}>{p}</span>)}
      {state && <Timer state={state} />}
      {state && <span className="chip" data-tip={`${state.tokens.in.toLocaleString()} in, ${state.tokens.out.toLocaleString()} out, ${cache}% served from cache`}>{fmtTok(tok)}</span>}
      {state && recorded && <span className="chip" data-tip="a recorded run, replayed from its event log: nothing is running and nothing is spent">recorded</span>}
      {state && !recorded && <span className={`chip ${connected ? "" : "off"}`} data-tip={connected ? "event stream connected" : "reconnecting to the backend"}>{connected ? "live" : "…"}</span>}
      <span data-tip="it is always 1984 somewhere">{clock}</span>
    </div>
  );
}
