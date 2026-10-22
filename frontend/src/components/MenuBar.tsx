"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { RunState } from "@rvr/contract";

function fmtTok(n: number) { return n >= 1000 ? `${Math.round(n / 1000)}k tok` : `${n} tok`; }

export function MenuBar({ state, connected }: { state?: RunState; connected?: boolean }) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);
  const tok = state ? state.tokens.in + state.tokens.out : 0;
  return (
    <div className="menubar">
      <span className="logo" aria-hidden="true" />
      <Link href="/">{state?.profile?.name || "README vs Reality"}</Link>
      <span>File</span><span>Edit</span><span>Special</span>
      <span className="sp" />
      {state?.presence.map((p) => <span key={p} className="chip on">{p}</span>)}
      {state && <span className="chip">{fmtTok(tok)}</span>}
      {state && <span className="chip" title={connected ? "stream connected" : "reconnecting"}>{connected ? "live" : "…"}</span>}
      <span>{clock}</span>
    </div>
  );
}
