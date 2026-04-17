import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();
    if (!email || !email.includes("@") || email.length > 254) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // Consent guard — require the email to already have a CLIENT account.
    // Prevents OWNER from auto-provisioning a brand they don't manage by mailing a link blind.
    const existingUser = await db.user.findFirst({
      where: { email, role: "CLIENT" },
      select: { id: true },
    });
    if (!existingUser) {
      return NextResponse.json(
        { error: "No client account found for this email. Create the client first via /admin/clients." },
        { status: 400 },
      );
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.magicLinkToken.create({
      data: { email, token, expiresAt },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://clipershq.com";
    const link = `${baseUrl}/auth/verify?token=${token}`;

    // Send email
    try {
      const { sendClientInviteEmail } = await import("@/lib/email");
      await sendClientInviteEmail(email, link);
    } catch (err: any) {
      console.error("[MAGIC-LINK] Email send failed:", err?.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[MAGIC-LINK] Error:", err?.message);
    return NextResponse.json({ error: "Failed to send magic link" }, { status: 500 });
  }
}
