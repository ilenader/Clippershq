import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/clips/[id]/tracking
 * Returns all stat snapshots + tracking job info for a clip.
 * Owner/Admin only (admin scoped to their campaigns).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Verify admin has access to this clip's campaign
    if (role === "ADMIN") {
      const clip = await db.clip.findUnique({ where: { id }, select: { campaignId: true } });
      if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });
      const allowedIds = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(allowedIds) && !allowedIds.includes(clip.campaignId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get all snapshots for this clip (newest first)
    const snapshots = await db.clipStat.findMany({
      where: { clipId: id },
      orderBy: { checkedAt: "asc" }, // chronological order
    });

    // Get tracking job info
    const trackingJob = await db.trackingJob.findUnique({
      where: { clipId: id },
    });

    return NextResponse.json({
      snapshots,
      trackingJob: trackingJob ? {
        isActive: trackingJob.isActive,
        nextCheckAt: trackingJob.nextCheckAt,
        checkIntervalMin: trackingJob.checkIntervalMin,
        lastCheckedAt: trackingJob.lastCheckedAt,
        consecutiveFlats: trackingJob.consecutiveFlats,
      } : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch tracking data" }, { status: 500 });
  }
}
