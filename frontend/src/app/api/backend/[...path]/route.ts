import { type NextRequest } from "next/server";

// The browser never holds the API token. It sits in the httpOnly rvr_token cookie, and this route adds it as
// the bearer on the way to the backend, streaming the answer back (the SSE run stream included).
// Only the public run routes pass through; /internal and /health stay unreachable from here.
const UPSTREAM = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");
const ALLOWED = /^(runs|keys)(\/|$)/;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  if (!ALLOWED.test(rel)) return Response.json({ error: "not found" }, { status: 404 });
  const headers = new Headers();
  for (const h of ["content-type", "accept", "last-event-id"]) { const v = req.headers.get(h); if (v) headers.set(h, v); }
  const token = req.cookies.get("rvr_token")?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const upstream = await fetch(`${UPSTREAM}/${rel}${req.nextUrl.search}`, {
    method: req.method, headers, body: req.method === "GET" ? undefined : await req.text(), cache: "no-store", signal: req.signal,
  }).catch(() => null);
  if (!upstream) return Response.json({ error: "backend unreachable" }, { status: 502 });
  const out = new Headers();
  for (const h of ["content-type", "cache-control"]) { const v = upstream.headers.get(h); if (v) out.set(h, v); }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
