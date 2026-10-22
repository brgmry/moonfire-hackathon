"use client";
import { DIMENSIONS, type Dimension, type RunState } from "@rvr/contract";
import { Window } from "./Window";

export function ScoreWindow({ state, sel, onSelect }: { state: RunState; sel: Dimension | null; onSelect: (d: Dimension | null) => void }) {
  const total = state.score.total;
  const R = 37, C = 2 * Math.PI * R, arc = C * 0.75;
  return (
    <Window title="Score" className="score">
      <div className="dial">
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <rect x="1" y="1" width="90" height="90" fill="none" stroke="#141414" strokeWidth="2" />
          <circle cx="46" cy="46" r={R} fill="none" stroke="#fff" strokeWidth="9" strokeDasharray={`${arc} ${C}`} transform="rotate(135 46 46)" />
          <circle cx="46" cy="46" r={R} fill="none" stroke="#141414" strokeWidth="9" strokeDasharray={`${arc * total / 100} ${C}`} transform="rotate(135 46 46)" style={{ transition: "stroke-dasharray .4s" }} />
        </svg>
        <div className="total"><span>{total}</span><small>OUT OF 100</small></div>
      </div>
      <div className="rows">
        {DIMENSIONS.map(({ key, max, label }) => {
          const d = state.score.dimensions[key];
          const pts = d?.points ?? 0;
          return (
            <button type="button" key={key} className={`row ${sel === key ? "sel" : ""}`} onClick={() => onSelect(sel === key ? null : key)}>
              <span>{label}</span>
              <span className="bar"><i style={{ width: `${(100 * pts) / max}%` }} /></span>
              <span className="n">{pts}/{max}</span>
            </button>
          );
        })}
      </div>
    </Window>
  );
}
