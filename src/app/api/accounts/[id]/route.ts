import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE - soft-deletes a user's account (sets deletedByUser = true).
 * Data stays for owner/admin. Clipper sees it as removed.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // No admin multiplier — user managing their own accounts.
  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`account-edit:${session.user.id}`, 20, 60 * 60_000, role, 1);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    await db.clipAccount.update({
      where: { id },
      data: { deletedByUser: true, deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to remove account" }, { status: 500 });
  }
}
