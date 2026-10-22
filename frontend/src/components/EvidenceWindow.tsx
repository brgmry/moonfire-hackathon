"use client";
import { useState } from "react";
import { ROLE_ACCENT, type Dimension, type Finding, type RunState } from "@rvr/contract";
import { Window } from "./Window";

export function EvidenceWindow({ state, sel, selChunk, onClearChunk, onFinding, onClose }: { state: RunState; sel: Dimension | null; selChunk?: string | null; onClearChunk?: () => void; onFinding?: (f: Finding) => void; onClose?: () => void }) {
  const [tab, setTab] = useState<"findings" | "claims">("findings");
  const list = state.findings.filter((f) => (!sel || f.dimension === sel) && (!selChunk || f.chunkId === selChunk)).slice().reverse();
  const chunkPath = selChunk ? state.chunks.find((c) => c.id === selChunk)?.path ?? selChunk : null;
  const delivered = state.claims.filter((c) => c.status === "delivered").length;
  return (
    <Window title="Evidence" className="evidence" id="win-evidence" onClose={onClose} tip="every finding is a file, a line and a verbatim quote">
      <div className="tabs">
        <button type="button" className={tab === "findings" ? "on" : ""} onClick={() => setTab("findings")}>Findings</button>
        <button type="button" className={tab === "claims" ? "on" : ""} onClick={() => setTab("claims")}>Claims</button>
      </div>
      {tab === "findings" && (
        <div className="list">
          {(sel || chunkPath) && <div className="empty">filter: {[sel?.replace("_", " "), chunkPath].filter(Boolean).join(" · ")} {chunkPath && <button type="button" className="linkbtn" onClick={onClearChunk}>clear chunk</button>}</div>}
          {list.length === 0 && <div className="empty">{sel || chunkPath ? "no findings here yet" : "findings appear as agents report them"}</div>}
          {list.map((f) => {
            const role = state.agents[f.agentId]?.role ?? "explorer";
            return (
              <div key={f.id} className={`f ${f.valid ? "" : "dropped"} clickable`} onClick={() => onFinding?.(f)} data-tip={f.valid ? `found by ${role} in ${state.chunks.find((c) => c.id === f.chunkId)?.path ?? f.chunkId}. click to light up the chunk` : `dropped by the backend: ${f.file} is not in the repo`}>
                <div className="sw" style={{ background: ROLE_ACCENT[role] }} />
                <div>
                  <span className="loc">{f.file}:{f.line}</span>
                  <span className={`sev ${f.valid ? f.severity : "dropped"}`}>{f.valid ? f.severity : "dropped"}</span>
                  <div className="q">{f.quote}</div>
                  <div>{f.note}</div>
                  {f.author && <div className="empty" data-tip={`git blame ${f.file}:${f.line}${f.commit ? ", commit " + f.commit.slice(0, 7) : ""}`}>by {f.author}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === "claims" && (
        <div className="list">
          {state.claims.length === 0 && <div className="empty">claims appear once the README is read</div>}
          {state.claims.length > 0 && <div className="empty">{delivered} of {state.claims.length} delivered</div>}
          {state.claims.map((c) => (
            <div key={c.id} className="claim" data-tip={`README line ${c.readmeLine}: ${c.status}${c.quality ? `, quality ${c.quality}/5` : ""}`}>
              <span className={`st ${c.status}`}>{c.status}</span>
              <div>
                <div>{c.text} <span className="empty">README:{c.readmeLine}</span></div>
                <div className="empty">{c.evidenceFile}{c.note ? ` · ${c.note}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Window>
  );
}
