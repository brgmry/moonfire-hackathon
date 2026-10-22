import type { RunState } from "@rvr/contract";
import { Window } from "./Window";
import { Markdown } from "./Markdown";

export function ReportWindow({ state, onCopy, onClose }: { state: RunState; onCopy?: () => void; onClose?: () => void }) {
  if (!state.report) return null;
  const t = state.tokens;
  const cache = t.in ? Math.round((100 * t.cacheRead) / t.in) : 0;
  return (
    <Window title="Report" className="report" id="win-report" onClose={onClose} tip="one sentence per dimension, each must cite a file">
      <Markdown text={state.report} />
      <button type="button" className="linkbtn" onClick={onCopy} data-tip="copies the report text">copy report</button>
      <div className="tok" data-tip="prompt caching: fixed system prompts, so repeat tokens are cheap">{Math.round(t.in / 1000)}k in · {Math.round(t.out / 1000)}k out · {cache}% cache{t.costGbp != null ? ` · ${Math.round(t.costGbp * 100)}p` : ""} · {state.status}</div>
    </Window>
  );
}
