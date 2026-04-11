/**
 * Tracking system: executes scheduled checks for TikTok/Instagram clips.
 * Fetches real stats via Apify and saves new ClipStat snapshots.
 *
 * Tiered schedule:
 *   Phase 1 (0-4h after submission):   every 60 min
 *   Phase 2 (4-24h after submission):  every 120 min
 *   Phase 3 (24h+): view-bracket + growth-per-hour based intervals
 *
 *   Tiers: 1h → 2h → 4h → 8h → 16h → 24h → 48h (72h for actually-dead only)
 *   Tracking never stops.
 */

import { db } from "@/lib/db";
import { fetchClipStats } from "@/lib/apify";
import { recalculateClipEarnings, recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { computeFraudLevel } from "@/lib/fraud";
import { broadcastToUser } from "@/lib/sse-broadcast";

/** Interval tiers in minutes: 1h → 2h → 4h → 8h → 16h → 24h → 48h */
const TIERS = [60, 120, 240, 480, 960, 1440, 2880];

/**
 * Determine the next check interval based on view bracket and growth per hour.
 * Phase 1 (0-4h): 60 min. Phase 2 (4-24h): 120 min.
 * Phase 3 (24h+): view-bracket + growthPerHour logic.
 */
async function getNextInterval(
  currentIntervalMin: number,
  currentViews: number,
  previousViews: number,
  clipCreatedAt: Date | null,
  lastCheckedAt: Date | null,
  clipId: string,
): Promise<number> {
  const hoursSinceSubmission = clipCreatedAt
    ? (Date.now() - new Date(clipCreatedAt).getTime()) / 3_600_000
    : 999;

  // Phase 1: first 4 hours → always 60 min
  if (hoursSinceSubmission <= 4) return 60;

  // Phase 2: hours 4-24 → always 120 min
  if (hoursSinceSubmission <= 24) return 120;

  // Phase 3: view-bracket + growth-per-hour
  const growthPercent = previousViews > 0
    ? ((currentViews - previousViews) / previousViews) * 100
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
    interval = Math.min(interval, 960); // max 16h
  } else if (currentViews >= 10_000) {
    // High value
    bracket = "high";
    if (growthPerHour >= 15) interval = 60;
    else if (growthPerHour >= 4) interval = 120;
    else if (growthPerHour >= 2) interval = 120;
    else if (growthPerHour >= 1) interval = 240;
    else if (growthPerHour >= 0.2) interval = 480;
    else interval = 960;
    interval = Math.min(interval, 1440); // max 24h
  } else if (currentViews >= 1_000) {
    // Medium
    bracket = "medium";
    if (growthPerHour >= 4) interval = 240;
    else if (growthPerHour >= 2) interval = 240;
    else if (growthPerHour >= 1) interval = 480;
    else if (growthPerHour >= 0.2) interval = 960;
    else interval = 1440;
    interval = Math.min(interval, 1440); // max 24h
  } else if (currentViews >= 200) {
    // Low
    bracket = "low";
    if (growthPerHour >= 4) interval = 240;
    else interval = 1440;
    interval = Math.min(interval, 1440); // max 24h
  } else {
    // Dead
    bracket = "dead";
    interval = 1440;
    // max 48h (capped below by actually-dead check)
  }

  // Actually-dead check: last 3 non-manual stats, if total gain < 50 views → 72h
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
        // Actually dead → 72h
        interval = 4320;
        bracket = "actually-dead";
      }
    }

    // Resurrection check: was at 72h (actually-dead) and suddenly gained 5000+ views
    if (currentIntervalMin === 4320 && (currentViews - previousViews) >= 5000) {
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
  } catch (err: any) {
    console.error(`[TRACKING-INTERVAL] Actually-dead check error for clip ${clipId}:`, err.message);
  }

  console.log(`[TRACKING-INTERVAL] clipId=${clipId} views=${currentViews} prev=${previousViews} growthPerHour=${growthPerHour.toFixed(2)}% bracket=${bracket} interval=${interval}min`);

  return interval;
}

/**
 * Round to the next clean hour slot based on interval.
 * 60min → next round hour. 120min → next even hour. 240min → next 4h mark. etc.
 */
