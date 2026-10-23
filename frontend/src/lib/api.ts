export const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

/** The API token is set as a readable cookie by /api/login once the site password checks out. */
export function apiToken(): string {
  try { return decodeURIComponent(document.cookie.split("; ").find((c) => c.startsWith("rvr_token="))?.slice(10) ?? ""); } catch { return ""; }
}
export function authHeaders(): Record<string, string> { const t = apiToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
/** EventSource cannot set headers, so the stream URL carries the token. */
export function withToken(url: string): string { const t = apiToken(); return t ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : url; }

export function viewerName(): string {
  try {
    const k = "rvr.name";
    let n = localStorage.getItem(k);
    if (!n) { n = "guest-" + Math.random().toString(36).slice(2, 6); localStorage.setItem(k, n); }
    return n;
  } catch { return "guest"; }
}

/** Real runs cost money: without the login cookie, send the person to /login and come back here. */
export function requireLogin(next: string): boolean {
  if (apiToken()) return true;
  location.href = `/login?next=${encodeURIComponent(next)}`;
  return false;
}

export async function createRun(repoUrl: string): Promise<string> {
  if (!requireLogin(`/?repo=${encodeURIComponent(repoUrl)}`)) return new Promise(() => {});
  const r = await fetch(`${API}/runs`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ repoUrl, by: viewerName() }) })
    .catch((x) => { throw new Error(`backend unreachable: ${(x as Error).message}`); });
  // 400s carry a message meant for people ("... was not found, or it is private").
  if (r.status === 401) { requireLogin(`/?repo=${encodeURIComponent(repoUrl)}`); return new Promise(() => {}); }
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `backend said ${r.status}`);
  const j = await r.json();
  return j.id as string;
}

export async function sendAction(runId: string, type: string, extra: Record<string, unknown> = {}) {
  await fetch(`${API}/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ type, by: viewerName(), ...extra }) });
}
