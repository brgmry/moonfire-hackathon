"use client";
import { useState } from "react";
import { ROLE_ACCENT, type Dimension, type RunState } from "@rvr/contract";
import { Window } from "./Window";

export function EvidenceWindow({ state, sel }: { state: RunState; sel: Dimension | null }) {
  const [tab, setTab] = useState<"findings" | "claims">("findings");
  const list = state.findings.filter((f) => !sel || f.dimension === sel).slice().reverse();
  const delivered = state.claims.filter((c) => c.status === "delivered").length;
  return (
    <Window title="Evidence" className="evidence">
      <div className="tabs">
        <button type="button" className={tab === "findings" ? "on" : ""} onClick={() => setTab("findings")}>Findings</button>
        <button type="button" className={tab === "claims" ? "on" : ""} onClick={() => setTab("claims")}>Claims</button>
      </div>
      {tab === "findings" && (
        <div className="list">
          {list.length === 0 && <div className="empty">{sel ? `no findings for ${sel.replace("_", " ")} yet` : "findings appear as agents report them"}</div>}
          {list.map((f) => {
            const role = state.agents[f.agentId]?.role ?? "explorer";
            return (
              <div key={f.id} className={`f ${f.valid ? "" : "dropped"}`}>
                <div className="sw" style={{ background: ROLE_ACCENT[role] }} />
                <div>
                  <span className="loc">{f.file}:{f.line}</span>
                  <span className={`sev ${f.valid ? f.severity : "dropped"}`}>{f.valid ? f.severity : "dropped"}</span>
                  <div className="q">{f.quote}</div>
                  <div>{f.note}</div>
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
            <div key={c.id} className="claim">
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
