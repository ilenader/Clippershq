import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    if (!db) return NextResponse.redirect(new URL("/login?error=unavailable", req.url));

    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));

    const record = await db.magicLinkToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
    }

    // Mark token as used
    await db.magicLinkToken.update({ where: { id: record.id }, data: { used: true } });

    // Find or create user
    let user = await db.user.findUnique({ where: { email: record.email } });
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
    } else if (user.role !== "CLIENT") {
      // User exists with different role — don't change it
      // They can still access client pages if they have campaign assignments
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
