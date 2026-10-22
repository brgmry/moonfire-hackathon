import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

async function cookieValue(): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${process.env.AUTH_SECRET}:${process.env.SITE_PASSWORD}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD ?? "";
  const given = String((await req.json().catch(() => ({})))?.password ?? "");
  const a = Buffer.from(given), b = Buffer.from(pw);
  if (!pw || a.length !== b.length || !timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const week = 60 * 60 * 24 * 7, secure = process.env.NODE_ENV === "production";
  res.cookies.set("rvr_auth", await cookieValue(), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: week });
  // Readable by the page so it can call the Cloud Run API directly; only someone past the password has it.
  res.cookies.set("rvr_token", process.env.SITE_TOKEN ?? "", { httpOnly: false, sameSite: "lax", secure, path: "/", maxAge: week });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("rvr_auth", "", { path: "/", maxAge: 0 });
  res.cookies.set("rvr_token", "", { path: "/", maxAge: 0 });
  return res;
}
