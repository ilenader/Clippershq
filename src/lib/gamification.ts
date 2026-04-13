/**
 * Gamification helpers — level computation, streak management, config loading.
 *
 * Streak rules:
 * - A day counts if at least 1 clip submitted that day gets APPROVED
 * - Days are only evaluated after a 48-hour grace period (to allow review time)
 * - If clips exist but are all still PENDING/FLAGGED within the grace period, the day is skipped
 * - If no clips or all clips REJECTED after grace period, streak breaks
 */
import { db } from "@/lib/db";
import {
  DEFAULT_LEVEL_THRESHOLDS,
  DEFAULT_LEVEL_BONUSES,
  DEFAULT_STREAK_BONUSES,
  DEFAULT_PLATFORM_FEE,
  DEFAULT_REFERRED_FEE,
  DEFAULT_FEE_TIERS,
  PWA_BONUS_PERCENT,
  computeLevel,
  calculateClipperEarnings,
  calculateOwnerEarnings,
} from "@/lib/earnings-calc";
import { getCampaignBudgetStatus } from "@/lib/balance";

export interface GamificationState {
  level: number;
  totalEarnings: number;
  totalViews: number;
  bonusPercent: number;
  levelBonus: number;
  streakBonusPercent: number;
  pwaBonusPercent: number;
  isPWAUser: boolean;
  currentStreak: number;
  longestStreak: number;
  nextLevelAt: number;
  earningsToNextLevel: number;
  platformFeePercent: number;
  streakReward: { days: number; bonusPercent: number } | null;
  nextStreakReward: { days: number; bonusPercent: number } | null;
  pendingStreakDays: number;
}

/** Load gamification config from DB, fallback to defaults */
export async function loadConfig() {
  const configs: Record<string, any> = {};
  if (db && db.gamificationConfig) {
    try {
      const rows = await db.gamificationConfig.findMany();
      for (const row of rows) {
        try { configs[row.key] = JSON.parse(row.value); } catch {}
      }
    } catch {}
  }
  return {
    levelThresholds: configs.level_thresholds || DEFAULT_LEVEL_THRESHOLDS,
    levelBonuses: configs.level_bonuses || DEFAULT_LEVEL_BONUSES,
    streakBonuses: configs.streak_bonuses || DEFAULT_STREAK_BONUSES,
    platformFee: configs.platform_fee ?? DEFAULT_PLATFORM_FEE,
    feeTiers: configs.fee_tiers || DEFAULT_FEE_TIERS,
  };
}

/** Helper: get day start/end for a Date, optionally in a specific timezone */
function dayBounds(d: Date, timezone?: string | null): { start: Date; end: Date } {
  if (timezone) {
    try {
      // Get the date string in the user's timezone (YYYY-MM-DD)
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: timezone });
      // Create midnight in that timezone by parsing as local then adjusting
      const start = new Date(`${dateStr}T00:00:00`);
      // Verify the timezone offset is correct by using a more reliable method
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).formatToParts(d);
      const y = parts.find((p) => p.type === "year")?.value || "2024";
      const m = parts.find((p) => p.type === "month")?.value || "01";
      const dd = parts.find((p) => p.type === "day")?.value || "01";
      const midnightLocal = new Date(`${y}-${m}-${dd}T00:00:00`);
      // Calculate UTC offset: the difference between UTC midnight and local midnight
      const utcMidnight = new Date(`${y}-${m}-${dd}T00:00:00Z`);
      const offset = midnightLocal.getTime() - utcMidnight.getTime();
      const tzStart = new Date(utcMidnight.getTime() + offset);
      const tzEnd = new Date(tzStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      return { start: tzStart, end: tzEnd };
    } catch {
      // Fall back to UTC on any error
    }
  }
  const start = new Date(d);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/** Helper: add N days to a date */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Helper: same day? Optionally in a specific timezone */
