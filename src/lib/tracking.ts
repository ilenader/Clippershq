/**
 * Tracking system: executes scheduled checks for TikTok/Instagram clips.
 * Fetches real stats via Apify and saves new ClipStat snapshots.
 *
 * Tiered schedule:
 *   Phase 1 (0-48h after submission):  every 60 min
 *   Phase 2 (48h+): view-bracket + growth-per-hour based intervals, capped at 8h
 *
 *   Max interval: 8h (480 min) for all live clips.
 *   Actually-dead override: 12h (720 min).
 *   Tracking never stops.
 */

import { db } from "@/lib/db";
import { fetchClipStats, fetchClipStatsBatch, detectPlatform } from "@/lib/apify";
import { recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { computeFraudLevel } from "@/lib/fraud";
import { publishToUser, publishToUsers } from "@/lib/ably";
import { logCampaignEvent } from "@/lib/campaign-events";

/**
 * Determine the next check interval based on view bracket and growth per hour.
 * Phase 1 (0-48h): 60 min. Phase 2 (48h+): view-bracket + growthPerHour logic, capped at 8h.
 */
async function getNextInterval(
  currentIntervalMin: number,
  currentViews: number,
  previousViews: number,
  clipCreatedAt: Date | null,
  lastCheckedAt: Date | null,
  clipId: string,
  clipStatus?: string,
): Promise<number> {
  const hoursSinceSubmission = clipCreatedAt
    ? (Date.now() - new Date(clipCreatedAt).getTime()) / 3_600_000
    : 999;

  // Phase 1: first 48 hours → always 60 min (hourly checks for 2 days)
  if (hoursSinceSubmission <= 48) return 60;

  // Phase 2: view-bracket + growth-per-hour
  // Guard against negative growth (API glitches, view-count corrections) — treat as flat
  const viewDelta = Math.max(0, currentViews - previousViews);
  const growthPercent = previousViews > 0
    ? (viewDelta / previousViews) * 100
    : (currentViews > 0 ? 100 : 0);

  let hoursSinceLastCheck = lastCheckedAt
    ? (Date.now() - new Date(lastCheckedAt).getTime()) / 3_600_000
    : 1;
  if (hoursSinceLastCheck < 0.5) hoursSinceLastCheck = 1;

  const growthPerHour = growthPercent / hoursSinceLastCheck;

  let bracket: string;
  let interval: number;

  if (currentViews >= 100_000) {
    // Premium clips
    bracket = "premium";
    if (growthPerHour >= 15) interval = 60;
    else if (growthPerHour >= 4) interval = 120;
    else if (growthPerHour >= 2) interval = 120;
    else if (growthPerHour >= 1) interval = 240;
    else interval = 480;
    interval = Math.min(interval, 480); // max 8h
  } else if (currentViews >= 10_000) {
    // High value
    bracket = "high";
    if (growthPerHour >= 15) interval = 60;
    else if (growthPerHour >= 4) interval = 120;
    else if (growthPerHour >= 2) interval = 120;
    else if (growthPerHour >= 1) interval = 240;
    else if (growthPerHour >= 0.2) interval = 480;
    else interval = 960;
    interval = Math.min(interval, 480); // max 8h
  } else if (currentViews >= 1_000) {
    // Medium
    bracket = "medium";
    if (growthPerHour >= 4) interval = 240;
    else if (growthPerHour >= 2) interval = 240;
    else if (growthPerHour >= 1) interval = 480;
    else if (growthPerHour >= 0.2) interval = 960;
    else interval = 1440;
    interval = Math.min(interval, 480); // max 8h
  } else if (currentViews >= 200) {
    // Low
    bracket = "low";
    if (growthPerHour >= 4) interval = 240;
    else interval = 1440;
    interval = Math.min(interval, 480); // max 8h
  } else {
    // Dead
    bracket = "dead";
    interval = 480; // 8h (actually-dead override below can stretch this to 12h)
  }

  // Actually-dead check: last 3 non-manual stats, if total gain < 50 views → 12h
  try {
    const recentStats = await db.clipStat.findMany({
      where: { clipId, isManual: false },
      orderBy: { checkedAt: "desc" },
      take: 3,
      select: { views: true },
    });
    if (recentStats.length >= 3) {
      const newest = recentStats[0].views || 0;
      const oldest = recentStats[recentStats.length - 1].views || 0;
      const totalGain = newest - oldest;

      if (totalGain < 50) {
        // Actually dead → 12h (still catches delayed bot purchases twice a day)
        interval = 720;
        bracket = "actually-dead";
      }
    }

    // Resurrection check: was at the actually-dead interval (>=12h) and suddenly gained 5000+ views
    if (currentIntervalMin >= 720 && (currentViews - previousViews) >= 5000) {
      // Don't resurrect REJECTED clips — they stay at their long interval
      if (clipStatus === "REJECTED") {
        console.log(`[TRACKING-INTERVAL] Clip ${clipId} gained ${currentViews - previousViews} views but is REJECTED — skipping resurrection`);
      } else {
        interval = 120;
        bracket = "resurrected";
        console.log(`[TRACKING-INTERVAL] Clip ${clipId} resurrected: ${previousViews}→${currentViews} views, checking fraud`);

        // Run fraud check on resurrected clip
        const allStats = await db.clipStat.findMany({
          where: { clipId },
          orderBy: { checkedAt: "desc" },
          take: 10,
          select: { views: true, likes: true, comments: true, shares: true },
        });
        const fraudResult = computeFraudLevel({ stats: allStats });
        if (fraudResult.level === "FLAGGED" || fraudResult.level === "HIGH_RISK") {
          await db.clip.update({
            where: { id: clipId },
            data: { status: "FLAGGED", fraudScore: fraudResult.score, fraudReasons: JSON.stringify(fraudResult.reasons), fraudCheckedAt: new Date() },
          });
          try {
            const { createNotification } = await import("@/lib/notifications");
            const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
            for (const owner of owners) {
              await createNotification(
                owner.id,
                "CLIP_FLAGGED",
                "Resurrected clip flagged",
                `Clip gained ${currentViews - previousViews} views after being dead. Fraud: ${fraudResult.level} (score: ${fraudResult.score})`,
                { clipId, fraudScore: fraudResult.score },
              );
            }
          } catch {}
          console.log(`[TRACKING-INTERVAL] Clip ${clipId} resurrected and FLAGGED (fraud: ${fraudResult.level}, score: ${fraudResult.score})`);
        }
      }
    }
  } catch (err: any) {
    console.error(`[TRACKING-INTERVAL] Actually-dead check error for clip ${clipId}:`, err.message);
  }

  console.log(`[TRACKING-INTERVAL] clipId=${clipId} views=${currentViews} prev=${previousViews} growthPerHour=${growthPerHour.toFixed(2)}% bracket=${bracket} interval=${interval}min`);

  // Absolute safety floor — no code path should ever return < 5 min
  return Math.max(interval, 5);
}

/** Returns the next :00 hour mark from now. */
export function nextHourMark(): Date {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/**
 * Snap the next check to a :00 hour boundary that respects the interval.
 * Starts from the next :00, then adds (interval/60 - 1) extra hours.
 * 10-minute safety floor prevents checks that are too soon.
 */
export function roundToNextSlot(intervalMin: number): Date {
  if (intervalMin < 60) {
    return new Date(Date.now() + intervalMin * 60_000);
  }
  const now = Date.now();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const hoursToAdd = Math.max(0, Math.floor(intervalMin / 60) - 1);
  next.setHours(next.getHours() + hoursToAdd);
  if (next.getTime() - now < 10 * 60_000) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

/**
 * Process a single tracking job. Extracted from the main loop for parallel execution.
 */
async function processTrackingJob(
  job: any,
  source: string,
  details: string[],
  prefetchedStats?: { views: number; likes: number; comments: number; shares: number } | null,
): Promise<{ success: boolean; detail?: string; error?: string }> {
  const clip = job.clip;
  try {
    if (!clip) {
      await db.trackingJob.update({ where: { id: job.id }, data: { isActive: false } });
      console.log(`[TRACKING] Deactivated job for clip ${job.clipId} (missing clip)`);
      details.push(`Deactivated job for clip ${job.clipId} (missing clip)`);
      return { success: true, detail: "deactivated" };
    }

    console.log(`[TRACKING] Processing clip ${clip.id} (${clip.clipUrl})`);

    // Stale-job recovery logging: flag jobs overdue by 2h+ (server was down, cron crashed, etc.)
    if (job.nextCheckAt) {
      const overdueMs = Date.now() - new Date(job.nextCheckAt).getTime();
      if (overdueMs > 2 * 60 * 60 * 1000) {
        console.log(`[TRACKING] Recovering stale job ${job.id} — overdue by ${Math.round(overdueMs / 60_000)}min`);
      }
    }

    // Use prefetched stats when available; fall back to individual fetch if batch missed this clip
    let stats = prefetchedStats;
    if (stats === null || stats === undefined) {
      try {
        console.log(`[TRACKING] Clip ${clip.id}: batch miss, trying individual fetch`);
        stats = await fetchClipStats(clip.clipUrl);
        console.log(`[TRACKING] Clip ${clip.id}: individual fetch succeeded, views=${stats.views}`);
      } catch (fetchErr: any) {
        await db.trackingJob.update({
          where: { id: job.id },
          data: { nextCheckAt: roundToNextSlot(60), lastCheckedAt: new Date() },
        }).catch(() => {});
        console.log(`[TRACKING] Clip ${clip.id}: individual fetch also failed, retry in ~1h`);
        details.push(`Clip ${clip.id}: fetch failed, retry in ~1h`);
        return { success: true, detail: "fetch-failed" };
      }
    }

    // Get previous snapshot for growth calculation
    const prevStat = await db.clipStat.findFirst({
      where: { clipId: clip.id, ...(source === "cron" ? { isManual: false } : {}) },
      orderBy: { checkedAt: "desc" },
    });
    const prevViews = prevStat?.views ?? 0;

    console.log(`[TRACKING] Clip ${clip.id}: ${prevViews} → ${stats.views} views (${source})`);

    // Video restoration: if clip was flagged unavailable but stats are now valid
    if ((clip as any).videoUnavailable && stats.views > 0) {
      const savedE = (clip as any).savedEarnings ?? 0;
      await db.clip.update({
        where: { id: clip.id },
        data: { videoUnavailable: false, videoUnavailableSince: null, earnings: savedE, savedEarnings: null },
      });
      console.log(`[TRACKING] Video restored for clip ${clip.id} — earnings unfrozen ($${savedE})`);
    }

    // Save new snapshot.
    // For cron, write it atomically with a short-term nextCheckAt bump so that if Vercel
    // kills the function before the final trackingJob.update below, the next cron run
    // won't immediately re-pick-up this clip and create a duplicate snapshot.
    // Manual checks don't touch nextCheckAt (preserves cron schedule per existing contract).
    if (source === "manual") {
      await db.clipStat.create({
        data: {
          clipId: clip.id,
          isManual: true,
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
          shares: stats.shares,
        },
      });
    } else {
      await db.$transaction([
        db.clipStat.create({
          data: {
            clipId: clip.id,
            isManual: false,
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
          },
        }),
        db.trackingJob.update({
          where: { id: job.id },
          data: { lastCheckedAt: new Date(), nextCheckAt: roundToNextSlot(job.checkIntervalMin || 60) },
        }),
      ]);
    }

    // ── Fraud detection ──
    try {
      const allStats = await db.clipStat.findMany({
        where: { clipId: clip.id },
        orderBy: { checkedAt: "desc" },
        take: 10,
        select: { views: true, likes: true, comments: true, shares: true },
      });
      const fraudResult = computeFraudLevel({ stats: allStats });
      await db.clip.update({
        where: { id: clip.id },
        data: { fraudScore: fraudResult.score, fraudReasons: JSON.stringify(fraudResult.reasons), fraudCheckedAt: new Date() },
      });

      if (fraudResult.score >= 30 && clip.status === "PENDING") {
        await db.clip.update({ where: { id: clip.id }, data: { status: "FLAGGED" } });
        try {
          const { createNotification } = await import("@/lib/notifications");
          const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
          for (const owner of owners) {
            await createNotification(owner.id, "CLIP_FLAGGED", "Clip flagged for review",
              `A clip was automatically flagged: ${fraudResult.reasons[0] || "Suspicious activity detected"}`,
              { clipId: clip.id, fraudScore: fraudResult.score });
          }
        } catch {}
        details.push(`Clip ${clip.id}: AUTO-FLAGGED (fraud score: ${fraudResult.score})`);
      }
    } catch (fraudErr: any) {
      console.error(`[TRACKING] Fraud detection error for clip ${clip.id}:`, fraudErr.message);
    }

    // ── Earnings recalculation ──
    const freshCampaign = await db.campaign.findUnique({
      where: { id: clip.campaignId },
      select: { status: true, budget: true, lastBudgetPauseAt: true },
    });

    // Banned users: still save stats (for view tracking), but skip earnings recalculation so they can't earn further
    const userBanned = (clip as any).user?.status === "BANNED";
    if (userBanned) {
      console.log(`[TRACKING] Clip ${clip.id}: user is BANNED — stats saved but earnings frozen`);
    }

    if (!userBanned && clip.status === "APPROVED" && clip.campaign && freshCampaign?.status !== "PAUSED" && freshCampaign?.status !== "ARCHIVED") {
      // Budget-lock: old clips from before a budget pause keep their earnings
      const oldEarnings = clip.earnings || 0;
      const budgetPauseAt = freshCampaign?.lastBudgetPauseAt ? new Date(freshCampaign.lastBudgetPauseAt) : null;
      if (budgetPauseAt && new Date(clip.createdAt) < budgetPauseAt && oldEarnings > 0) {
        console.log(`[BUDGET-LOCK] Clip ${clip.id} locked at $${clip.earnings} — submitted before budget pause`);
        // Still update stats below, but skip earnings recalculation
      } else {
      // Normal earnings calculation.
      // Fetch current gamification state so the clip is recomputed with TODAY's bonus,
      // not whatever was stored on the User row at the last write. getGamificationState
      // is 30s-cached per instance and internally triggers streak eval — so if the streak
      // just broke, recalculateUnpaidEarnings already fired for ALL unpaid clips before
      // we reach here. Fall back to stored level/streak/PWA on any failure.
      let currentBonusOverride: number | undefined;
      try {
        const { getGamificationState } = await import("@/lib/gamification");
        const gamState = await getGamificationState(clip.userId);
        if (gamState) currentBonusOverride = gamState.bonusPercent;
      } catch (gamErr: any) {
        console.error(`[TRACKING] getGamificationState failed for clip ${clip.id}:`, gamErr?.message);
      }

      const breakdown = recalculateClipEarningsBreakdown({
        stats: [{ views: stats.views }],
        campaign: clip.campaign,
        user: clip.user,
        bonusOverride: currentBonusOverride,
      });
      let newEarnings = breakdown.clipperEarnings;

      const isCpmSplit = (clip.campaign as any).pricingModel === "CPM_SPLIT" && (clip.campaign as any).ownerCpm;
      const cCpm = isCpmSplit ? ((clip.campaign as any).clipperCpm ?? (clip.campaign as any).cpmRate) : null;
      let newOwnerAmt = isCpmSplit
        ? calculateOwnerEarnings(stats.views, (clip.campaign as any).ownerCpm, breakdown.baseEarnings, cCpm)
        : 0;

      // Budget cap + earnings save — serializable transaction to prevent race conditions
      let autoPausedBudget: number | null = null;
      let autoPausedSpent: number | null = null;
      try {
        await db.$transaction(async (tx: any) => {
          // Inline budget status using tx (not external getCampaignBudgetStatus which uses its own db)
          const txCampaign = await tx.campaign.findUnique({
            where: { id: clip.campaignId },
            select: { budget: true, pricingModel: true },
          });
          if (txCampaign?.budget && txCampaign.budget > 0) {
            const earningsAgg = await tx.clip.aggregate({
              where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED", videoUnavailable: false },
              _sum: { earnings: true },
            });
            let spent = Math.round((earningsAgg._sum.earnings ?? 0) * 100) / 100;
            if (txCampaign.pricingModel === "CPM_SPLIT") {
              const ownerAgg = await tx.agencyEarning.aggregate({
                where: { campaignId: clip.campaignId },
                _sum: { amount: true },
              });
              spent = Math.round((spent + (ownerAgg._sum.amount ?? 0)) * 100) / 100;
            }

            const freshClip = await tx.clip.findUnique({ where: { id: clip.id }, select: { earnings: true } });
            const currentClipEarnings = freshClip?.earnings || 0;
            let thisClipCurrentOwner = 0;
            if (isCpmSplit) {
              const existingAe = await tx.agencyEarning.findUnique({ where: { clipId: clip.id } });
              thisClipCurrentOwner = existingAe?.amount || 0;
            }

            const otherSpent = spent - currentClipEarnings - thisClipCurrentOwner;
            const remaining = Math.max(txCampaign.budget - otherSpent, 0);
            const totalForThisClip = newEarnings + newOwnerAmt;

            console.log(`[BUDGET-CHECK] Campaign: ${clip.campaignId} Budget: $${txCampaign.budget} Spent: $${spent.toFixed(2)} This clip: $${currentClipEarnings} Remaining: $${remaining.toFixed(2)} New: $${newEarnings}+$${newOwnerAmt}`);

            if (remaining <= 0) {
              newEarnings = currentClipEarnings;
              newOwnerAmt = thisClipCurrentOwner;
              console.log(`[BUDGET-CHECK] No budget remaining, keeping current for clip ${clip.id}`);
            } else if (totalForThisClip > remaining) {
              const clipperCpmVal = (clip.campaign as any).clipperCpm || (clip.campaign as any).cpmRate || 1;
              const ownerCpmVal = (clip.campaign as any).ownerCpm || 0;
              const totalCpm = clipperCpmVal + ownerCpmVal;
              newOwnerAmt = Math.round(remaining * (ownerCpmVal / totalCpm) * 100) / 100;
              newEarnings = Math.round(remaining * (clipperCpmVal / totalCpm) * 100) / 100;
              if (newEarnings + newOwnerAmt > remaining) newEarnings = Math.round((remaining - newOwnerAmt) * 100) / 100;
              newEarnings = Math.max(newEarnings, 0);
              newOwnerAmt = Math.max(newOwnerAmt, 0);
              console.log(`[BUDGET-CHECK] Ratio-capped: clipper=$${newEarnings} owner=$${newOwnerAmt} remaining=$${remaining.toFixed(2)}`);
            }

            // Auto-pause
            const newTotalSpent = otherSpent + newEarnings + newOwnerAmt;
            if (Math.round(newTotalSpent * 100) / 100 >= Math.round(txCampaign.budget * 100) / 100) {
              await tx.campaign.update({ where: { id: clip.campaignId }, data: { status: "PAUSED", lastBudgetPauseAt: new Date() } });
              autoPausedBudget = txCampaign.budget;
              autoPausedSpent = newTotalSpent;
              console.log(`[BUDGET] Campaign ${clip.campaignId} paused — budget $${txCampaign.budget} reached`);
              details.push(`Campaign ${clip.campaignId}: AUTO-PAUSED (budget $${txCampaign.budget} reached)`);
            }
          }

          // Save earnings inside the transaction
          if (newEarnings !== (clip.earnings || 0)) {
            await tx.clip.update({
              where: { id: clip.id },
              data: { earnings: newEarnings, baseEarnings: breakdown.baseEarnings, bonusPercent: breakdown.bonusPercent, bonusAmount: breakdown.bonusAmount },
            });
          }

          // Save owner earnings inside the transaction
          if (isCpmSplit) {
            if (newOwnerAmt > 0) {
              await tx.agencyEarning.upsert({
                where: { clipId: clip.id },
                create: { campaignId: clip.campaignId, clipId: clip.id, amount: newOwnerAmt, views: stats.views },
                update: { amount: newOwnerAmt, views: stats.views },
              });
            } else {
              try { await tx.agencyEarning.delete({ where: { clipId: clip.id } }); } catch {}
            }
          }
        }, { isolationLevel: "Serializable" as any });
      } catch (txErr: any) {
        if (txErr?.code === "P2034" && source === "manual") {
          // Manual checks have no cron retry — wait 500ms and try once more
          console.log(`[BUDGET] Transaction conflict for clip ${clip.id}, retrying in 500ms (manual)`);
          await new Promise((r) => setTimeout(r, 500));
          try {
            await db.$transaction(async (tx: any) => {
              const txCampaign = await tx.campaign.findUnique({ where: { id: clip.campaignId }, select: { budget: true, pricingModel: true } });
              if (txCampaign?.budget && txCampaign.budget > 0) {
                const earningsAgg = await tx.clip.aggregate({ where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED", videoUnavailable: false }, _sum: { earnings: true } });
                let spent = Math.round((earningsAgg._sum.earnings ?? 0) * 100) / 100;
                if (txCampaign.pricingModel === "CPM_SPLIT") {
                  const ownerAgg = await tx.agencyEarning.aggregate({ where: { campaignId: clip.campaignId }, _sum: { amount: true } });
                  spent = Math.round((spent + (ownerAgg._sum.amount ?? 0)) * 100) / 100;
                }
                const freshClip = await tx.clip.findUnique({ where: { id: clip.id }, select: { earnings: true } });
                const currentClipEarnings = freshClip?.earnings || 0;
                let thisClipCurrentOwner = 0;
                if (isCpmSplit) {
                  const existingAe = await tx.agencyEarning.findUnique({ where: { clipId: clip.id } });
                  thisClipCurrentOwner = existingAe?.amount || 0;
                }
                const otherSpent = spent - currentClipEarnings - thisClipCurrentOwner;
                const remaining = Math.max(txCampaign.budget - otherSpent, 0);
                const totalForThisClip = newEarnings + newOwnerAmt;
                if (remaining <= 0) { newEarnings = currentClipEarnings; newOwnerAmt = thisClipCurrentOwner; }
                else if (totalForThisClip > remaining) {
                  const clipperCpmVal = (clip.campaign as any).clipperCpm || (clip.campaign as any).cpmRate || 1;
                  const ownerCpmVal = (clip.campaign as any).ownerCpm || 0;
                  const totalCpm = clipperCpmVal + ownerCpmVal;
                  newOwnerAmt = Math.round(remaining * (ownerCpmVal / totalCpm) * 100) / 100;
                  newEarnings = Math.round(remaining * (clipperCpmVal / totalCpm) * 100) / 100;
                  if (newEarnings + newOwnerAmt > remaining) newEarnings = Math.round((remaining - newOwnerAmt) * 100) / 100;
                  newEarnings = Math.max(newEarnings, 0); newOwnerAmt = Math.max(newOwnerAmt, 0);
                }
                const newTotalSpent = otherSpent + newEarnings + newOwnerAmt;
                if (Math.round(newTotalSpent * 100) / 100 >= Math.round(txCampaign.budget * 100) / 100) {
                  await tx.campaign.update({ where: { id: clip.campaignId }, data: { status: "PAUSED", lastBudgetPauseAt: new Date() } });
                  autoPausedBudget = txCampaign.budget; autoPausedSpent = newTotalSpent;
                  details.push(`Campaign ${clip.campaignId}: AUTO-PAUSED (budget $${txCampaign.budget} reached)`);
                }
              }
              if (newEarnings !== (clip.earnings || 0)) {
                await tx.clip.update({ where: { id: clip.id }, data: { earnings: newEarnings, baseEarnings: breakdown.baseEarnings, bonusPercent: breakdown.bonusPercent, bonusAmount: breakdown.bonusAmount } });
              }
              if (isCpmSplit) {
                if (newOwnerAmt > 0) { await tx.agencyEarning.upsert({ where: { clipId: clip.id }, create: { campaignId: clip.campaignId, clipId: clip.id, amount: newOwnerAmt, views: stats.views }, update: { amount: newOwnerAmt, views: stats.views } }); }
                else { try { await tx.agencyEarning.delete({ where: { clipId: clip.id } }); } catch {} }
              }
            }, { isolationLevel: "Serializable" as any });
            console.log(`[BUDGET] Retry succeeded for clip ${clip.id}`);
          } catch (retryErr: any) {
            console.error(`[BUDGET] Retry also failed for clip ${clip.id}:`, retryErr?.message);
            newEarnings = clip.earnings || 0;
            newOwnerAmt = 0;
          }
        } else if (txErr?.code === "P2034") {
          console.log(`[BUDGET] Transaction conflict for clip ${clip.id}, will retry next cron`);
          newEarnings = clip.earnings || 0;
          newOwnerAmt = 0;
        } else {
          console.error(`[BUDGET-CHECK] Transaction error for clip ${clip.id}:`, txErr?.message);
          newEarnings = clip.earnings || 0;
          newOwnerAmt = 0;
        }
      }

      // Log auto-pause event outside transaction
      if (autoPausedBudget != null) {
        logCampaignEvent(clip.campaignId, "AUTO_PAUSED", `Campaign auto-paused — budget of $${autoPausedBudget} reached (spent: $${Number(autoPausedSpent).toFixed(2)})`, { budget: autoPausedBudget, spent: autoPausedSpent });
      }

      const earningsChanged = newEarnings !== oldEarnings;

      // Sync user stats/level
      if (earningsChanged && clip.userId && !clip.isOwnerOverride) {
        const allClips = await db.clip.findMany({
          where: { userId: clip.userId, status: "APPROVED", isOwnerOverride: false, videoUnavailable: false },
          select: { earnings: true },
          take: 5000,
        });
        const allStatSnapshots = await db.clipStat.findMany({
          where: { clip: { userId: clip.userId, isOwnerOverride: false, videoUnavailable: false } },
          orderBy: { checkedAt: "desc" as any },
          distinct: ["clipId" as any],
          take: 5000,
          select: { views: true },
        });
        const totalEarnings = allClips.reduce((sum: number, c: any) => sum + (c.earnings || 0), 0);
        const totalViews = allStatSnapshots.reduce((sum: number, s: any) => sum + (s.views || 0), 0);
        await db.user.update({
          where: { id: clip.userId },
          data: { totalEarnings: Math.round(totalEarnings * 100) / 100, totalViews },
        });
        const { updateUserLevel } = await import("@/lib/gamification");
        await updateUserLevel(clip.userId);
      }

      // Broadcast real-time update
      if (earningsChanged && clip.userId) {
        try {
          publishToUser(clip.userId, "clip_updated", { clipId: clip.id, views: stats.views, earnings: newEarnings }).catch(() => {});
          publishToUser(clip.userId, "earnings_updated", { reason: "tracking" }).catch(() => {});
        } catch {}
      }
    } // end budget-lock else
    } else if (clip.status === "APPROVED" && (freshCampaign?.status === "PAUSED" || freshCampaign?.status === "ARCHIVED")) {
      console.log(`[BUDGET-CHECK] Skipping earnings for clip ${clip.id} — campaign is ${freshCampaign?.status}`);
    }

    // ── Next interval ──
    let newInterval: number;
    if (clip.status === "REJECTED") {
      newInterval = 2880;
    } else if (clip.isOwnerOverride) {
      newInterval = await getNextInterval(job.checkIntervalMin, stats.views, prevViews, clip.createdAt, job.lastCheckedAt, clip.id, clip.status);
      newInterval = Math.min(newInterval, 480);
    } else {
      newInterval = await getNextInterval(job.checkIntervalMin, stats.views, prevViews, clip.createdAt, job.lastCheckedAt, clip.id, clip.status);
    }
    const nextCheck = roundToNextSlot(newInterval);

    if (source === "manual") {
      await db.trackingJob.update({ where: { id: job.id }, data: { lastCheckedAt: new Date() } });
      console.log(`[TRACKING] Clip ${clip.id}: manual check done (cron schedule preserved)`);
    } else {
      await db.trackingJob.update({
        where: { id: job.id },
        data: { lastCheckedAt: new Date(), nextCheckAt: nextCheck, checkIntervalMin: newInterval },
      });
      console.log(`[TRACKING] Clip ${clip.id}: next check at ${nextCheck.toISOString()} (interval: ${newInterval}min)`);
    }
    details.push(`Clip ${clip.id}: ${prevViews}→${stats.views} views, next in ${newInterval}min`);
    return { success: true };
  } catch (err: any) {
    console.error(`[TRACKING] Error on job ${job.id}:`, err.message);
    details.push(`Error on job ${job.id}: ${err.message}`);

    // Detect video unavailability (deleted/private/removed)
    const isUnavailable = /not found|no results|private|removed|unavailable/i.test(err.message);
    if (isUnavailable && clip?.status === "APPROVED") {
      try {
        const clipData = await db.clip.findUnique({ where: { id: clip.id }, select: { videoUnavailable: true, earnings: true } });
        if (clipData && !clipData.videoUnavailable) {
          // First detection — flag and freeze earnings
          await db.clip.update({
            where: { id: clip.id },
            data: { videoUnavailable: true, videoUnavailableSince: new Date(), savedEarnings: clipData.earnings, earnings: 0 },
          });
          try { await db.agencyEarning.delete({ where: { clipId: clip.id } }); } catch {}
          // Slow tracking to daily
          await db.trackingJob.update({
            where: { id: job.id },
            data: { nextCheckAt: roundToNextSlot(1440), lastCheckedAt: new Date(), checkIntervalMin: 1440 },
          }).catch(() => {});
          // Notify all owners
          try {
            const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
            const campName = (await db.campaign.findUnique({ where: { id: clip.campaignId }, select: { name: true } }))?.name || "campaign";
            for (const owner of owners) {
              const { createNotification } = await import("@/lib/notifications");
              createNotification(owner.id, "CLIP_FLAGGED", "Video unavailable", `Video unavailable for clip in ${campName} — manual review needed. URL: ${clip.clipUrl}`).catch(() => {});
            }
          } catch {}
          console.log(`[TRACKING] Video unavailable for clip ${clip.id} — earnings frozen, slow-tracking enabled`);
          details.push(`Clip ${clip.id}: VIDEO UNAVAILABLE — earnings frozen`);
          return { success: true, detail: "video-unavailable" };
        }
      } catch (unavErr: any) {
        console.error(`[TRACKING] Video unavailability check failed:`, unavErr?.message);
      }
    }

    await db.trackingJob.update({
      where: { id: job.id },
      data: { nextCheckAt: roundToNextSlot(60), lastCheckedAt: new Date() },
    }).catch(() => {});
    return { success: false, error: err.message };
  }
}

/**
 * Execute tracking jobs. Called by the cron endpoint or manual trigger.
 * Processes campaigns in parallel, clips within same campaign sequentially (budget-safe).
 * @param options.campaignIds - If provided, only check clips from these campaigns (ignores nextCheckAt)
 * @param options.source - "cron" or "manual" — manual checks don't change the next scheduled cron time
 */
export async function runDueTrackingJobs(options?: { campaignIds?: string[]; source?: "cron" | "manual"; includeInactive?: boolean }): Promise<{ processed: number; errors: number; details: string[] }> {
  if (!db) return { processed: 0, errors: 0, details: ["DB unavailable"] };

  const source = options?.source || "cron";
  const campaignIds = options?.campaignIds;
  console.log(`[TRACKING] TRACKING RUNNING (${source}) at`, new Date().toISOString());

  const details: string[] = [];
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  const processedCampaignIds = new Set<string>();
  let ownerIds: string[] = [];
  let progressCounter = 0;

  try {
    const where: any = options?.includeInactive ? {} : { isActive: true };
    if (campaignIds && campaignIds.length > 0) {
      where.campaignId = { in: campaignIds };
    } else {
      where.nextCheckAt = { lte: new Date() };
    }

    const dueJobs = await db.trackingJob.findMany({
      where,
      include: {
        clip: {
          select: {
            id: true, userId: true, clipUrl: true, status: true, earnings: true,
            campaignId: true, createdAt: true, isOwnerOverride: true, videoUnavailable: true, savedEarnings: true,
            campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true } },
            user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true, status: true } },
          },
        },
      },
      take: campaignIds ? 50 : 500,
    });

    console.log(`[TRACKING] Found ${dueJobs.length} due jobs`);
    details.push(`Found ${dueJobs.length} due jobs`);

    // One-time migration: clamp stale intervals left over from before the 8h (480 min) cap was
    // introduced. Once every active job cycles through, this becomes a no-op. REJECTED clips
    // keep their longer interval (2880 min per the REJECTED branch below).
    for (const job of dueJobs as any[]) {
      if ((job.checkIntervalMin || 0) > 480 && job.clip?.status !== "REJECTED") {
        try {
          await db.trackingJob.update({
            where: { id: job.id },
            data: { checkIntervalMin: 480 },
          });
          job.checkIntervalMin = 480;
          console.log(`[TRACKING] Clamped stale interval on job ${job.id} from >${480}min → 480min`);
        } catch (clampErr: any) {
          console.error(`[TRACKING] Failed to clamp interval for job ${job.id}:`, clampErr?.message);
        }
      }
    }

    // For manual checks, broadcast progress to all owners via SSE
    if (source === "manual") {
      try {
        const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true }, take: 10 });
        ownerIds = owners.map((o: any) => o.id);
        if (dueJobs.length === 0) {
          // No clips to check — broadcast completed immediately
          publishToUsers(ownerIds, "tracking_progress", { status: "completed", total: 0, processed: 0, errors: 0 }).catch(() => {});
        } else {
          publishToUsers(ownerIds, "tracking_progress", { status: "started", total: dueJobs.length, processed: 0 }).catch(() => {});
        }
      } catch {}
    }

    // Group jobs by campaign: parallel across campaigns, sequential within same campaign
    // This prevents budget overflow from parallel clips in the same campaign
    const jobsByCampaign: Record<string, any[]> = {};
    for (const job of dueJobs) {
      const cId = job.clip?.campaignId || "unknown";
      if (!jobsByCampaign[cId]) jobsByCampaign[cId] = [];
      jobsByCampaign[cId].push(job);
      if (cId !== "unknown") processedCampaignIds.add(cId);
    }

    const campaignGroupIds = Object.keys(jobsByCampaign);
    const CAMPAIGN_BATCH_SIZE = source === "manual" ? 20 : 15;
    const CLIP_BATCH_SIZE = source === "manual" ? 10 : 5;
    console.log(`[TRACKING] ${dueJobs.length} jobs across ${campaignGroupIds.length} campaigns (${source}, campaignBatch=${CAMPAIGN_BATCH_SIZE})`);

    for (let i = 0; i < campaignGroupIds.length; i += CAMPAIGN_BATCH_SIZE) {
      if (Date.now() - startTime > 280_000) {
        details.push(`Stopped early — 280s timeout. ${processed} processed.`);
        break;
      }

      const campaignBatch = campaignGroupIds.slice(i, i + CAMPAIGN_BATCH_SIZE);
      console.log(`[TRACKING] Processing ${campaignBatch.length} campaigns in parallel`);

      const results = await Promise.allSettled(
        campaignBatch.map(async (cId: string) => {
          const jobs = jobsByCampaign[cId];
          let campaignProcessed = 0;
          let campaignErrors = 0;

          // Batch-fetch stats for ALL clips in this campaign in as few Apify calls as possible
          // (one per platform). Each job gets stats via the Map; individual fallback if batch fails.
          let prefetchedStats = new Map<string, { views: number; likes: number; comments: number; shares: number } | null>();
          try {
            const batchInput = jobs
              .filter((j: any) => j.clip?.clipUrl)
              .map((j: any) => ({
                url: j.clip.clipUrl,
                platform: detectPlatform(j.clip.clipUrl) || "unknown",
                clipId: j.clipId,
              }));
            prefetchedStats = await fetchClipStatsBatch(batchInput);
          } catch (batchErr: any) {
            console.error(`[TRACKING] fetchClipStatsBatch threw for campaign ${cId}:`, batchErr?.message);
            // Empty map → processTrackingJob falls back to individual fetchClipStats for each clip
          }

          // Parallel batches for both cron and manual
          // Budget is protected by Serializable transactions that retry on conflict
          for (let b = 0; b < jobs.length; b += CLIP_BATCH_SIZE) {
            if (Date.now() - startTime > 280_000) break;
            const batch = jobs.slice(b, b + CLIP_BATCH_SIZE);
            const batchResults = await Promise.allSettled(
              batch.map((job: any) => {
                const stats = prefetchedStats.has(job.clipId) ? prefetchedStats.get(job.clipId) : undefined;
                return processTrackingJob(job, source, details, stats);
              }),
            );
            for (const r of batchResults) {
              if (r.status === "fulfilled" && r.value.success) campaignProcessed++;
              else campaignErrors++;
              progressCounter++;
              if (source === "manual") {
                publishToUsers(ownerIds, "tracking_progress", { status: "processing", total: dueJobs.length, processed: progressCounter }).catch(() => {});
              }
            }
          }

          return { campaignProcessed, campaignErrors };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          processed += result.value.campaignProcessed;
          errors += result.value.campaignErrors;
        } else {
          errors++;
        }
      }
    }
  } catch (err: any) {
    console.error("[TRACKING] Fatal error:", err.message);
    details.push(`Fatal error: ${err.message}`);
    errors++;
  }

  // Final budget sweep: pause any campaigns that hit budget during this run
  try {
    const { getCampaignBudgetStatus } = await import("@/lib/balance");
    for (const cId of processedCampaignIds) {
      const bs = await getCampaignBudgetStatus(cId);
      if (bs && bs.budget > 0 && Math.round(bs.spent * 100) / 100 >= Math.round(bs.budget * 100) / 100) {
        const campaign = await db.campaign.findUnique({ where: { id: cId }, select: { status: true } });
        if (campaign && campaign.status === "ACTIVE") {
          await db.campaign.update({ where: { id: cId }, data: { status: "PAUSED", lastBudgetPauseAt: new Date() } });
          console.log(`[BUDGET] Final sweep: Campaign ${cId} auto-paused — spent $${bs.spent.toFixed(2)} of $${bs.budget}`);
          details.push(`Campaign ${cId}: AUTO-PAUSED in final sweep`);
          logCampaignEvent(cId, "AUTO_PAUSED", `Campaign auto-paused in final sweep — spent $${bs.spent.toFixed(2)} of $${bs.budget}`, { budget: bs.budget, spent: bs.spent });
        }
      }
    }
  } catch (sweepErr: any) {
    console.error(`[BUDGET] Sweep error:`, sweepErr.message);
  }

  // Broadcast completion to owners for manual checks
  if (source === "manual" && ownerIds.length > 0) {
    publishToUsers(ownerIds, "tracking_progress", { status: "completed", total: progressCounter, processed: progressCounter, errors }).catch(() => {});
  }

  console.log(`[TRACKING] Completed: ${processed} processed, ${errors} errors`);
  if (source === "manual") {
    // Manual "Check Clips Now" reliability signal — if (due - processed - errors) > 0, we
    // either hit the 280s timeout or processedCampaignIds starvation; check the details[].
    // campaignIds filter (if set) already scopes this down — full-unfiltered manual runs over
    // 500 clips are expected to partially-complete.
    const due = (details.find((d) => d.startsWith("Found")) || "").match(/(\d+)/)?.[1] || "?";
    console.log(`[TRACKING] Manual check summary: ${processed}/${due} processed, ${errors} errors, elapsed=${Math.round((Date.now() - startTime) / 1000)}s`);
  }
  return { processed, errors, details };
}
