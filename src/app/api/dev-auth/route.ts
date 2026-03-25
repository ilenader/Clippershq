import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/dev-auth — Set or clear the dev auth cookie.
 * Body: { role: "CLIPPER" | "ADMIN" | "OWNER" } to log in, or { logout: true } to clear.
 *
 * Only works in development with DEV_AUTH_BYPASS=true.
 */
export async function POST(req: NextRequest) {
  if (!isDevBypassEnabled()) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const body = await req.json();

  if (body.logout) {
    const res = NextResponse.json({ success: true });
    res.cookies.delete(DEV_AUTH_COOKIE);
    return res;
  }

  const role = body.role;
  if (!["CLIPPER", "ADMIN", "OWNER"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const res = NextResponse.json({ success: true, role });
  res.cookies.set(DEV_AUTH_COOKIE, role, {
    httpOnly: false, // readable by client JS
    path: "/",
    maxAge: 60 * 60 * 24, // 1 day
    sameSite: "lax",
  });

  return res;
}

/** GET /api/dev-auth — Check current dev session */
export async function GET(req: NextRequest) {
  if (!isDevBypassEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const role = req.cookies.get(DEV_AUTH_COOKIE)?.value;
  return NextResponse.json({ enabled: true, role: role || null });
}
