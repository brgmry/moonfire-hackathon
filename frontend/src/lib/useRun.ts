"use client";
import { useEffect, useRef, useState } from "react";
import { apply, fromServerState, initialState, reduceAll, type RunEvent, type RunState } from "@rvr/contract";
import { API, authHeaders, live, viewerName, withToken } from "./api";
import { recordedState } from "./recorded";

/** One EventSource, one reducer, resync on focus. The only client state is what is on screen. */
export function useRun(id: string) {
  const [state, setState] = useState<RunState>(() => initialState(id));
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  // recorded: a finished run read from a static log, nothing is running. missing: no recording and no backend to ask.
  const [recorded, setRecorded] = useState(id === "demo");
  const [missing, setMissing] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let closed = false;
    let backoff = 500;
    if (id === "demo") {
      // Demo mode: replay the fixture in the browser, timed by its timestamps. Works with no backend at all.
      const timers: ReturnType<typeof setTimeout>[] = [];
      fetch("/fixtures/run.jsonl").then((r) => r.text()).then((txt) => {
        if (closed) return;
        const rows = txt.trim().split("\n").map((l) => JSON.parse(l) as RunEvent & { ts: string });
        const t0 = Date.parse(rows[0].ts);
        setConnected(true);
        rows.forEach((row, i) => {
          timers.push(setTimeout(() => {
            setState((s) => apply(s, { ...row, seq: i + 1, runId: "demo", ts: new Date().toISOString() }));
          }, Date.parse(row.ts) - t0));
        });
      }).catch(() => setConnected(false));
      return () => { closed = true; timers.forEach(clearTimeout); };
    }
    const resync = async () => {
      try {
        const r = await fetch(`${API}/runs/${id}`, { headers: authHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        setState((prev) => { const next = Array.isArray(j.events) ? reduceAll(id, j.events as RunEvent[]) : fromServerState(j, id); return { ...next, startedAt: next.startedAt ?? prev.startedAt, finishedAt: next.finishedAt ?? prev.finishedAt }; });
      } catch { /* backend away, the stream will catch up */ }
    };
    const open = () => {
      if (closed) return;
      const es = new EventSource(withToken(`${API}/runs/${id}/events?name=${encodeURIComponent(viewerName())}`));
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
    const onVis = () => { if (document.visibilityState === "visible") resync(); };
    // A recorded run is served as a static file and never touches the backend.
    recordedState(id).then((rec) => {
      if (closed) return;
      if (rec) { setState(rec); setRecorded(true); setConnected(true); return; }
      if (!live()) { setMissing(true); return; }
      open();
      document.addEventListener("visibilitychange", onVis);
    });
    return () => { closed = true; esRef.current?.close(); document.removeEventListener("visibilitychange", onVis); };
  }, [id]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  return { state, now, connected, recorded, missing };
}
