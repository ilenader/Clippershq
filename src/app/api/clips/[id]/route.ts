import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/clips/[id] — Owner-only hard delete of a clip
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
    return NextResponse.json({ error: "Only owners can delete clips" }, { status: 403 });
  }

  const { id } = await params;

  if (db) {
    try {
      // Delete stats first (cascade should handle it, but be explicit)
      await db.clipStat.deleteMany({ where: { clipId: id } });
      await db.clip.delete({ where: { id } });
      return NextResponse.json({ success: true });
    } catch (err: any) {
      console.error("Delete clip failed:", err?.message);
      return NextResponse.json({ error: "Failed to delete clip" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
}
