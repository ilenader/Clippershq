import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/admin/accounts/[id] — Permanently delete a clipper account.
 * OWNER ONLY.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can permanently delete accounts" }, { status: 403 });
  }

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await db.clipAccount.delete({ where: { id } });
    console.log(`[ADMIN] Permanently deleted account ${id} (${account.username} on ${account.platform})`);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[ADMIN] Account delete failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to delete account" }, { status: 500 });
  }
}
