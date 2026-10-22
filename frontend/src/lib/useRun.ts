"use client";
import { useEffect, useRef, useState } from "react";
import { apply, initialState, reduceAll, type RunEvent, type RunState } from "@rvr/contract";
import { API, viewerName } from "./api";

/** One EventSource, one reducer, resync on focus. The only client state is what is on screen. */
export function useRun(id: string) {
  const [state, setState] = useState<RunState>(() => initialState(id));
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let closed = false;
    let backoff = 500;
    const resync = async () => {
      try {
        const r = await fetch(`${API}/runs/${id}`);
        if (!r.ok) return;
        const j = await r.json();
        setState(Array.isArray(j.events) ? reduceAll(id, j.events as RunEvent[]) : (j as RunState));
      } catch { /* backend away, the stream will catch up */ }
    };
    const open = () => {
      if (closed) return;
      const es = new EventSource(`${API}/runs/${id}/events?name=${encodeURIComponent(viewerName())}`);
      esRef.current = es;
      es.onopen = () => { setConnected(true); backoff = 500; };
      es.onmessage = (m) => {
        try { const e = JSON.parse(m.data) as RunEvent; setState((s) => apply(s, e)); } catch { /* ignore a bad line */ }
      };
      es.onerror = () => {
        setConnected(false); es.close();
        setTimeout(() => { resync().then(open); }, backoff);
        backoff = Math.min(backoff * 2, 8000);
      };
    };
    open();
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { closed = true; esRef.current?.close(); document.removeEventListener("visibilitychange", onVis); };
  }, [id]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  return { state, now, connected };
}
