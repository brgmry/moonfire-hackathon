"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Dimension } from "@rvr/contract";
import { useRun } from "@/lib/useRun";
import { sendAction } from "@/lib/api";
import { MenuBar, type Menus } from "./MenuBar";
import { StickyNote } from "./StickyNote";
import { MacFrame } from "./Mac";
import { Screen } from "./Screen";
import { ScoreWindow } from "./ScoreWindow";
import { EvidenceWindow } from "./EvidenceWindow";
import { Leaderboard } from "./Leaderboard";
import { ReportWindow } from "./ReportWindow";
import { DesktopIcons } from "./DesktopIcons";
import { Window } from "./Window";

type WinId = "score" | "evidence" | "board" | "report" | "about";

export function Desktop({ id }: { id: string }) {
  const { state, now, connected } = useRun(id);
  const router = useRouter();
  const [sel, setSel] = useState<Dimension | null>(null);
  const [selChunk, setSelChunk] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ chunkId: string; until: number } | null>(null);
  const [hidden, setHidden] = useState<Set<WinId>>(new Set(["about"]));
  const [off, setOff] = useState(false);
  const [grid, setGrid] = useState(true);
  const [toast, setToast] = useState("");
  const stage = useSearchParams().get("stage") === "1";
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(`${window.location.origin}/run/${id}`); }, [id]);

  const say = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); }, []);
  const copy = useCallback((text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => say(`${what} copied`)).catch(() => say("clipboard blocked, select it by hand"));
  }, [say]);
  const show = useCallback((w: WinId) => { setHidden((h) => { const n = new Set(h); n.delete(w); return n; }); setTimeout(() => document.getElementById(`win-${w}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }, []);
  const hide = useCallback((w: WinId) => setHidden((h) => new Set(h).add(w)), []);
  const highlight = useCallback((chunkId: string) => setPulse({ chunkId, until: Date.now() + 1500 }), []);

  const summary = useMemo(() => {
    const d = state.score.dimensions;
    return [`${state.profile?.name ?? state.repoUrl}: ${Math.round(state.score.total)}/100`, ...Object.entries(d).map(([k, v]) => `${k.replace("_", " ")} ${Math.round((v?.points ?? 0) * 10) / 10}/${v?.max}`)].join("\n");
  }, [state]);

  const menus: Menus = {
    File: [
      { label: "New run…", tip: "back to the main screen", onClick: () => router.push("/") },
      { label: "Run the demo", tip: "the fixture run, no backend needed", onClick: () => router.push("/run/demo") },
      { label: "Benchmark", tip: "every run, ranked, with the distribution", onClick: () => router.push("/bench") },
      { label: "Replay this run", tip: "reload from the first event", onClick: () => window.location.reload(), disabled: id !== "demo" },
      { sep: true, label: "" },
      { label: "Copy run URL", tip: "put it on every phone", onClick: () => copy(url, "URL") },
      { label: stage ? "Leave stage mode" : "Stage mode", tip: "projector layout with the QR code", checked: stage, onClick: () => router.push(`/run/${id}${stage ? "" : "?stage=1"}`) },
      { sep: true, label: "" },
      { label: "Show all windows", onClick: () => setHidden(new Set()) },
    ],
    Edit: [
      { label: "Copy score summary", tip: "the number and every dimension", onClick: () => copy(summary, "score") },
      { label: "Copy report", disabled: !state.report, onClick: () => copy(state.report ?? "", "report") },
      { sep: true, label: "" },
      { label: "Clear filters", disabled: !sel && !selChunk, onClick: () => { setSel(null); setSelChunk(null); } },
      { label: "Rerun selected chunk", tip: "asks the backend to re-explore it", disabled: !selChunk || id === "demo", onClick: () => { sendAction(id, "rerun_chunk", { chunkId: selChunk }).then(() => say("rerun requested")).catch(() => say("backend said no")); } },
    ],
    Special: [
      { label: "Grid", checked: grid, tip: "the phosphor grid behind the treemap", onClick: () => setGrid((g) => !g) },
      { label: off ? "Wake up" : "Shut down", tip: "the Mac, not the crew", onClick: () => setOff((o) => !o) },
      { sep: true, label: "" },
      { label: "Empty trash", tip: "nothing in it, like every Mac ever", onClick: () => say("the trash is already empty") },
      { label: "The pitch", tip: "goal, crew, result, autonomy", onClick: () => router.push("/pitch") },
      { label: "About README vs Reality", onClick: () => show("about") },
    ],
  };

  const chunkName = (cid: string) => state.chunks.find((c) => c.id === cid)?.path ?? cid;

  return (
    <div className="desk">
      <MenuBar state={state} connected={connected} menus={menus} />
      <div className={`grid ${stage ? "stage" : ""}`}>
        <StickyNote url={url} stage={stage} onCopy={() => copy(url, "URL")} />
        <MacFrame>
          <Screen state={state} now={now} grid={grid} off={off} selChunk={selChunk} pulse={pulse && now < pulse.until ? pulse.chunkId : null}
            onChunk={(cid) => { setSelChunk((c) => (c === cid ? null : cid)); show("evidence"); }} onWake={() => setOff(false)} />
        </MacFrame>
        {!hidden.has("score") && <ScoreWindow state={state} sel={sel} onSelect={(d) => { setSel(d); if (d) show("evidence"); }} onClose={() => hide("score")} />}
        {!stage && !hidden.has("evidence") && <EvidenceWindow state={state} sel={sel} selChunk={selChunk} onClearChunk={() => setSelChunk(null)} onFinding={(f) => highlight(f.chunkId)} onClose={() => hide("evidence")} />}
        {!stage && !hidden.has("board") && <Leaderboard state={state} onAuthor={(chunkIds) => { if (chunkIds[0]) { setSelChunk(chunkIds[0]); highlight(chunkIds[0]); show("evidence"); } }} onClose={() => hide("board")} />}
        {!hidden.has("report") && <ReportWindow state={state} onCopy={() => copy(state.report ?? "", "report")} onClose={() => hide("report")} />}
        {!hidden.has("about") && (
          <Window title="About README vs Reality" className="report" id="win-about" onClose={() => hide("about")}>
            <p><b>Every README is a pitch deck.</b> We read the code, built it, ran it and scored it.</p>
            <p>A crew of agents clones the repo into a disposable sandbox, splits it into chunks, explores every chunk, compiles it, runs it, checks the README&apos;s claims against what was delivered, and the backend computes a score out of 100 from the findings. Every point traces to a file, a line and a quote.</p>
            <p>Built in three hours at Moonfire Build Night, 22 Oct 2026, by Bergen, Allen and Akshay. Runs on Claude Sonnet and Haiku, Cloud Run and Vercel.</p>
          </Window>
        )}
      </div>
      {!stage && (
        <DesktopIcons icons={[
          { id: "score", label: "Score", glyph: "chart", onOpen: () => show("score"), tip: "the dial and the nine dimensions" },
          { id: "evidence", label: "Evidence", glyph: "doc", onOpen: () => show("evidence"), tip: "findings and claims, file and line" },
          { id: "board", label: "Leaderboard", glyph: "people", onOpen: () => show("board"), tip: "who wrote what" },
          { id: "report", label: "Report", glyph: "disk", onOpen: () => (state.report ? show("report") : say("the writer has not finished yet")), tip: state.report ? "the eight-sentence read" : "appears when the run finishes" },
          { id: "trash", label: "Trash", glyph: "trash", onOpen: () => say(selChunk ? `${chunkName(selChunk)} is still in the repo, sadly` : "the trash is empty"), tip: "empty, as always" },
        ]} />
      )}
      {selChunk && <div className="filterchip" data-tip="evidence is filtered to this chunk"><span>chunk: {chunkName(selChunk)}</span><button type="button" onClick={() => setSelChunk(null)} aria-label="clear chunk filter">×</button></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
