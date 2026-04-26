import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can restore campaigns" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`campaign-restore:${session.user.id}`, 5, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

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

    // Reactivate all tracking jobs for this campaign
    const reactivated = await db.trackingJob.updateMany({
      where: { campaignId: id, isActive: false },
      data: { isActive: true, nextCheckAt: (() => { const d = new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()+1); return d; })() },
    });
    console.log(`[RESTORE] Reactivated ${reactivated.count} tracking jobs for campaign:`, id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Restore campaign failed:", err?.message);
    return NextResponse.json({ error: "Failed to restore campaign" }, { status: 500 });
  }
}
