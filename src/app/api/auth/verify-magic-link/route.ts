import { db } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

export const dynamic = "force-dynamic";

/**
 * NextResponse.redirect() requires an absolute URL. `new URL(path, req.url)`
 * resolves against req.url, which on Railway (behind the platform proxy) is
 * the internal bind host `http://localhost:8080` — so the Location header
 * sent to the browser was pointing at localhost. Prefer, in order: the
 * authoritative NEXTAUTH_URL, then x-forwarded-host/proto set by the proxy,
 * then finally req.url as a last-resort fallback for dev.
 */
function publicBaseUrl(req: NextRequest): string {
  const env = process.env.NEXTAUTH_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto") || "https";
  if (fwdHost) return `${fwdProto}://${fwdHost}`;
  return new URL(req.url).origin;
}

export async function GET(req: NextRequest) {
  const base = publicBaseUrl(req);
  const redirectTo = (path: string) => NextResponse.redirect(`${base}${path}`);

  try {
    // Brute-force defense: cap verification attempts per source IP. If tokens were
    // ever shortened or if an attacker harvested multiple magic links, this prevents
    // enumeration.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`magic-verify:${ip}`, 10, 60_000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

    if (!db) return redirectTo("/login?error=unavailable");

    const token = req.nextUrl.searchParams.get("token");
    if (!token) return redirectTo("/login?error=invalid-link");

    const record = await db.magicLinkToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return redirectTo("/login?error=invalid-link");
    }

    // Atomic token consumption: only one concurrent verify can mark it used
    const claimed = await db.magicLinkToken.updateMany({
      where: { token, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (claimed.count === 0) {
      return redirectTo("/login?error=invalid-link");
    }

    // Find or create user — magic links only mint sessions for CLIENT role
    let user = await db.user.findUnique({ where: { email: record.email } });
    if (user && user.role !== "CLIENT") {
      // Refuse to authenticate clippers/admins/owners via magic link
      return redirectTo("/login?error=invalid-link");
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

    // Mint a NextAuth-compatible JWT cookie. Salt MUST equal the cookie name
    // (per @auth/core/jwt.js HKDF derivation) so the next request's auth()
    // call can decrypt this token. encode() handles iat/exp internally via
    // the maxAge param.
    const secureCookie = process.env.NODE_ENV === "production";
    const cookieName = secureCookie
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const maxAgeSec = 30 * 24 * 60 * 60;
    const nowSec = Math.floor(Date.now() / 1000);

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.username && user.username !== "user" ? user.username : null,
      role: user.role,
      status: user.status,
      discordId: user.discordId,
      // Set on issuance so auth.ts jwt callback's 5-min refresh cadence works
      // correctly from the first request after this redirect.
      lastRefreshAt: nowSec,
    };

    const encoded = await encode({
      token: tokenPayload,
      secret: process.env.AUTH_SECRET!,
      salt: cookieName,
      maxAge: maxAgeSec,
    });

    const response = redirectTo("/client");
    response.cookies.set(cookieName, encoded, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSec,
    });

    return response;
  } catch (err: any) {
    console.error("[VERIFY-MAGIC-LINK] Error:", err?.message);
    return redirectTo("/login?error=server-error");
  }
}
