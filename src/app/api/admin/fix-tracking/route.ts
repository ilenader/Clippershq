import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/fix-tracking
 * Repairs missing or inactive tracking jobs for approved clips.
 * OWNER only.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const rl = checkRoleAwareRateLimit(`fix-tracking:${session.user.id}`, 10, 60 * 60_000, role, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[FIX-TRACKING] Starting repair...");

  // Find approved, non-deleted clips with NO tracking job
  const clipsWithoutJob = await db.clip.findMany({
    where: {
      status: "APPROVED",
      isDeleted: false,
      trackingJob: null,
    },
    select: { id: true, campaignId: true, clipUrl: true },
  });

  let created = 0;
  for (const clip of clipsWithoutJob) {
    try {
      await db.trackingJob.create({
        data: {
          clipId: clip.id,
          campaignId: clip.campaignId,
          nextCheckAt: (() => { const d = new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()+1); return d; })(),
          checkIntervalMin: 60,
          isActive: true,
        },
      });
      created++;
      console.log(`[FIX-TRACKING] Created job for clip ${clip.id}`);
    } catch (err: any) {
      console.error(`[FIX-TRACKING] Failed for clip ${clip.id}:`, err?.message);
    }
  }

  // Find inactive tracking jobs where the campaign is ACTIVE — reactivate
  const inactiveJobs = await db.trackingJob.findMany({
    where: {
      isActive: false,
      clip: { status: "APPROVED", isDeleted: false },
      campaign: { status: "ACTIVE", isArchived: false },
    },
    select: { id: true, clipId: true },
  });

  let reactivated = 0;
  if (inactiveJobs.length > 0) {
    const result = await db.trackingJob.updateMany({
      where: { id: { in: inactiveJobs.map((j: any) => j.id) } },
      data: { isActive: true, nextCheckAt: (() => { const d = new Date(); d.setMinutes(0,0,0); d.setHours(d.getHours()+1); return d; })() },
    });
    reactivated = result.count;
    console.log(`[FIX-TRACKING] Reactivated ${reactivated} jobs`);
  }

  console.log(`[FIX-TRACKING] Done. Created: ${created}, Reactivated: ${reactivated}`);

  return NextResponse.json({
    success: true,
    clipsWithoutJob: clipsWithoutJob.length,
    created,
    inactiveWithActiveCampaign: inactiveJobs.length,
    reactivated,
  });
}