export function roundToNextSlot(intervalMin: number): Date {
  const now = new Date();
  const hour = now.getUTCHours();
  let next: Date;

  if (intervalMin <= 60) {
    next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour + 1);
  } else {
    const intervalHours = intervalMin / 60;
    const nextSlotHour = Math.ceil((hour + 1) / intervalHours) * intervalHours;
    next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    if (nextSlotHour >= 24) {
      next.setUTCHours(0);
      next.setUTCDate(next.getUTCDate() + Math.floor(nextSlotHour / 24));
      next.setUTCHours(nextSlotHour % 24);
    } else {
      next.setUTCHours(nextSlotHour);
    }
  }

  // Safety floor: if next slot is less than 10 minutes away, push to the following slot.
  // This prevents a clip created at e.g. 3:55 from targeting 4:00 when the cron already started.
  const minTime = new Date(Date.now() + 10 * 60 * 1000);
  if (next < minTime) {
    next = new Date(next.getTime() + intervalMin * 60 * 1000);
  }

  return next;
}

/**
 * Execute tracking jobs. Called by the cron endpoint or manual trigger.
 * @param options.campaignIds - If provided, only check clips from these campaigns (ignores nextCheckAt)
 * @param options.source - "cron" or "manual" — manual checks don't change the next scheduled cron time
 */