function sameDay(a: Date, b: Date, timezone?: string | null): boolean {
  if (timezone) {
    try {
      const aStr = a.toLocaleDateString("en-CA", { timeZone: timezone });
      const bStr = b.toLocaleDateString("en-CA", { timeZone: timezone });
      return aStr === bStr;
    } catch {}
  }
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

type DayStatus = "passed" | "failed" | "pending";

/**
 * Evaluate a single day's streak status for a user.
 * Returns: "passed" (approved clip exists or day is locked), "failed" (no clips or all rejected),
 * "pending" (clips exist but not all reviewed yet).
 */
async function evaluateDay(userId: string, date: Date, timezone?: string | null): Promise<DayStatus> {
  if (!db) return "failed";
  const { start, end } = dayBounds(date, timezone);

  const clips = await db.clip.findMany({
    where: {
      userId,
      createdAt: { gte: start, lte: end },
      isDeleted: false,
    },
    select: { status: true, streakDayLocked: true },
  });

  if (clips.length === 0) return "failed";
  // If any clip has streakDayLocked, this day is permanently "passed"
  if (clips.some((c: any) => c.streakDayLocked)) return "passed";
  if (clips.some((c: any) => c.status === "APPROVED")) return "passed";
  if (clips.every((c: any) => c.status === "REJECTED")) return "failed";
  // Some clips still PENDING or FLAGGED
  return "pending";
}

/**
 * Evaluate and update a user's streak with 48-hour grace period.
 *
 * Logic:
 * 1. Find the latest evaluable day (2 days ago — 48h grace)
 * 2. Walk from lastActiveDate+1 to the latest evaluable day
 * 3. For each day: check clips → passed/failed/pending
 * 4. Update streak count accordingly
 */
export async function updateStreak(userId: string): Promise<void> {
  if (!db) return;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastActiveDate: true, currentStreak: true, longestStreak: true, timezone: true },
  });
  if (!user) return;

  const tz = user.timezone || null;
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // Latest day we can fully evaluate = 2 days ago (48h grace)
  const latestEvaluable = addDays(today, -2);

  // Where to start evaluating from
  let evalStart: Date;
  if (user.lastActiveDate) {
    const last = new Date(user.lastActiveDate);
    last.setUTCHours(0, 0, 0, 0);
    evalStart = addDays(last, 1); // day after last confirmed
  } else {
    // No streak history — start from 7 days ago max
    evalStart = addDays(today, -7);
  }

  // If eval start is after the latest evaluable day, nothing to do
  if (evalStart > latestEvaluable) return;

  // Streak protection: if ALL of clipper's campaigns are PAUSED, freeze streak
  try {
    const memberships = await db.campaignAccount.findMany({
      where: { clipAccount: { userId } },
      include: { campaign: { select: { status: true } } },
    });
    if (memberships.length > 0) {
      const hasActiveCampaign = memberships.some((m: any) => m.campaign.status === "ACTIVE");
      if (!hasActiveCampaign) {
        // All campaigns paused — freeze streak, don't evaluate
        return;
      }
    }
  } catch {}

  let currentStreak = user.currentStreak;
  let lastPassedDate = user.lastActiveDate ? new Date(user.lastActiveDate) : null;
  let streakBroken = false;

  // Walk each day from evalStart to latestEvaluable
  const cursor = new Date(evalStart);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= latestEvaluable) {
    const status = await evaluateDay(userId, cursor, tz);

    if (status === "passed") {
      if (streakBroken) {
        // Restart streak from this day
        currentStreak = 1;
        streakBroken = false;
      } else {
        currentStreak++;
      }
      lastPassedDate = new Date(cursor);
    } else if (status === "failed") {
      streakBroken = true;
      currentStreak = 0;
    } else {
      // "pending" — stop evaluating, wait for reviews
      break;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const newLongest = Math.max(currentStreak, user.longestStreak);
  const streakChanged = currentStreak !== user.currentStreak;

  await db.user.update({
    where: { id: userId },
    data: {
      currentStreak,
      longestStreak: newLongest,
      lastActiveDate: lastPassedDate || user.lastActiveDate,
    },
  });

  // If streak changed, recalculate unpaid earnings with new bonus
  if (streakChanged) {
    try {
      await recalculateUnpaidEarnings(userId);
    } catch (err: any) {
      console.error(`[RECALC] Failed for user ${userId}:`, err?.message);
    }
  }
}

/**
 * Get streak day statuses for the last N days (for the progress grid).
 * Returns an array where index 0 = today, index 1 = yesterday, etc.
 * Each entry: "confirmed" | "pending" | "empty"
 */
export async function getStreakDayStatuses(userId: string, days: number = 60): Promise<string[]> {
  if (!db) return Array(days).fill("empty");

  // Fetch user timezone
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone || null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Fetch all clips from the last N days in one query
  const cutoff = addDays(today, -(days - 1));
  const clips = await db.clip.findMany({
    where: {
      userId,
      createdAt: { gte: cutoff },
      isDeleted: false,
    },
    select: { createdAt: true, status: true, streakDayLocked: true },
  });

  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    const dayClips = clips.filter((c: any) => sameDay(new Date(c.createdAt), d, tz));

    if (dayClips.length === 0) {
      result.push("empty");
    } else if (dayClips.some((c: any) => c.streakDayLocked)) {
      result.push("confirmed"); // permanently locked
    } else if (dayClips.some((c: any) => c.status === "APPROVED")) {
      result.push("confirmed");
    } else if (dayClips.every((c: any) => c.status === "REJECTED")) {
      result.push("empty"); // all rejected = missed day
    } else {
      result.push("pending"); // has unreviewed clips
    }
  }

  return result;
}

