"use client";
import { DIMENSIONS, type Dimension, type RunState } from "@rvr/contract";
import { Window } from "./Window";

const TIP: Record<Dimension, string> = { claims: "README claims delivered, and how well", runs: "does it start, do the tests pass", compiles: "does it build, how clean", quality: "majors cost 2, minors half a point, good findings earn half", architecture: "structure findings from the explorers", tests: "test files present, pass rate", dead_code: "exports nobody imports", security: "secrets, injection, auth mistakes", docs: "what the code says about itself" };

export function ScoreWindow({ state, sel, onSelect, onClose }: { state: RunState; sel: Dimension | null; onSelect: (d: Dimension | null) => void; onClose?: () => void }) {
  const total = state.score.total;
  const R = 37, C = 2 * Math.PI * R, arc = C * 0.75;
  return (
    <Window title="Score" className="score" id="win-score" onClose={onClose} tip="computed by the backend from findings, never asked of a model">
      <div className="dial">
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <rect x="1" y="1" width="90" height="90" fill="none" stroke="#141414" strokeWidth="2" />
          <circle cx="46" cy="46" r={R} fill="none" stroke="#fff" strokeWidth="9" strokeDasharray={`${arc} ${C}`} transform="rotate(135 46 46)" />
          <circle cx="46" cy="46" r={R} fill="none" stroke="#141414" strokeWidth="9" strokeDasharray={`${arc * total / 100} ${C}`} transform="rotate(135 46 46)" style={{ transition: "stroke-dasharray .4s" }} />
        </svg>
        <div className="total"><span>{Math.round(total)}</span><small>OUT OF 100</small></div>
      </div>
      <div className="rows">
        {DIMENSIONS.map(({ key, max, label }) => {
          const d = state.score.dimensions[key];
          const pts = d?.points ?? 0;
          return (
            <button type="button" key={key} className={`row ${sel === key ? "sel" : ""}`} onClick={() => onSelect(sel === key ? null : key)} data-tip={`${TIP[key]}${d?.note ? ". " + d.note : ""}. click to filter evidence`}>
              <span>{label}</span>
              <span className="bar"><i style={{ width: `${(100 * pts) / max}%` }} /></span>
              <span className="n">{Math.round(pts * 10) / 10}/{max}</span>
            </button>
          );
        })}
      </div>
    </Window>
  );
}
