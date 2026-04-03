import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE - allows a user to cancel/delete their own PENDING account submission
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (account.status === "APPROVED") {
      return NextResponse.json({ error: "Approved accounts cannot be removed" }, { status: 400 });
    }
    await db.clipAccount.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
