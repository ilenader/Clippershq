import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { roundToNextSlot } from "@/lib/tracking";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-tracking
 * Creates tracking jobs for existing TikTok clips that don't have one.
 * Owner only.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rl = checkRoleAwareRateLimit(`backfill-tracking:${session.user.id}`, 3, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Find TikTok clips without tracking jobs
    const clipsWithoutTracking = await db.clip.findMany({
      where: {
        clipUrl: { contains: "tiktok.com" },
        isDeleted: false,
        trackingJob: null, // no tracking job exists
        campaign: { isArchived: false },
      },
      select: { id: true, campaignId: true },
    });

    let created = 0;
    for (const clip of clipsWithoutTracking) {
      await db.trackingJob.create({
        data: {
          clipId: clip.id,
          campaignId: clip.campaignId,
          nextCheckAt: roundToNextSlot(60),
          checkIntervalMin: 60,
          isActive: true,
        },
      });
      created++;
    }

    return NextResponse.json({ created, total: clipsWithoutTracking.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
