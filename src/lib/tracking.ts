/**
 * Tracking system: executes scheduled checks for TikTok/Instagram clips.
 * Fetches real stats via Apify and saves new ClipStat snapshots.
 *
 * Tiered schedule:
 *   Phase 1 (0-4h after submission):   every 60 min
 *   Phase 2 (4-24h after submission):  every 120 min
 *   Phase 3 (24h+): growth-based tier adjustments:
 *     < 5% growth  → stay same or move up one tier (slower)
 *     5-9% growth  → drop DOWN one tier (faster)
 *     10-19% growth → drop DOWN two tiers (faster)
 *     20%+ growth  → go straight to 2h (minimum)
 *
 *   Tiers: 2h → 4h → 8h → 16h → 24h → 72h
 *   Minimum: 2h. Maximum: 72h. Tracking never stops.
 */

import { db } from "@/lib/db";
import { fetchClipStats } from "@/lib/apify";
import { recalculateClipEarnings } from "@/lib/earnings-calc";
import { computeFraudLevel } from "@/lib/fraud";

/** Interval tiers in minutes: 2h → 4h → 8h → 16h → 24h → 72h */
const TIERS = [120, 240, 480, 960, 1440, 4320];

/**
 * Determine the next check interval based on the tiered schedule.
 * Phase 3 uses percentage growth to bump down (faster) or up (slower).
 */
function getNextInterval(
  currentIntervalMin: number,
  currentViews: number,
  previousViews: number,
  clipCreatedAt: Date | null,
): number {
  const hoursSinceSubmission = clipCreatedAt
    ? (Date.now() - new Date(clipCreatedAt).getTime()) / 3_600_000
    : 999; // if unknown, treat as old

  // Phase 1: first 4 hours → always 60 min
  if (hoursSinceSubmission <= 4) return 60;

  // Phase 2: hours 4-24 → always 120 min
  if (hoursSinceSubmission <= 24) return 120;

  // Phase 3: after 24h — growth-based tier adjustments
  const growthPercent = previousViews > 0
    ? ((currentViews - previousViews) / previousViews) * 100
    : (currentViews > 0 ? 100 : 0);

  // Find current position on the tier ladder
  let currentIdx = TIERS.indexOf(currentIntervalMin);
  if (currentIdx === -1) {
    // Not on a tier — find the closest tier at or above current interval
    currentIdx = TIERS.findIndex((t) => t >= currentIntervalMin);
    if (currentIdx === -1) currentIdx = TIERS.length - 1; // above max → use last tier
  }

  if (growthPercent >= 20) {
    // 20%+ → straight to minimum (2h)
    return TIERS[0];
  }
  if (growthPercent >= 10) {
    // 10-19% → drop down two tiers
    return TIERS[Math.max(currentIdx - 2, 0)];
  }
  if (growthPercent >= 5) {
    // 5-9% → drop down one tier
    return TIERS[Math.max(currentIdx - 1, 0)];
  }
  // < 5% → stay same or move up one tier (slower)
  return TIERS[Math.min(currentIdx + 1, TIERS.length - 1)];
}

/**
 * Round to the next clean hour slot based on interval.
 * 60min → next round hour. 120min → next even hour. 240min → next 4h mark. etc.
 */
function roundToNextSlot(intervalMin: number): Date {
  const now = new Date();
  const hour = now.getUTCHours();

  if (intervalMin <= 60) {
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    next.setUTCHours(hour + 1);
    return next;
  }

  const intervalHours = intervalMin / 60;
  const nextSlotHour = Math.ceil((hour + 1) / intervalHours) * intervalHours;
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  if (nextSlotHour >= 24) {
    next.setUTCHours(0);
    next.setUTCDate(next.getUTCDate() + Math.floor(nextSlotHour / 24));
    next.setUTCHours(nextSlotHour % 24);
  } else {
    next.setUTCHours(nextSlotHour);
  }
  return next;
}

/**
 * Execute all due tracking jobs. Called by the cron endpoint.
 * Returns { processed, errors, details }
 */