/** Recompute user level and bonus based on total earnings */
export async function updateUserLevel(userId: string): Promise<void> {
  if (!db) return;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { totalEarnings: true, level: true },
  });
  if (!user) return;

  const config = await loadConfig();
  const newLevel = computeLevel(user.totalEarnings, config.levelThresholds);
  const newBonus = config.levelBonuses[newLevel] || 0;

  if (newLevel !== user.level) {
    console.log(`[LEVEL] User ${userId} level changed from ${user.level} to ${newLevel} - recalculating unpaid earnings`);
    await db.user.update({
      where: { id: userId },
      data: { level: newLevel, bonusPercentage: newBonus },
    });
    // Level changed — recalculate unpaid earnings
    try {
      await recalculateUnpaidEarnings(userId);
    } catch (err: any) {
      console.error(`[RECALC] Level change failed for user ${userId}:`, err?.message);
    }
  }
}

/** Get full gamification state for a user */
export async function getGamificationState(userId: string): Promise<GamificationState | null> {
  if (!db) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      totalEarnings: true, totalViews: true, level: true,
      bonusPercentage: true, currentStreak: true, longestStreak: true,
      referredById: true, isPWAUser: true,
    },
  });
  if (!user) return null;

  // Run streak evaluation (handles 48h grace)
  await updateStreak(userId);

  // Re-fetch after streak update
  const freshUser = await db.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, longestStreak: true },
  });
  const currentStreak = freshUser?.currentStreak ?? user.currentStreak;
  const longestStreak = freshUser?.longestStreak ?? user.longestStreak;

  // Verify totalEarnings matches real approved clip sum (self-healing)
  let totalEarnings = user.totalEarnings;
  try {
    const earningsAgg = await db.clip.aggregate({
      where: { userId, status: "APPROVED" },
      _sum: { earnings: true },
    });
    const realTotal = earningsAgg._sum.earnings ?? 0;
    if (Math.abs(realTotal - totalEarnings) > 0.01) {
      totalEarnings = Math.round(realTotal * 100) / 100;
      await db.user.update({
        where: { id: userId },
        data: { totalEarnings },
      }).catch(() => {});
    }
  } catch {}

  const config = await loadConfig();
  const level = computeLevel(totalEarnings, config.levelThresholds);

  if (level !== user.level) {
    const newBonus = config.levelBonuses[level] || 0;
    await db.user.update({
      where: { id: userId },
      data: { level, bonusPercentage: newBonus },
    }).catch(() => {});
  }

  const nextThreshold = config.levelThresholds.find((t: any) => t.level === level + 1);
  const nextLevelAt = nextThreshold?.minEarnings || 0;
  const earningsToNextLevel = Math.max(nextLevelAt - totalEarnings, 0);

  let currentReward = null;
  for (const tier of [...config.streakBonuses].sort((a: any, b: any) => b.days - a.days)) {
    if (currentStreak >= tier.days) { currentReward = tier; break; }
  }

  let nextReward = null;
  for (const tier of [...config.streakBonuses].sort((a: any, b: any) => a.days - b.days)) {
    if (currentStreak < tier.days) { nextReward = tier; break; }
  }

  const fee = user.referredById ? DEFAULT_REFERRED_FEE : config.platformFee;

  // Count pending streak days (today + yesterday that have unreviewed clips)
  const dayStatuses = await getStreakDayStatuses(userId, 3);
  const pendingStreakDays = dayStatuses.filter((s) => s === "pending").length;

  const levelBonusPct = config.levelBonuses[level] || 0;
  const streakBonusPct = currentReward?.bonusPercent || 0;
  const pwaBonusPct = user.isPWAUser ? PWA_BONUS_PERCENT : 0;

  return {
    level,
    totalEarnings,
    totalViews: user.totalViews,
    bonusPercent: levelBonusPct + streakBonusPct + pwaBonusPct,
    levelBonus: levelBonusPct,
    streakBonusPercent: streakBonusPct,
    pwaBonusPercent: pwaBonusPct,
    isPWAUser: user.isPWAUser,
    currentStreak,
    longestStreak,
    nextLevelAt,
    earningsToNextLevel,
    platformFeePercent: fee,
    streakReward: currentReward,
    nextStreakReward: nextReward,
    pendingStreakDays,
  };
}

