import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    if (!db) return NextResponse.json({ success: true });

    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // Rate limit: 3 per email per hour (in-memory, per serverless instance)
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const rl = checkRateLimit(`magic-link:${email}`, 3, 60 * 60_000);
    if (!rl.allowed) {
      // Always return success to not reveal if email exists
      return NextResponse.json({ success: true });
    }

    // DB-level rate limit: 3 magic-link tokens per email per hour (cross-instance safety)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokens = await db.magicLinkToken.count({
      where: { email, createdAt: { gt: oneHourAgo } },
    });
    if (recentTokens >= 3) {
      return NextResponse.json({ success: true });
    }

    // Find CLIENT user with this email
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });

    if (user && user.role === "CLIENT") {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.magicLinkToken.create({
        data: { email, token, expiresAt },
      });

      const baseUrl = process.env.NEXTAUTH_URL || "https://clipershq.com";
      const link = `${baseUrl}/auth/verify?token=${token}`;

      // Fire-and-forget — see magic-link route for rationale.
      try {
        const { sendClientInviteEmail } = await import("@/lib/email");
        sendClientInviteEmail(email, link).catch((err: any) => {
          console.error("[EMAIL BACKGROUND FAIL]", err?.message || err);
        });
      } catch (err: any) {
        console.error("[REQUEST-MAGIC-LINK] Email module import failed:", err?.message);
      }
    }

    // Always return success (don't reveal if email exists)
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[REQUEST-MAGIC-LINK] Error:", err?.message);
    return NextResponse.json({ success: true });
  }
}
