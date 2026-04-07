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
} from "@/lib/earnings-calc";

export interface GamificationState {
  level: number;
  totalEarnings: number;
  totalViews: number;
  bonusPercent: number;
  currentStreak: number;
  longestStreak: number;
  nextLevelAt: number;
  earningsToNextLevel: number;
  platformFeePercent: number;
  streakReward: { days: number; bonusPercent: number } | null;
  nextStreakReward: { days: number; bonusPercent: number } | null;
  /** Pending streak days (submitted clips but not yet approved, within 48h grace) */
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

/** Helper: get UTC day start/end for a Date */
function dayBounds(d: Date): { start: Date; end: Date } {
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

/** Helper: same UTC day? */
function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate();
}

type DayStatus = "passed" | "failed" | "pending";

/**
 * Evaluate a single day's streak status for a user.
 * Returns: "passed" (approved clip exists), "failed" (no clips or all rejected),
 * "pending" (clips exist but not all reviewed yet).
 */
async function evaluateDay(userId: string, date: Date): Promise<DayStatus> {
  if (!db) return "failed";
  const { start, end } = dayBounds(date);

  const clips = await db.clip.findMany({
    where: {
      userId,
      createdAt: { gte: start, lte: end },
      isDeleted: false,
    },
    select: { status: true },
  });

  if (clips.length === 0) return "failed";
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
    select: { lastActiveDate: true, currentStreak: true, longestStreak: true },
  });
  if (!user) return;

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
    const status = await evaluateDay(userId, cursor);

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

  await db.user.update({
    where: { id: userId },
    data: {
      currentStreak,
      longestStreak: newLongest,
      lastActiveDate: lastPassedDate || user.lastActiveDate,
    },
  });
}

/**
 * Get streak day statuses for the last N days (for the progress grid).
 * Returns an array where index 0 = today, index 1 = yesterday, etc.
 * Each entry: "confirmed" | "pending" | "empty"
 */
export async function getStreakDayStatuses(userId: string, days: number = 60): Promise<string[]> {
  if (!db) return Array(days).fill("empty");

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
    select: { createdAt: true, status: true },
  });

  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    const dayClips = clips.filter((c: any) => {
      const cd = new Date(c.createdAt);
      return cd.getUTCFullYear() === d.getUTCFullYear() &&
        cd.getUTCMonth() === d.getUTCMonth() &&
        cd.getUTCDate() === d.getUTCDate();
    });

    if (dayClips.length === 0) {
      result.push("empty");
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
    await db.user.update({
      where: { id: userId },
      data: { level: newLevel, bonusPercentage: newBonus },
    });
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

  return {
    level,
    totalEarnings,
    totalViews: user.totalViews,
    bonusPercent: (config.levelBonuses[level] || 0) + (currentReward?.bonusPercent || 0) + (user.isPWAUser ? PWA_BONUS_PERCENT : 0),
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
