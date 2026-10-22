import type { RunState } from "@rvr/contract";
import { Window } from "./Window";

export function ReportWindow({ state }: { state: RunState }) {
  if (!state.report) return null;
  const t = state.tokens;
  const cache = t.in ? Math.round((100 * t.cacheRead) / t.in) : 0;
  return (
    <Window title="Report" className="report">
      <p>{state.report}</p>
      <div className="tok">{Math.round(t.in / 1000)}k in · {Math.round(t.out / 1000)}k out · {cache}% cache{t.costGbp != null ? ` · ${Math.round(t.costGbp * 100)}p` : ""} · {state.status}</div>
    </Window>
  );
}