export async function runDueTrackingJobs(): Promise<{ processed: number; errors: number; details: string[] }> {
  if (!db) return { processed: 0, errors: 0, details: ["DB unavailable"] };

  console.log("[TRACKING] TRACKING RUNNING at", new Date().toISOString());

  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  try {
    // Find all active jobs that are due
    const dueJobs = await db.trackingJob.findMany({
      where: {
        isActive: true,
        nextCheckAt: { lte: new Date() },
      },
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
            campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true } },
            user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
          },
        },
      },
      take: 20, // Process max 20 per run to avoid timeouts
    });

    console.log(`[TRACKING] Found ${dueJobs.length} due jobs`);
    details.push(`Found ${dueJobs.length} due jobs`);

    for (const job of dueJobs) {
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

        // Get previous snapshot for logging
        const prevStat = await db.clipStat.findFirst({
          where: { clipId: clip.id },
          orderBy: { checkedAt: "desc" },
        });
        const prevViews = prevStat?.views ?? 0;

        console.log(`[TRACKING] Clip ${clip.id}: ${prevViews} → ${stats.views} views`);

        // Save new snapshot
        await db.clipStat.create({
          data: {
            clipId: clip.id,
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
        // If campaign is PAUSED, tracking continues (stats saved above) but earnings freeze
        const campaignStatus = await db.campaign.findUnique({
          where: { id: clip.campaignId },
          select: { status: true },
        });

        if (clip.status === "APPROVED" && clip.campaign && campaignStatus?.status !== "PAUSED") {
          let newEarnings = recalculateClipEarnings({
            stats: [{ views: stats.views }],
            campaign: clip.campaign,
            user: clip.user,
          });

          // Budget cap: don't exceed campaign budget
          try {
            const { getCampaignBudgetStatus } = await import("@/lib/balance");
            const budgetStatus = await getCampaignBudgetStatus(clip.campaignId);
            if (budgetStatus && budgetStatus.budget > 0) {
              const otherClipsSpent = budgetStatus.spent - (clip.earnings || 0);
              const maxAllowed = Math.max(budgetStatus.budget - otherClipsSpent, 0);
              newEarnings = Math.min(newEarnings, maxAllowed);
              newEarnings = Math.round(newEarnings * 100) / 100;

              // Auto-pause: if budget is now fully spent, pause the campaign
              const newTotalSpent = otherClipsSpent + newEarnings;
              if (newTotalSpent >= budgetStatus.budget) {
                await db.campaign.update({
                  where: { id: clip.campaignId },
                  data: { status: "PAUSED" },
                });
                console.log(`[BUDGET] Campaign ${clip.campaignId} paused — budget $${budgetStatus.budget} reached`);
                details.push(`Campaign ${clip.campaignId}: AUTO-PAUSED (budget $${budgetStatus.budget} reached)`);
              }
            }
          } catch {}

          if (newEarnings !== clip.earnings) {
            await db.clip.update({
              where: { id: clip.id },
              data: { earnings: newEarnings },
            });
            if (clip.userId) {
              const allClips = await db.clip.findMany({
                where: { userId: clip.userId, status: "APPROVED" },
                select: { earnings: true },
              });
              const allStatSnapshots = await db.clipStat.findMany({
                where: { clip: { userId: clip.userId } },
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
          }
        }

        // ── Calculate next interval using tiered schedule ──
        let newInterval: number;
        if (clip.status === "REJECTED") {
          // Rejected clips: slow track at 48h, stats saved but no earnings
          newInterval = 2880;
        } else if (clip.isOwnerOverride) {
          // Owner override clips: 24h base, 72h if growth < 5%
          const growthPct = prevViews > 0 ? ((stats.views - prevViews) / prevViews) * 100 : (stats.views > 0 ? 100 : 0);
          newInterval = growthPct >= 5 ? 1440 : 4320;
        } else {
          newInterval = getNextInterval(job.checkIntervalMin, stats.views, prevViews, clip.createdAt);
        }
        const nextCheck = roundToNextSlot(newInterval);

        await db.trackingJob.update({
          where: { id: job.id },
          data: {
            lastCheckedAt: new Date(),
            nextCheckAt: nextCheck,
            checkIntervalMin: newInterval,
          },
        });

        console.log(`[TRACKING] Clip ${clip.id}: next check at ${nextCheck.toISOString()} (interval: ${newInterval}min)`);
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
