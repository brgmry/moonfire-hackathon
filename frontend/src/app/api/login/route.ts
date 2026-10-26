import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

// Swaps the team password for the backend API token, the only thing that can start a paid run.
// Fails closed: with no password or no token configured, nobody logs in.
const FAILS = new Map<string, number[]>();
const MAX_FAILS = 10, WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD ?? "", token = process.env.SITE_TOKEN ?? "";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now(), fails = (FAILS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (fails.length >= MAX_FAILS) return NextResponse.json({ error: "too many attempts, try later" }, { status: 429 });
  const given = String((await req.json().catch(() => ({})))?.password ?? "");
  const a = Buffer.from(given), b = Buffer.from(pw);
  if (!pw || !token || a.length !== b.length || !timingSafeEqual(a, b)) {
    FAILS.set(ip, [...fails, now]);
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  FAILS.delete(ip);
  const res = NextResponse.json({ ok: true });
  // Readable by the page so it can call the Cloud Run API directly; only someone past the password has it.
  res.cookies.set("rvr_token", token, { httpOnly: false, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("rvr_token", "", { path: "/", maxAge: 0 });
  return res;
}
