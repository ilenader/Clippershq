import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/fix-earnings
 * One-time migration: recalculates ALL approved clip earnings using the updated formula
 * (gross earnings = base + bonus, fee NOT subtracted).
 * OWNER only. Run once after deploying the fee fix.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rl = checkRoleAwareRateLimit(`fix-earnings:${session.user.id}`, 10, 60 * 60_000, role, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[FIX-EARNINGS] Starting migration...");

  const clips = await db.clip.findMany({
    where: { status: "APPROVED", isDeleted: false, videoUnavailable: false },
    include: {
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true } },
      user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
    },
  });

  let updated = 0;
  let oldTotal = 0;
  let newTotal = 0;

  for (const clip of clips) {
    oldTotal += clip.earnings || 0;

    // Honor the per-clip streak lock. Null (legacy) falls through as 0 rather
    // than retroactively applying the user's current streak — matches the new
    // locked-at-approval semantics. True backfill happens via the tracking path.
    const breakdown = recalculateClipEarningsBreakdown({
      stats: clip.stats,
      campaign: clip.campaign,
      user: clip.user || undefined,
      streakBonusPercentAtApproval: (clip as any).streakBonusPercentAtApproval ?? 0,
    });

    if (breakdown.clipperEarnings !== clip.earnings ||
        breakdown.baseEarnings !== clip.baseEarnings ||
        breakdown.bonusPercent !== clip.bonusPercent) {
      await db.clip.update({
        where: { id: clip.id },
        data: {
          earnings: breakdown.clipperEarnings,
          baseEarnings: breakdown.baseEarnings,
          bonusPercent: breakdown.bonusPercent,
          bonusAmount: breakdown.bonusAmount,
        },
      });
      updated++;
    }

    // Fix agency earnings for CPM_SPLIT campaigns (proportional to capped clipper earnings)
    if ((clip.campaign as any).pricingModel === "CPM_SPLIT" && (clip.campaign as any).ownerCpm && clip.stats[0]) {
      const cCpm = (clip.campaign as any).clipperCpm ?? (clip.campaign as any).cpmRate ?? null;
      const ownerAmt = calculateOwnerEarnings(clip.stats[0].views, (clip.campaign as any).ownerCpm, breakdown.baseEarnings, cCpm);
      if (ownerAmt > 0) {
        try {
          await db.agencyEarning.upsert({
            where: { clipId: clip.id },
            create: { campaignId: clip.campaignId, clipId: clip.id, amount: ownerAmt, views: clip.stats[0].views },
            update: { amount: ownerAmt, views: clip.stats[0].views },
          });
        } catch {}
      }
    }

    newTotal += breakdown.clipperEarnings;
  }

  // Fix agency earnings summary
  let agencyOldTotal = 0;
  let agencyNewTotal = 0;
  let agencyUpdated = 0;
  try {
    const allAgency = await db.agencyEarning.findMany({ where: { clip: { videoUnavailable: false } }, include: { clip: { include: { stats: { orderBy: { checkedAt: "desc" }, take: 1 }, campaign: { select: { clipperCpm: true, cpmRate: true, ownerCpm: true, maxPayoutPerClip: true, minViews: true, pricingModel: true } } } } } });
    for (const ae of allAgency) {
      agencyOldTotal += ae.amount || 0;
      if (ae.clip?.stats?.[0] && ae.clip?.campaign) {
        const cCpm = ae.clip.campaign.clipperCpm ?? ae.clip.campaign.cpmRate ?? null;
        const clipBreakdown = recalculateClipEarningsBreakdown({ stats: ae.clip.stats, campaign: ae.clip.campaign });
        const newOwnerAmt = calculateOwnerEarnings(ae.clip.stats[0].views, ae.clip.campaign.ownerCpm, clipBreakdown.baseEarnings, cCpm);
        if (Math.abs(newOwnerAmt - ae.amount) > 0.01) {
          await db.agencyEarning.update({ where: { id: ae.id }, data: { amount: newOwnerAmt } });
          agencyUpdated++;
        }
        agencyNewTotal += newOwnerAmt;
      } else {
        agencyNewTotal += ae.amount || 0;
      }
    }
    console.log(`[FIX-AGENCY] Updated ${agencyUpdated} records, old total $${agencyOldTotal.toFixed(2)}, new total $${agencyNewTotal.toFixed(2)}`);
  } catch (aeErr: any) {
    console.error(`[FIX-AGENCY] Error:`, aeErr?.message);
  }

  // Update all users' totalEarnings
  const users = await db.user.findMany({
    where: { role: "CLIPPER" },
    select: { id: true },
  });

  for (const user of users) {
    const userClips = await db.clip.findMany({
      where: { userId: user.id, status: "APPROVED", isDeleted: false, videoUnavailable: false },
      select: { earnings: true },
    });
    const total = userClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    await db.user.update({
      where: { id: user.id },
      data: { totalEarnings: Math.round(total * 100) / 100 },
    });
  }

  // ── Budget overflow cleanup: scale down last clips to fit within budget ──
  let budgetOverflowFixed = 0;
  try {
    const campaigns = await db.campaign.findMany({
      where: { budget: { gt: 0 }, isArchived: false },
      select: { id: true, budget: true, pricingModel: true },
    });

    for (const campaign of campaigns) {
      // Sum clipper earnings
      const clipperAgg = await db.clip.aggregate({
        where: { campaignId: campaign.id, status: "APPROVED", isDeleted: false, videoUnavailable: false },
        _sum: { earnings: true },
      });
      let totalSpent = clipperAgg._sum.earnings ?? 0;

      // Add owner earnings for CPM_SPLIT
      if (campaign.pricingModel === "CPM_SPLIT") {
        const ownerAgg = await db.agencyEarning.aggregate({
          where: { campaignId: campaign.id },
          _sum: { amount: true },
        });
        totalSpent += ownerAgg._sum.amount ?? 0;
      }

      if (totalSpent <= campaign.budget) continue; // No overflow

      const overflow = Math.round((totalSpent - campaign.budget) * 100) / 100;
      console.log(`[FIX-BUDGET] Campaign ${campaign.id}: $${totalSpent.toFixed(2)} spent of $${campaign.budget} budget, overflow=$${overflow.toFixed(2)}`);

      // Get clips ordered by approval date (newest first) — scale down newest clips first
      const campaignClips = await db.clip.findMany({
        where: { campaignId: campaign.id, status: "APPROVED", isDeleted: false, videoUnavailable: false },
        orderBy: { reviewedAt: "desc" },
        select: { id: true, earnings: true },
      });

      let remainingOverflow = overflow;
      for (const c of campaignClips) {
        if (remainingOverflow <= 0) break;
        const clipEarnings = c.earnings || 0;
        if (clipEarnings <= 0) continue;

        // Get this clip's owner earnings
        let clipOwnerAmt = 0;
        if (campaign.pricingModel === "CPM_SPLIT") {
          try {
            const ae = await db.agencyEarning.findUnique({ where: { clipId: c.id } });
            clipOwnerAmt = ae?.amount || 0;
          } catch {}
        }
        const clipTotal = clipEarnings + clipOwnerAmt;

        if (remainingOverflow >= clipTotal) {
          // Zero out this clip entirely
          await db.clip.update({ where: { id: c.id }, data: { earnings: 0 } });
          if (clipOwnerAmt > 0) {
            try { await db.agencyEarning.update({ where: { clipId: c.id }, data: { amount: 0 } }); } catch {}
          }
          remainingOverflow = Math.round((remainingOverflow - clipTotal) * 100) / 100;
          budgetOverflowFixed++;
        } else {
          // Partially reduce this clip
          const keepTotal = clipTotal - remainingOverflow;
          const scaleFactor = keepTotal / clipTotal;
          const newClipEarnings = Math.round(clipEarnings * scaleFactor * 100) / 100;
          const newOwnerAmt = Math.round(clipOwnerAmt * scaleFactor * 100) / 100;
          await db.clip.update({ where: { id: c.id }, data: { earnings: newClipEarnings } });
          if (campaign.pricingModel === "CPM_SPLIT" && clipOwnerAmt > 0) {
            try { await db.agencyEarning.update({ where: { clipId: c.id }, data: { amount: newOwnerAmt } }); } catch {}
          }
          remainingOverflow = 0;
          budgetOverflowFixed++;
        }
      }
      console.log(`[FIX-BUDGET] Campaign ${campaign.id}: overflow fixed, ${budgetOverflowFixed} clips adjusted`);

      // Auto-pause if at budget
      await db.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
      console.log(`[FIX-BUDGET] Campaign ${campaign.id}: auto-paused after budget fix`);
    }
  } catch (budgetErr: any) {
    console.error(`[FIX-BUDGET] Error:`, budgetErr?.message);
  }

  console.log(`[FIX-EARNINGS] Done: ${updated}/${clips.length} clips updated, $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`);

  return NextResponse.json({
    totalClips: clips.length,
    updated,
    oldTotal: Math.round(oldTotal * 100) / 100,
    newTotal: Math.round(newTotal * 100) / 100,
    usersUpdated: users.length,
    agencyEarnings: { updated: agencyUpdated, oldTotal: Math.round(agencyOldTotal * 100) / 100, newTotal: Math.round(agencyNewTotal * 100) / 100 },
    budgetOverflowClipsFixed: budgetOverflowFixed,
  });
}
