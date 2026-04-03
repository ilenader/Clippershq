import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
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

  if ((session.user as any).role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      const nextCheck = new Date();
      nextCheck.setMinutes(0, 0, 0);
      nextCheck.setHours(nextCheck.getHours() + 1);

      await db.trackingJob.create({
        data: {
          clipId: clip.id,
          campaignId: clip.campaignId,
          nextCheckAt: nextCheck,
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
