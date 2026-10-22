import { NextResponse, type NextRequest } from "next/server";

/** Site gate. Every page and route needs the rvr_auth cookie, except the login page, its API, and static assets. */
const OPEN = ["/login", "/api/login", "/icon.svg", "/opengraph-image", "/favicon.ico"];

async function expected(): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "", pw = process.env.SITE_PASSWORD ?? "";
  if (!secret || !pw) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${pw}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const want = await expected();
  if (!want) return NextResponse.next(); // no password configured: open, for local dev
  if (req.cookies.get("rvr_auth")?.value === want) return NextResponse.next();
  if (pathname.startsWith("/api/") || pathname.startsWith("/fixtures/") || pathname.endsWith(".json")) return NextResponse.json({ error: "password required" }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|avatars/).*)"] };
