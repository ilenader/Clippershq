import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { recalculateClipEarningsBreakdown, calculateOwnerEarnings, getStreakBonusPercent } from "@/lib/earnings-calc";
import { loadConfig } from "@/lib/gamification";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/force-recalc-earnings
 * OWNER-only. Body: { clipId?: string; campaignId?: string; all?: boolean }.
 *
 * Bypasses the tracking cron's budget-lock and Serializable-conflict skip
 * paths. For each targeted clip:
 *   1. Read the latest ClipStat row.
 *   2. Compute earnings via recalculateClipEarningsBreakdown — the same
 *      function tracking uses. Respects maxPayoutPerClip + all bonuses.
 *   3. Write clip.earnings / baseEarnings / bonusPercent / bonusAmount.
 *   4. Upsert AgencyEarning for CPM_SPLIT campaigns with fresh views.
 * One-clip-per-transaction so a conflict on one doesn't block the rest.
 *
 * Does NOT apply the campaign-wide budget cap. Owner is explicitly
 * overriding; if this pushes spend past budget, the next tracking cycle
 * will ratio-cap and auto-pause the campaign.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden — owner only" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`force-recalc:${session.user.id}`, 5, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clipId: string | undefined = typeof body.clipId === "string" && body.clipId ? body.clipId : undefined;
  const campaignId: string | undefined = typeof body.campaignId === "string" && body.campaignId ? body.campaignId : undefined;
  const all = body.all === true;

  if (!clipId && !campaignId && !all) {
    return NextResponse.json({ error: "Provide clipId, campaignId, or all=true" }, { status: 400 });
  }

  // Build the target filter. APPROVED + not-deleted + not-videoUnavailable — the
  // same subset tracking recalculates (avoids awakening rejected/deleted clips).
  // Exclude marketplace clips: their 60/30/10 split is owned by the cron path
  // (tracking.ts), and this tool would write the gross to Clip.earnings only.
  const where: any = {
    status: "APPROVED",
    isDeleted: false,
    videoUnavailable: false,
    isMarketplaceClip: false,
  };
  if (clipId) where.id = clipId;
  else if (campaignId) where.campaignId = campaignId;
  // else all — no additional scoping beyond status/deleted/unavailable

  let targets: any[] = [];
  try {
    targets = await db.clip.findMany({
      where,
      include: {
        campaign: {
          select: {
            id: true, minViews: true, cpmRate: true, maxPayoutPerClip: true,
            clipperCpm: true, ownerCpm: true, pricingModel: true,
          },
        },
        user: { select: { id: true, level: true, currentStreak: true, referredById: true, isPWAUser: true, lastPWAOpenAt: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1, select: { views: true } },
      },
      take: all ? 5000 : 500,
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Target query failed: ${err?.message}` }, { status: 500 });
  }

  if (targets.length === 0) {
    return NextResponse.json({ processed: 0, updated: 0, skipped: 0, errors: 0, detail: "No matching clips" });
  }

  // Pre-load config once for lazy streak-% backfill on clips missing the snapshot.
  let cfg: any = null;
  try { cfg = await loadConfig(); } catch {}

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const details: string[] = [];

  for (const clip of targets) {
    processed++;
    try {
      const latestViews = clip.stats?.[0]?.views ?? 0;
      if (latestViews === 0) {
        skipped++;
        continue;
      }

      // Streak lock: fall back to current user streak if the clip predates the lock.
      let lockedStreakPct: number | null = clip.streakBonusPercentAtApproval ?? null;
      if (lockedStreakPct == null && cfg?.streakBonuses) {
        lockedStreakPct = getStreakBonusPercent(clip.user?.currentStreak ?? 0, cfg.streakBonuses);
      }

      const pwaFresh =
        !!clip.user?.isPWAUser &&
        !!clip.user?.lastPWAOpenAt &&
        (Date.now() - new Date(clip.user.lastPWAOpenAt).getTime()) / 86_400_000 <= 2;

      const breakdown = recalculateClipEarningsBreakdown({
        stats: [{ views: latestViews }],
        campaign: clip.campaign,
        user: {
          level: clip.user?.level ?? 0,
          currentStreak: clip.user?.currentStreak ?? 0,
          referredById: clip.user?.referredById ?? null,
          isPWAUser: pwaFresh,
        },
        streakBonusPercentAtApproval: lockedStreakPct ?? 0,
      });

      const newEarnings = breakdown.clipperEarnings;
      const newBase = breakdown.baseEarnings;
      const newBonusPct = breakdown.bonusPercent;
      const newBonusAmt = breakdown.bonusAmount;

      // Short transaction per clip — a conflict on one row can't stall the whole batch.
      await db.$transaction(async (tx: any) => {
        await tx.clip.update({
          where: { id: clip.id },
          data: {
            earnings: newEarnings,
            baseEarnings: newBase,
            bonusPercent: newBonusPct,
            bonusAmount: newBonusAmt,
            ...(clip.streakBonusPercentAtApproval == null ? { streakBonusPercentAtApproval: lockedStreakPct ?? 0 } : {}),
          },
        });

        const isCpmSplit = clip.campaign?.pricingModel === "CPM_SPLIT" && clip.campaign?.ownerCpm;
        if (isCpmSplit) {
          const cCpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;
          const ownerAmt = calculateOwnerEarnings(latestViews, clip.campaign.ownerCpm, newBase, cCpm);
          if (ownerAmt > 0) {
            await tx.agencyEarning.upsert({
              where: { clipId: clip.id },
              create: { campaignId: clip.campaignId, clipId: clip.id, amount: ownerAmt, views: latestViews },
              update: { amount: ownerAmt, views: latestViews },
            });
          } else {
            try { await tx.agencyEarning.delete({ where: { clipId: clip.id } }); } catch {}
          }
        }
      });

      updated++;
      details.push(`${clip.id}: views=${latestViews} → earnings=$${newEarnings.toFixed(2)} (was $${clip.earnings?.toFixed?.(2) ?? "0"})`);
    } catch (err: any) {
      errors++;
      details.push(`${clip.id}: ERROR ${err?.message}`);
      console.error(`[FORCE-RECALC] clip ${clip.id} failed:`, err?.message);
    }
  }

  try {
    await logAudit({
      userId: session.user.id,
      action: "FORCE_RECALC_EARNINGS",
      targetType: "SYSTEM",
      targetId: clipId || campaignId || "all",
      details: {
        mode: clipId ? "clip" : campaignId ? "campaign" : "all",
        clipId, campaignId,
        processed, updated, skipped, errors,
      },
    });
  } catch {}

  console.log(`[FORCE-RECALC] OWNER ${session.user.id} mode=${clipId ? "clip" : campaignId ? "campaign" : "all"} processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`);

  return NextResponse.json({
    processed,
    updated,
    skipped,
    errors,
    // Sample the first 50 details so a big all-site run doesn't balloon the response.
    details: details.slice(0, 50),
  });
}
