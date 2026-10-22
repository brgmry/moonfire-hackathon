"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Dimension } from "@rvr/contract";
import { useRun } from "@/lib/useRun";
import { MenuBar } from "./MenuBar";
import { StickyNote } from "./StickyNote";
import { MacFrame } from "./Mac";
import { Screen } from "./Screen";
import { ScoreWindow } from "./ScoreWindow";
import { EvidenceWindow } from "./EvidenceWindow";
import { Leaderboard } from "./Leaderboard";
import { ReportWindow } from "./ReportWindow";

export function Desktop({ id }: { id: string }) {
  const { state, now, connected } = useRun(id);
  const [sel, setSel] = useState<Dimension | null>(null);
  const stage = useSearchParams().get("stage") === "1";
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(`${window.location.origin}/run/${id}`); }, [id]);
  return (
    <div className="desk">
      <MenuBar state={state} connected={connected} />
      <div className={`grid ${stage ? "stage" : ""}`}>
        <StickyNote url={url} stage={stage} />
        <MacFrame><Screen state={state} now={now} /></MacFrame>
        <ScoreWindow state={state} sel={sel} onSelect={setSel} />
        {!stage && <EvidenceWindow state={state} sel={sel} />}
        {!stage && <Leaderboard state={state} />}
        <ReportWindow state={state} />
      </div>
    </div>
  );
}