/**
 * Recalculate all unpaid clip earnings for a user when their bonus changes.
 * Only affects APPROVED clips not included in a PAID payout.
 */
export async function recalculateUnpaidEarnings(userId: string): Promise<{ clipsUpdated: number; oldTotal: number; newTotal: number }> {
  if (!db) return { clipsUpdated: 0, oldTotal: 0, newTotal: 0 };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { level: true, currentStreak: true, referredById: true, isPWAUser: true, manualBonusOverride: true },
  });
  if (!user) return { clipsUpdated: 0, oldTotal: 0, newTotal: 0 };

  // Get IDs of clips already included in PAID payouts (their earnings are locked)
  const paidPayouts = await db.payoutRequest.findMany({
    where: { userId, status: "PAID" },
    select: { campaignId: true },
  });
  const paidCampaignIds = new Set(paidPayouts.map((p: any) => p.campaignId).filter(Boolean));

  // Get all APPROVED clips
  const clips = await db.clip.findMany({
    where: { userId, status: "APPROVED", isDeleted: false },
    include: {
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true, lastBudgetPauseAt: true } },
    },
  });

  const config = await loadConfig();
  let clipsUpdated = 0;
  let oldTotal = 0;
  let newTotal = 0;

  console.log(`[RECALC] Recalculating ${clips.length} unpaid clips for user ${userId} with level ${user.level}`);

  // Group clips by campaign to enforce budget caps
  const clipsByCampaign: Record<string, typeof clips> = {};
  for (const clip of clips) {
    if (!clipsByCampaign[clip.campaignId]) clipsByCampaign[clip.campaignId] = [];
    clipsByCampaign[clip.campaignId].push(clip);
  }

  // Pre-fetch budget status for all campaigns
  const budgetStatusCache: Record<string, Awaited<ReturnType<typeof getCampaignBudgetStatus>>> = {};
  for (const campaignId of Object.keys(clipsByCampaign)) {
    budgetStatusCache[campaignId] = await getCampaignBudgetStatus(campaignId);
  }

  for (const [campaignId, campaignClips] of Object.entries(clipsByCampaign)) {
    const budgetStatus = budgetStatusCache[campaignId];

    // For budget-capped campaigns, calculate total spent by OTHER users' clips first
    // budgetStatus.spent includes ALL clips for the campaign, not just this user's
    // We need: otherUsersSpent = budgetStatus.spent - sum(this user's current clip earnings + owner earnings)
    let thisUserCurrentTotal = 0;
    let thisUserCurrentOwnerTotal = 0;
    if (budgetStatus && budgetStatus.budget > 0) {
      for (const clip of campaignClips) {
        thisUserCurrentTotal += clip.earnings || 0;
      }
      // Get this user's current owner earnings for CPM_SPLIT
      const isCpmSplitCampaign = (campaignClips[0]?.campaign as any)?.pricingModel === "CPM_SPLIT";
      if (isCpmSplitCampaign) {
        try {
          const ownerEarnings = await db.agencyEarning.findMany({
            where: { campaignId, clipId: { in: campaignClips.map((c: any) => c.id) } },
            select: { amount: true },
          });
          thisUserCurrentOwnerTotal = ownerEarnings.reduce((s: number, e: any) => s + (e.amount || 0), 0);
        } catch {}
      }
    }

    // Running total of this user's new earnings for this campaign (to enforce budget)
    let runningClipperTotal = 0;
    let runningOwnerTotal = 0;

    for (const clip of campaignClips) {
      const stat = clip.stats[0];
      if (!stat) continue;

      oldTotal += clip.earnings || 0;

      // Skip clips from campaigns that have been fully paid out
      if (paidCampaignIds.has(clip.campaignId)) {
        newTotal += clip.earnings || 0;
        continue;
      }

      // Budget-lock: old clips from before a budget pause keep their earnings
      const budgetPauseAt = (clip.campaign as any).lastBudgetPauseAt ? new Date((clip.campaign as any).lastBudgetPauseAt) : null;
      if (budgetPauseAt && new Date(clip.createdAt) < budgetPauseAt && (clip.earnings || 0) > 0) {
        console.log(`[RECALC-BUDGET-LOCK] Clip ${clip.id} locked at $${clip.earnings} — submitted before budget pause`);
        newTotal += clip.earnings || 0;
        runningClipperTotal += clip.earnings || 0;
        continue;
      }

      const cpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;
      const result = calculateClipperEarnings({
        views: stat.views,
        clipperCpm: cpm,
        campaignMinViews: clip.campaign.minViews,
        campaignMaxPayoutPerClip: clip.campaign.maxPayoutPerClip,
        clipperLevel: user.level,
        clipperStreak: user.currentStreak,
        levelBonuses: config.levelBonuses,
        streakBonuses: config.streakBonuses,
        isReferred: !!user.referredById,
        isPWAUser: user.isPWAUser,
        manualBonusOverride: user.manualBonusOverride,
      });

      let finalClipperEarnings = result.clipperEarnings;
      let finalBaseEarnings = result.baseEarnings;

      // Calculate owner earnings for CPM_SPLIT
      const isCpmSplit = (clip.campaign as any).pricingModel === "CPM_SPLIT" && (clip.campaign as any).ownerCpm;
      const cCpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;
      let ownerAmt = isCpmSplit
        ? calculateOwnerEarnings(stat.views, (clip.campaign as any).ownerCpm, result.baseEarnings, cCpm)
        : 0;

      // Budget cap check
      if (budgetStatus && budgetStatus.budget > 0) {
        const otherSpent = budgetStatus.spent - thisUserCurrentTotal - thisUserCurrentOwnerTotal;
        const budgetForAll = Math.max(budgetStatus.budget - otherSpent, 0);
        const alreadyUsed = runningClipperTotal + runningOwnerTotal;
        const remaining = Math.max(budgetForAll - alreadyUsed, 0);
        const totalForThisClip = finalClipperEarnings + ownerAmt;

        if (remaining <= 0) {
          // No budget left — keep at 0
          finalClipperEarnings = 0;
          finalBaseEarnings = 0;
          ownerAmt = 0;
          console.log(`[RECALC-BUDGET] No budget remaining for clip ${clip.id} in campaign ${campaignId}`);
        } else if (totalForThisClip > remaining) {
          // Ratio-based cap (same logic as tracking.ts)
          const clipperCpmVal = (clip.campaign as any).clipperCpm || (clip.campaign as any).cpmRate || 1;
          const ownerCpmVal = (clip.campaign as any).ownerCpm || 0;
          const totalCpm = clipperCpmVal + ownerCpmVal;
          const clipperRatio = clipperCpmVal / totalCpm;
          const ownerRatio = ownerCpmVal / totalCpm;

          finalClipperEarnings = Math.round(remaining * clipperRatio * 100) / 100;
          ownerAmt = Math.round(remaining * ownerRatio * 100) / 100;
          if (finalClipperEarnings + ownerAmt > remaining) {
            finalClipperEarnings = Math.round((remaining - ownerAmt) * 100) / 100;
          }
          finalClipperEarnings = Math.max(finalClipperEarnings, 0);
          ownerAmt = Math.max(ownerAmt, 0);
          // Adjust base earnings proportionally
          if (result.clipperEarnings > 0) {
            finalBaseEarnings = Math.round(result.baseEarnings * (finalClipperEarnings / result.clipperEarnings) * 100) / 100;
          }

          console.log(`[RECALC-BUDGET] Ratio-capped clip ${clip.id}: clipper=$${finalClipperEarnings} owner=$${ownerAmt} remaining=$${remaining.toFixed(2)}`);
        }
      }

      runningClipperTotal += finalClipperEarnings;
      runningOwnerTotal += ownerAmt;

      // Recalculate bonus amounts based on final capped earnings
      const finalBonusAmount = finalClipperEarnings > 0 ? Math.round((finalClipperEarnings - finalBaseEarnings) * 100) / 100 : 0;

      if (finalClipperEarnings !== clip.earnings || result.bonusPercent !== clip.bonusPercent) {
        await db.clip.update({
          where: { id: clip.id },
          data: {
            earnings: finalClipperEarnings,
            baseEarnings: finalBaseEarnings,
            bonusPercent: result.bonusPercent,
            bonusAmount: Math.max(finalBonusAmount, 0),
          },
        });

        // Update agency earnings for CPM_SPLIT
        if (isCpmSplit) {
          if (ownerAmt > 0) {
            await db.agencyEarning.upsert({
              where: { clipId: clip.id },
              create: { campaignId: clip.campaignId, clipId: clip.id, amount: ownerAmt, views: stat.views },
              update: { amount: ownerAmt, views: stat.views },
            });
          } else {
            // Budget exhausted — zero out owner earnings
            await db.agencyEarning.upsert({
              where: { clipId: clip.id },
              create: { campaignId: clip.campaignId, clipId: clip.id, amount: 0, views: stat.views },
              update: { amount: 0 },
            });
          }
        }

        clipsUpdated++;
      }
      newTotal += finalClipperEarnings;
    }
  }

  // Update user totals
  if (clipsUpdated > 0) {
    await db.user.update({
      where: { id: userId },
      data: { totalEarnings: Math.round(newTotal * 100) / 100 },
    });
    console.log(`[RECALC] User ${userId}: ${clipsUpdated} clips recalculated, $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`);
  }

  return { clipsUpdated, oldTotal: Math.round(oldTotal * 100) / 100, newTotal: Math.round(newTotal * 100) / 100 };
}
