/** Every backend call goes through the same-origin proxy, which adds the API token from an httpOnly cookie.
 *  Page scripts never hold the token; the browser sends the cookie on fetch and EventSource alike. */
export const API = "/api/backend";

/** /api/login sets rvr_live next to the httpOnly token: a flag the page can read, worth nothing on its own. */
export function loggedIn(): boolean {
  try { return document.cookie.split("; ").includes("rvr_live=1"); } catch { return false; }
}

export function viewerName(): string {
  try {
    const k = "rvr.name";
    let n = localStorage.getItem(k);
    if (!n) { n = "guest-" + Math.random().toString(36).slice(2, 6); localStorage.setItem(k, n); }
    return n;
  } catch { return "guest"; }
}

/** Real runs cost money. Only a browser past /login (the team) or a local backend (npm run demo sets NEXT_PUBLIC_LIVE) talks to the backend; everyone else gets recorded runs. */
export function live(): boolean {
  return process.env.NEXT_PUBLIC_LIVE === "1" || loggedIn();
}

export async function createRun(repoUrl: string): Promise<string> {
  const r = await fetch(`${API}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repoUrl, by: viewerName() }) })
    .catch((x) => { throw new Error(`backend unreachable: ${(x as Error).message}`); });
  // 400s carry a message meant for people ("... was not found, or it is private").
  if (r.status === 401) throw new Error("the API token was refused; log in again at /login");
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `backend said ${r.status}`);
  const j = await r.json();
  return j.id as string;
}

export async function sendAction(runId: string, type: string, extra: Record<string, unknown> = {}) {
  await fetch(`${API}/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, by: viewerName(), ...extra }) });
}
