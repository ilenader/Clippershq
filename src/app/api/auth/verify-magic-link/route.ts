import { db } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Brute-force defense: cap verification attempts per source IP. If tokens were
    // ever shortened or if an attacker harvested multiple magic links, this prevents
    // enumeration. request.ip isn't set on Next server runtime; derive from headers.
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rl = checkRateLimit(`magic-verify:${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

    if (!db) return NextResponse.redirect(new URL("/login?error=unavailable", req.url));

    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));

    const record = await db.magicLinkToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
    }

    // Atomic token consumption: only one concurrent verify can mark it used
    const claimed = await db.magicLinkToken.updateMany({
      where: { token, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (claimed.count === 0) {
      return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
    }

    // Find or create user — magic links only mint sessions for CLIENT role
    let user = await db.user.findUnique({ where: { email: record.email } });
    if (user && user.role !== "CLIENT") {
      // Refuse to authenticate clippers/admins/owners via magic link
      return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
    }
    if (!user) {
      user = await db.user.create({
        data: {
          email: record.email,
          username: record.email.split("@")[0],
          name: record.email.split("@")[0],
          role: "CLIENT",
          status: "ACTIVE",
        },
      });
    }

    // Create a session by setting a cookie that the auth system will pick up
    // For NextAuth, we need to create a session record directly
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    // Set the session cookie
    const response = NextResponse.redirect(new URL("/client", req.url));
    const secureCookie = process.env.NODE_ENV === "production";
    const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      expires,
    });

    return response;
  } catch (err: any) {
    console.error("[VERIFY-MAGIC-LINK] Error:", err?.message);
    return NextResponse.redirect(new URL("/login?error=server-error", req.url));
  }
}
