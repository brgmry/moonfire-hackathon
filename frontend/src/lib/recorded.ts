import { reduceAll, type RunEvent, type RunState } from "@rvr/contract";

/** Finished runs exported from the bucket by infra/export-runs.sh: public/runs/index.json lists them, public/runs/<id>.jsonl holds each event log. */
export type Recorded = { id: string; repoUrl: string };

/** owner/repo, lowercased, from anything a person pastes. */
export function repoKey(u: string): string {
  const m = u.trim().match(/github\.com\/([^/\s#?]+)\/([^/\s#?]+)/i);
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, "")}`.toLowerCase() : "";
}

export async function recordedRuns(): Promise<Recorded[]> {
  try { const r = await fetch("/runs/index.json"); return r.ok ? ((await r.json()) as Recorded[]) : []; } catch { return []; }
}

export async function recordedEvents(id: string): Promise<RunEvent[] | null> {
  if (!/^r_[a-z0-9]+$/i.test(id)) return null;
  try {
    const r = await fetch(`/runs/${id}.jsonl`);
    if (!r.ok) return null;
    return (await r.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as RunEvent);
  } catch { return null; }
}

export async function recordedState(id: string): Promise<RunState | null> {
  const events = await recordedEvents(id);
  return events ? reduceAll(id, events) : null;
}
