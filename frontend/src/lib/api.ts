export const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

export function viewerName(): string {
  try {
    const k = "rvr.name";
    let n = localStorage.getItem(k);
    if (!n) { n = "guest-" + Math.random().toString(36).slice(2, 6); localStorage.setItem(k, n); }
    return n;
  } catch { return "guest"; }
}

export async function createRun(repoUrl: string): Promise<string> {
  const r = await fetch(`${API}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repoUrl, by: viewerName() }) });
  if (!r.ok) throw new Error(`backend said ${r.status}`);
  const j = await r.json();
  return j.id as string;
}

export async function sendAction(runId: string, type: string, extra: Record<string, unknown> = {}) {
  await fetch(`${API}/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, by: viewerName(), ...extra }) });
}
