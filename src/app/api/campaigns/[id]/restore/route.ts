import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can restore campaigns" }, { status: 403 });
  }

  const { id } = await params;

  if (!db) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  try {
    // Verify campaign exists first
    const existing = await db.campaign.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    await db.campaign.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedById: null,
        status: "PAUSED",
      },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Restore campaign failed:", err?.message);
    return NextResponse.json({ error: "Failed to restore campaign" }, { status: 500 });
  }
}