export async function runDueTrackingJobs(options?: { campaignIds?: string[]; source?: "cron" | "manual" }): Promise<{ processed: number; errors: number; details: string[] }> {
  if (!db) return { processed: 0, errors: 0, details: ["DB unavailable"] };

  const source = options?.source || "cron";
  const campaignIds = options?.campaignIds;
  console.log(`[TRACKING] TRACKING RUNNING (${source}) at`, new Date().toISOString());

  const details: string[] = [];
  let processed = 0;
  let errors = 0;
  const startTime = Date.now();

  try {
    // Build query: for manual checks with campaign filter, ignore nextCheckAt
    const where: any = { isActive: true };
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
            id: true,
            userId: true,
            clipUrl: true,
            status: true,
            earnings: true,
            campaignId: true,
            createdAt: true,
            isOwnerOverride: true,
            campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true } },
            user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
          },
        },
      },
      take: campaignIds ? 15 : 20,
    });

    console.log(`[TRACKING] Found ${dueJobs.length} due jobs`);
    details.push(`Found ${dueJobs.length} due jobs`);

    for (const job of dueJobs) {
      // Timeout safety: stop after 50 seconds to avoid Vercel function timeout
      if (Date.now() - startTime > 50000) {
        details.push(`Stopped early — 50s timeout. ${processed} processed, ${dueJobs.length - processed} remaining.`);
        break;
      }
      try {
        const clip = job.clip;
        // Deactivate only if clip is missing
        if (!clip) {
          await db.trackingJob.update({
            where: { id: job.id },
            data: { isActive: false },
          });
          console.log(`[TRACKING] Deactivated job for clip ${job.clipId} (missing clip)`);
          details.push(`Deactivated job for clip ${job.clipId} (missing clip)`);
          continue;
        }

        console.log(`[TRACKING] Processing clip ${clip.id} (${clip.clipUrl})`);

        // Fetch real stats from Apify
        const stats = await fetchClipStats(clip.clipUrl);

        // Get previous snapshot for growth calculation
        // For cron checks: use last NON-manual snapshot to avoid manual checks distorting growth
        const prevStat = await db.clipStat.findFirst({
          where: { clipId: clip.id, ...(source === "cron" ? { isManual: false } : {}) },
          orderBy: { checkedAt: "desc" },
        });
        const prevViews = prevStat?.views ?? 0;

        console.log(`[TRACKING] Clip ${clip.id}: ${prevViews} → ${stats.views} views (${source})`);

        // Save new snapshot (mark manual checks)
        await db.clipStat.create({
          data: {
            clipId: clip.id,
            isManual: source === "manual",
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
          },
        });

        // ── Fraud detection: compute and store fraud score ──
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
            data: {
              fraudScore: fraudResult.score,
              fraudReasons: JSON.stringify(fraudResult.reasons),
              fraudCheckedAt: new Date(),
            },
          });

          // Auto-flag if score crosses threshold and clip is still PENDING
          if (fraudResult.score >= 30 && clip.status === "PENDING") {
            await db.clip.update({
              where: { id: clip.id },
              data: { status: "FLAGGED" },
            });
            try {
              const { createNotification } = await import("@/lib/notifications");
              const owners = await db.user.findMany({
                where: { role: "OWNER" },
                select: { id: true },
              });
              for (const owner of owners) {
                await createNotification(
                  owner.id,
                  "CLIP_FLAGGED",
                  "Clip flagged for review",
                  `A clip was automatically flagged: ${fraudResult.reasons[0] || "Suspicious activity detected"}`,
                  { clipId: clip.id, fraudScore: fraudResult.score },
                );
              }
            } catch {}
            details.push(`Clip ${clip.id}: AUTO-FLAGGED (fraud score: ${fraudResult.score})`);
          }
        } catch (fraudErr: any) {
          console.error(`[TRACKING] Fraud detection error for clip ${clip.id}:`, fraudErr.message);
        }

        // Recalculate earnings if clip is approved (with budget cap)
        // Fresh-read campaign status so we catch pauses from earlier clips in this loop
        const freshCampaign = await db.campaign.findUnique({
          where: { id: clip.campaignId },
          select: { status: true, budget: true },
        });

        if (clip.status === "APPROVED" && clip.campaign && freshCampaign?.status !== "PAUSED" && freshCampaign?.status !== "ARCHIVED") {
          const breakdown = recalculateClipEarningsBreakdown({
            stats: [{ views: stats.views }],
            campaign: clip.campaign,
            user: clip.user,
          });
          let newEarnings = breakdown.clipperEarnings;

          const isCpmSplit = (clip.campaign as any).pricingModel === "CPM_SPLIT" && (clip.campaign as any).ownerCpm;
          const cCpm = isCpmSplit ? ((clip.campaign as any).clipperCpm ?? (clip.campaign as any).cpmRate) : null;
          let newOwnerAmt = isCpmSplit
            ? calculateOwnerEarnings(stats.views, (clip.campaign as any).ownerCpm, breakdown.baseEarnings, cCpm)
            : 0;

          // Budget cap: don't exceed campaign budget (clipper + owner combined)
          try {
            const { getCampaignBudgetStatus } = await import("@/lib/balance");
            const budgetStatus = await getCampaignBudgetStatus(clip.campaignId);
            if (budgetStatus && budgetStatus.budget > 0) {
              // Fresh-read THIS clip's current DB earnings (not the stale value from loop start)
              const freshClip = await db.clip.findUnique({ where: { id: clip.id }, select: { earnings: true } });
              const currentClipEarnings = freshClip?.earnings || 0;

              let thisClipCurrentOwner = 0;
              if (isCpmSplit) {
                try {
                  const existingAe = await db.agencyEarning.findUnique({ where: { clipId: clip.id } });
                  thisClipCurrentOwner = existingAe?.amount || 0;
                } catch {}
              }
              const otherSpent = budgetStatus.spent - currentClipEarnings - thisClipCurrentOwner;
              const remaining = Math.max(budgetStatus.budget - otherSpent, 0);
              const totalForThisClip = newEarnings + newOwnerAmt;

              console.log(`[BUDGET-CHECK] Campaign: ${clip.campaignId} Budget: $${budgetStatus.budget} Total spent: $${budgetStatus.spent.toFixed(2)} This clip DB earnings: $${currentClipEarnings} Other spent: $${otherSpent.toFixed(2)} Remaining: $${remaining.toFixed(2)} New clipper: $${newEarnings} New owner: $${newOwnerAmt}`);

              if (remaining <= 0) {
                newEarnings = currentClipEarnings;
                newOwnerAmt = thisClipCurrentOwner;
                console.log(`[BUDGET-CHECK] No budget remaining, keeping current earnings for clip ${clip.id}`);
              } else if (totalForThisClip > remaining) {
                const scaleFactor = remaining / totalForThisClip;
                newEarnings = Math.round(newEarnings * scaleFactor * 100) / 100;
                newOwnerAmt = Math.round(newOwnerAmt * scaleFactor * 100) / 100;
                if (newEarnings + newOwnerAmt > remaining) {
                  newEarnings = Math.round((remaining - newOwnerAmt) * 100) / 100;
                }
                // Add back this clip's existing contribution — new earnings fill remaining only
                newEarnings = Math.max(newEarnings, 0);
                console.log(`[BUDGET-CHECK] Capped clip ${clip.id}: clipper=$${newEarnings} owner=$${newOwnerAmt}`);
              }

              // Auto-pause BEFORE saving earnings so next clips in loop see PAUSED
              const newTotalSpent = otherSpent + newEarnings + newOwnerAmt;
              if (newTotalSpent >= budgetStatus.budget) {
                await db.campaign.update({
                  where: { id: clip.campaignId },
                  data: { status: "PAUSED" },
                });
                console.log(`[BUDGET] Campaign ${clip.campaignId} paused — budget $${budgetStatus.budget} reached (spent: $${newTotalSpent.toFixed(2)})`);
                details.push(`Campaign ${clip.campaignId}: AUTO-PAUSED (budget $${budgetStatus.budget} reached)`);
              }

              // Double-check: re-read budget after potential pause from concurrent processing
              const freshBudget = await getCampaignBudgetStatus(clip.campaignId);
              if (freshBudget && freshBudget.budget > 0 && freshBudget.spent >= freshBudget.budget) {
                console.log(`[BUDGET-CHECK] Campaign already over budget after recheck, keeping current earnings for clip ${clip.id}`);
                newEarnings = currentClipEarnings;
                newOwnerAmt = thisClipCurrentOwner;
              }
            }
          } catch {}

          const earningsChanged = newEarnings !== (clip.earnings || 0);
          if (earningsChanged) {
            await db.clip.update({
              where: { id: clip.id },
              data: {
                earnings: newEarnings,
                baseEarnings: breakdown.baseEarnings,
                bonusPercent: breakdown.bonusPercent,
                bonusAmount: breakdown.bonusAmount,
              },
            });
          }

          // Save owner earnings for CPM_SPLIT campaigns
          if (isCpmSplit) {
            console.log(`[AGENCY-TRACK] Clip ${clip.id}: clipper=$${newEarnings}, owner=$${newOwnerAmt}`);
            if (newOwnerAmt > 0) {
              try {
                await db.agencyEarning.upsert({
                  where: { clipId: clip.id },
                  create: { campaignId: clip.campaignId, clipId: clip.id, amount: newOwnerAmt, views: stats.views },
                  update: { amount: newOwnerAmt, views: stats.views },
                });
              } catch (aeErr: any) {
                console.error(`[AGENCY-TRACK] Failed:`, aeErr?.message);
              }
            } else {
              try { await db.agencyEarning.delete({ where: { clipId: clip.id } }); } catch {}
            }
          }

          // Sync user stats/level (skip for owner override clips)
          if (earningsChanged && clip.userId && !clip.isOwnerOverride) {
            const allClips = await db.clip.findMany({
              where: { userId: clip.userId, status: "APPROVED", isOwnerOverride: false },
              select: { earnings: true },
            });
            const allStatSnapshots = await db.clipStat.findMany({
              where: { clip: { userId: clip.userId, isOwnerOverride: false } },
              orderBy: { checkedAt: "desc" as any },
              distinct: ["clipId" as any],
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

          // Broadcast real-time update to clipper's SSE stream
          if (earningsChanged && clip.userId) {
            try {
              broadcastToUser(clip.userId, "clip_updated", { clipId: clip.id, views: stats.views, earnings: newEarnings });
              broadcastToUser(clip.userId, "earnings_updated", { reason: "tracking" });
            } catch {}
          }
        } else if (clip.status === "APPROVED" && (freshCampaign?.status === "PAUSED" || freshCampaign?.status === "ARCHIVED")) {
          console.log(`[BUDGET-CHECK] Skipping earnings for clip ${clip.id} — campaign is ${freshCampaign?.status}`);
        }

        // ── Calculate next interval using tiered schedule ──
        let newInterval: number;
        if (clip.status === "REJECTED") {
          // Rejected clips: slow track at 72h, stats saved but no earnings
          newInterval = 4320;
        } else if (clip.isOwnerOverride) {
          // Owner override clips: run through normal logic, capped at 48h
          newInterval = await getNextInterval(job.checkIntervalMin, stats.views, prevViews, clip.createdAt, job.lastCheckedAt, clip.id);
          newInterval = Math.min(newInterval, 2880);
        } else {
          newInterval = await getNextInterval(job.checkIntervalMin, stats.views, prevViews, clip.createdAt, job.lastCheckedAt, clip.id);
        }
        const nextCheck = roundToNextSlot(newInterval);

        if (source === "manual") {
          // Manual checks: only update lastCheckedAt, preserve the cron schedule
          await db.trackingJob.update({
            where: { id: job.id },
            data: { lastCheckedAt: new Date() },
          });
          console.log(`[TRACKING] Clip ${clip.id}: manual check done (cron schedule preserved)`);
        } else {
          await db.trackingJob.update({
            where: { id: job.id },
            data: {
              lastCheckedAt: new Date(),
              nextCheckAt: nextCheck,
              checkIntervalMin: newInterval,
            },
          });
          console.log(`[TRACKING] Clip ${clip.id}: next check at ${nextCheck.toISOString()} (interval: ${newInterval}min)`);
        }
        details.push(`Clip ${clip.id}: ${prevViews}→${stats.views} views, next in ${newInterval}min`);
        processed++;
      } catch (err: any) {
        errors++;
        console.error(`[TRACKING] Error on job ${job.id}:`, err.message);
        details.push(`Error on job ${job.id}: ${err.message}`);
        // Retry in 30 min on error
        await db.trackingJob.update({
          where: { id: job.id },
          data: {
            nextCheckAt: new Date(Date.now() + 30 * 60 * 1000),
            lastCheckedAt: new Date(),
          },
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error("[TRACKING] Fatal error:", err.message);
    details.push(`Fatal error: ${err.message}`);
    errors++;
  }

  console.log(`[TRACKING] Done: ${processed} processed, ${errors} errors`);
  return { processed, errors, details };
}
