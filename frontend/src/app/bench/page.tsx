"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DIMENSIONS, fromServerState, type Dimension, type RunState } from "@rvr/contract";
import { API, live, viewerName } from "@/lib/api";
import { recordedRuns, recordedState } from "@/lib/recorded";
import { MenuBar, type Menus } from "@/components/MenuBar";
import { Window } from "@/components/Window";

type Row = { id: string; repoUrl: string; status: string; score: number; detail?: RunState };
type BenchRepo = { url: string; tier: string; language: string; stars: number; why: string; risk: string };

const short = (u: string) => u.replace(/^https?:\/\/github\.com\//, "").replace(/\/tree\/.*$/, "").replace(/\.git$/, "");
const q = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

export default function Bench() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [repos, setRepos] = useState<BenchRepo[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [queue, setQueue] = useState<{ total: number; done: number; running: boolean; armed: boolean; n: number }>({ total: 0, done: 0, running: false, armed: false, n: 10 });
  const [toast, setToast] = useState("");
  const detailsRef = useRef<Record<string, RunState>>({});

  const [isLive, setIsLive] = useState(false);
  const recordedRef = useRef<Row[] | null>(null);
  const load = useCallback(async () => {
    // Recorded runs are static files, so they are always on the board; the backend's runs join them for a logged-in team.
    if (!recordedRef.current) {
      const recs = await recordedRuns();
      const got = await Promise.all(recs.map(async (x): Promise<Row | null> => { const d = await recordedState(x.id); return d ? { id: x.id, repoUrl: x.repoUrl, status: d.status, score: d.score.total, detail: d } : null; }));
      recordedRef.current = got.filter((r): r is Row => r !== null);
    }
    const rec = recordedRef.current;
    if (!live()) { setRows(rec); return; }
    try {
      const r = await fetch(`${API}/runs`); if (!r.ok) { setRows(rec); return; }
      const list = ((await r.json()) as Row[]).filter((x) => !rec.some((y) => y.id === x.id));
      const want = list.filter((x) => x.status !== "created" && !detailsRef.current[x.id]).slice(0, 120);
      let i = 0;
      await Promise.all(Array.from({ length: 6 }, async () => { while (i < want.length) { const x = want[i++]; try { const d = await fetch(`${API}/runs/${x.id}`); if (d.ok) detailsRef.current[x.id] = fromServerState(await d.json(), x.id); } catch { /* skip */ } } }));
      setRows([...rec, ...list.map((x) => ({ ...x, score: Number(x.score) || 0, detail: detailsRef.current[x.id] }))]);
    } catch { setRows(rec); /* backend away */ }
  }, []);
  useEffect(() => { load(); setIsLive(live()); if (!live()) return; const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  useEffect(() => { fetch("/bench-repos.json").then((r) => (r.ok ? r.json() : [])).then(setRepos).catch(() => setRepos([])); }, []);

  const done = useMemo(() => rows.filter((r) => (r.status === "complete" || r.status === "partial") && r.score > 0), [rows]);
  const scores = done.map((r) => r.score);
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const buckets = useMemo(() => { const b = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, hi: i * 10 + 10, runs: [] as Row[] })); for (const r of done) b[Math.min(9, Math.floor(r.score / 10))].runs.push(r); return b; }, [done]);
  const maxB = Math.max(1, ...buckets.map((b) => b.runs.length));
  const dimMeans = useMemo(() => DIMENSIONS.map(({ key, max, label }) => { const xs = done.map((r) => r.detail?.score.dimensions[key as Dimension]?.points).filter((x): x is number => typeof x === "number"); return { key, label, max, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0, n: xs.length }; }), [done]);
  const cost = done.reduce((a, r) => a + (r.detail?.tokens.costGbp ?? 0), 0);
  const tokens = done.reduce((a, r) => a + (r.detail?.tokens.in ?? 0) + (r.detail?.tokens.out ?? 0), 0);
  const findings = done.reduce((a, r) => a + (r.detail?.findings.filter((f) => f.valid).length ?? 0), 0);
  const dropped = done.reduce((a, r) => a + (r.detail?.findings.filter((f) => !f.valid).length ?? 0), 0);
  const langs = useMemo(() => { const m: Record<string, number> = {}; for (const r of done) { const l = r.detail?.profile?.languages; if (l) { const top = Object.entries(l).sort((a, b) => b[1] - a[1])[0]?.[0]; if (top) m[top] = (m[top] ?? 0) + 1; } } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6); }, [done]);
  const ranked = useMemo(() => [...done].sort((a, b) => b.score - a.score), [done]);
  const pct = (s: number) => scores.length > 1 ? Math.round((100 * scores.filter((x) => x < s).length) / (scores.length - 1)) : 100;
  const running = rows.filter((r) => r.status === "running" || r.status === "created").length;
  const weakest = (r: Row) => { const d = r.detail?.score.dimensions; if (!d) return ""; let w: string | null = null, wr = 2; for (const { key, max, label } of DIMENSIONS) { const p = d[key as Dimension]?.points; if (typeof p === "number" && p / max < wr) { wr = p / max; w = label; } } return w ?? ""; };

  const startQueue = async () => {
    const already = new Set(rows.map((r) => short(r.repoUrl)));
    const todo = repos.filter((r) => !already.has(short(r.url))).slice(0, queue.n);
    setQueue((s) => ({ ...s, total: todo.length, done: 0, running: true, armed: false }));
    let i = 0, finished = 0;
    await Promise.all(Array.from({ length: 2 }, async () => { while (i < todo.length) { const r = todo[i++]; try { await fetch(`${API}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repoUrl: r.url, by: `bench/${viewerName()}` }) }); } catch { /* skip */ } finished++; setQueue((s) => ({ ...s, done: finished })); await new Promise((res) => setTimeout(res, 4000)); } }));
    setQueue((s) => ({ ...s, running: false })); setToast(`${todo.length} queued`); setTimeout(() => setToast(""), 2000); load();
  };

  const menus: Menus = {
    File: [{ label: "New run…", onClick: () => router.push("/") }, { label: "Run the demo", onClick: () => router.push("/run/demo") }, { label: "The pitch", onClick: () => router.push("/pitch") }],
    Edit: [{ label: "Copy table as CSV", onClick: () => { navigator.clipboard?.writeText(["rank,repo,score,status,url", ...ranked.map((r, i) => `${i + 1},${short(r.repoUrl)},${r.score},${r.status},${r.repoUrl}`)].join("\n")).catch(() => {}); } }, { label: "Refresh", onClick: load }],
    Special: [{ label: "Clear bucket filter", disabled: sel === null, onClick: () => setSel(null) }],
  };
  const shown = sel === null ? ranked : ranked.filter((r) => Math.min(9, Math.floor(r.score / 10)) === sel);
  const [ready, setReady] = useState(false);
  useEffect(() => { load().then(() => setReady(true)); }, [load]);

  // No backend and nothing recorded: say so rather than draw a board of zeros.
  if (ready && !isLive && rows.length === 0) return (
    <div className="desk">
      <MenuBar menus={menus} title="Benchmark" />
      <div className="grid">
        <Window title="The benchmark is offline" className="home score">
          <p>The benchmark ranked every repo the crew scored on Google Cloud. That backend was switched off after Build Night, and its runs went with it.</p>
          <p><a href="/run/demo">Watch the recorded demo</a>, or score repos yourself with your own key: <a href="https://github.com/brgmry/readme-vs-reality#try-it">run it locally</a>.</p>
        </Window>
      </div>
    </div>
  );

  return (
    <div className="desk">
      <MenuBar menus={menus} title="Benchmark" />
      <div className="bench">
        <Window title="The field" className="b1" tip={isLive ? "every run on the backend, refreshed every 10 seconds" : "every recorded run"}>
          <div className="tiles">
            <div data-tip="runs with a score"><b>{done.length}</b><span>scored</span></div>
            <div data-tip="still in the sandbox"><b>{running}</b><span>running</span></div>
            <div data-tip="mean score"><b>{mean.toFixed(1)}</b><span>mean</span></div>
            <div data-tip="median score"><b>{q(scores, 0.5).toFixed(1)}</b><span>median</span></div>
            <div data-tip="top decile starts here"><b>{q(scores, 0.9).toFixed(0)}</b><span>p90</span></div>
            <div data-tip="valid findings across all runs, and how many the validator or classifier dropped"><b>{findings}</b><span>findings · {dropped} dropped</span></div>
            <div data-tip="tokens in plus out, all runs"><b>{tokens >= 1e6 ? (tokens / 1e6).toFixed(1) + "M" : Math.round(tokens / 1000) + "k"}</b><span>tokens</span></div>
            <div data-tip="sum of per-run cost where the backend reported it"><b>£{cost.toFixed(2)}</b><span>spent</span></div>
          </div>
        </Window>

        <Window title="Score distribution" className="b2" tip="click a bar to filter the table">
          <div className="hist" role="img" aria-label={`histogram of ${done.length} scores`}>
            {buckets.map((b, i) => (
              <button type="button" key={i} className={`hb ${sel === i ? "sel" : ""}`} onClick={() => setSel(sel === i ? null : i)} data-tip={`${b.lo} to ${b.hi}: ${b.runs.length} repo${b.runs.length === 1 ? "" : "s"}${b.runs.length ? " · " + b.runs.slice(0, 4).map((r) => short(r.repoUrl)).join(", ") + (b.runs.length > 4 ? "…" : "") : ""}`}>
                <span className="n">{b.runs.length || ""}</span>
                <i style={{ height: `${(100 * b.runs.length) / maxB}%` }} />
                <span className="lbl">{b.lo}</span>
              </button>
            ))}
          </div>
          <div className="meanline" data-tip="mean"><span style={{ left: `${mean}%` }} /></div>
        </Window>

        <Window title="Where repos lose points" className="b3" tip="mean points per dimension, as a share of the maximum">
          <div className="dims">
            {dimMeans.map((d) => (
              <div key={d.key} className="mini" data-tip={`${d.label}: mean ${d.mean.toFixed(1)} of ${d.max} over ${d.n} runs`}>
                <span>{d.label}</span><span className="bar"><i style={{ width: `${(100 * d.mean) / d.max}%` }} /></span><span className="v">{d.mean.toFixed(1)}/{d.max}</span>
              </div>
            ))}
          </div>
          {langs.length > 0 && <div className="langs">{langs.map(([l, n]) => <span key={l} className="chip" data-tip={`${n} repos where ${l} is the main language`}>{l} {n}</span>)}</div>}
        </Window>

        <Window title="Bulk run" className="b4" tip="queue repos from infra/bench-repos.json, two at a time">
          {!isLive && <div className="empty">Bulk runs start real sandboxes, so they only run on your own laptop with your own key: <a href="https://github.com/brgmry/readme-vs-reality#try-it">run it locally</a>.</div>}
          {isLive && repos.length === 0 && <div className="empty">no repo list yet (infra/bench-repos.json)</div>}
          {isLive && repos.length > 0 && (
            <div className="bulk">
              <div className="empty">{repos.length} curated repos: {["tiny", "mid", "famous"].map((t) => `${repos.filter((r) => r.tier === t).length} ${t}`).join(", ")}</div>
              <label htmlFor="n">queue <input id="n" type="number" min={1} max={repos.length} value={queue.n} onChange={(e) => setQueue((s) => ({ ...s, n: Math.max(1, Math.min(repos.length, Number(e.target.value) || 1)) }))} /> repos, about £{(queue.n * 0.75).toFixed(0)}</label>
              {!queue.armed && !queue.running && <button type="button" onClick={() => setQueue((s) => ({ ...s, armed: true }))} data-tip="starts real Cloud Run jobs on the team key">queue batch</button>}
              {queue.armed && <div className="confirm"><span>sure? this spends real money</span><button type="button" onClick={startQueue}>yes, run {queue.n}</button><button type="button" onClick={() => setQueue((s) => ({ ...s, armed: false }))}>no</button></div>}
              {queue.running && <div className="prog"><i style={{ width: `${(100 * queue.done) / Math.max(1, queue.total)}%` }} /><span>{queue.done}/{queue.total} queued</span></div>}
            </div>
          )}
        </Window>

        <Window title={`Ranked${sel !== null ? ` · ${sel * 10} to ${sel * 10 + 10}` : ""}`} className="b5" tip="click a row to open the run">
          <table className="rank">
            <thead><tr><th>#</th><th>repo</th><th>score</th><th>pct</th><th>weakest</th><th>findings</th><th>authors</th><th>status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => router.push(`/run/${r.id}`)} data-tip={r.detail?.report ? r.detail.report.slice(0, 160) + "…" : "open the run"}>
                  <td className="n">{ranked.indexOf(r) + 1}</td>
                  <td>{short(r.repoUrl)}</td>
                  <td className="n"><b>{r.score.toFixed(1)}</b></td>
                  <td className="n">{pct(r.score)}</td>
                  <td>{weakest(r)}</td>
                  <td className="n">{r.detail?.findings.filter((f) => f.valid).length ?? ""}</td>
                  <td className="n">{r.detail?.contributors?.authors.length ?? ""}</td>
                  <td><span className={`st ${r.status === "complete" ? "delivered" : "partial"}`}>{r.status}</span></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={8} className="empty">nothing scored yet</td></tr>}
            </tbody>
          </table>
        </Window>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
