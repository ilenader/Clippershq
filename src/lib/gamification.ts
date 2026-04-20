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

// Per-instance in-memory cache for getGamificationState results.
// 30s TTL — short enough that streak/level changes appear fast, long enough to absorb
// back-to-back dashboard page loads. Different Vercel instances have different caches;
// that's fine — we only need to shed the thundering herd within a single instance.
const gamificationCache = new Map<string, { data: GamificationState; timestamp: number }>();
const GAMIFICATION_CACHE_TTL = 30_000;

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
      const rows = await db.gamificationConfig.findMany({ take: 100 });
      for (const row of rows) {
        try { configs[row.key] = JSON.parse(row.value); } catch (parseErr: any) {
          console.warn(`[GAMIFICATION] Failed to parse config "${row.key}":`, parseErr?.message);
        }
      }
    } catch (loadErr: any) {
      console.warn("[GAMIFICATION] Config load failed, using defaults:", loadErr?.message);
    }
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
      // Get the YYYY-MM-DD in the user's timezone
      const dateStr = d.toLocaleDateString("en-CA", { timeZone: timezone });
      // Get the UTC offset for this timezone at this date using shortOffset
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" });
      const offsetStr = fmt.formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "GMT";
      // Parse offset: "GMT", "GMT+5", "GMT-5:30", "GMT+5:30" → minutes
      let offsetMinutes = 0;
      const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const sign = match[1] === "+" ? 1 : -1;
        offsetMinutes = sign * (parseInt(match[2]) * 60 + parseInt(match[3] || "0"));
      }
      // Midnight in user's timezone = midnight UTC minus their offset
      const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
      const tzStart = new Date(utcMidnight.getTime() - offsetMinutes * 60_000);
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

/** Public helper: get day bounds for a timezone (used by review endpoint) */
export function dayBoundsForTz(d: Date, timezone: string): { start: Date; end: Date } {
  return dayBounds(d, timezone);
}

/**
 * Resolve the UTC instant of local midnight for a YYYY-MM-DD string in the
 * given tz. Uses Intl.DateTimeFormat shortOffset which returns the correct
 * offset FOR THAT SPECIFIC INSTANT (so it naturally handles DST-aware offsets
 * and fractional offsets like India +5:30, Nepal +5:45, Chatham +12:45).
 */
function startOfUserLocalDay(dateStr: string, tz?: string | null): Date {
  if (tz) {
    try {
      const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
      const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" });
      const offsetStr = fmt.formatToParts(utcMidnight).find((p) => p.type === "timeZoneName")?.value || "GMT";
      let offsetMinutes = 0;
      const match = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const sign = match[1] === "+" ? 1 : -1;
        offsetMinutes = sign * (parseInt(match[2]) * 60 + parseInt(match[3] || "0"));
      }
      return new Date(utcMidnight.getTime() - offsetMinutes * 60_000);
    } catch {
      /* fall through to UTC */
    }
  }
  return new Date(`${dateStr}T00:00:00Z`);
}

/**
 * Canonical day-bounds primitive: take a YYYY-MM-DD date string + tz and return
 * the exact UTC window for that user-local day.
 *
 * DST-safe: `end` is computed as (next day's local midnight) − 1ms rather than
 * (today's start + 24h). On DST transition days the local day is 23h or 25h
 * long; a blind +24h under- or over-counts that last/extra hour and causes
 * clips submitted near midnight local to be attributed to the wrong day.
 * Querying the actual next-day boundary lets the Intl offset lookup resolve
 * the correct post-transition offset, so each day's window is its true length.
 */
function dayBoundsFromStr(dateStr: string, tz?: string | null): { start: Date; end: Date } {
  const start = startOfUserLocalDay(dateStr, tz);
  const nextStart = startOfUserLocalDay(shiftDateStr(dateStr, 1), tz);
  return { start, end: new Date(nextStart.getTime() - 1) };
}

/** Shift a YYYY-MM-DD string by N days. Always produces a valid YYYY-MM-DD. */
function shiftDateStr(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
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
  return evaluateDayByBounds(userId, start, end);
}

/** String-based variant — the canonical path used by updateStreak. */
async function evaluateDayByStr(userId: string, dateStr: string, timezone?: string | null): Promise<DayStatus> {
  if (!db) return "failed";
  const { start, end } = dayBoundsFromStr(dateStr, timezone);
  return evaluateDayByBounds(userId, start, end);
}

async function evaluateDayByBounds(userId: string, start: Date, end: Date): Promise<DayStatus> {
  if (!db) return "failed";
  const clips = await db.clip.findMany({
    where: {
      userId,
      createdAt: { gte: start, lte: end },
      isDeleted: false,
    },
    select: { status: true, streakDayLocked: true },
  });

  if (clips.length === 0) return "failed";
  if (clips.some((c: any) => c.streakDayLocked)) return "passed";
  if (clips.some((c: any) => c.status === "APPROVED")) return "passed";
  if (clips.every((c: any) => c.status === "REJECTED")) return "failed";
  return "pending";
}

/**
 * Evaluate and update a user's streak.
 *
 * Idempotent: always computes the streak from clip history backwards starting
 * at yesterday in the user's tz. Walks by YYYY-MM-DD date string (not by Date
 * objects) to avoid the negative-offset timezone trap where a UTC-anchored
 * pseudo-date, when re-interpreted via Intl.DateTimeFormat in the user's tz,
 * shifts onto the previous calendar day and silently queries the wrong bounds.
 *
 * Rules preserved from prior implementation:
 * - "passed" day = has an APPROVED clip OR a clip with streakDayLocked
 * - "failed" day = has clips, all REJECTED, or no clips at all — breaks streak
 * - "pending" day = has PENDING/FLAGGED clips — pauses walk (don't break yet)
 * - Today provisionally counts if the user has an APPROVED/PENDING/locked clip today
 * - 36h grace period after manual streakRestoredAt skips evaluation
 * - Freeze if user has no actively-posting campaigns
 */
export async function updateStreak(userId: string): Promise<void> {
  if (!db) return;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { lastActiveDate: true, currentStreak: true, longestStreak: true, timezone: true, streakRestoredAt: true },
  });
  if (!user) return;

  if (user.streakRestoredAt) {
    const hoursAgo = (Date.now() - new Date(user.streakRestoredAt).getTime()) / 3_600_000;
    if (hoursAgo < 36) {
      console.log(`[STREAK] Skipping evaluation for user ${userId} — streak restored ${Math.round(hoursAgo)}h ago`);
      return;
    }
  }

  const tz = user.timezone || "UTC";

  // Freeze check: no actively-posting campaigns → keep current state, don't evaluate.
  try {
    const memberships = await db.campaignAccount.findMany({
      where: { clipAccount: { userId } },
      include: { campaign: { select: { id: true, status: true } } },
      take: 500,
    });
    if (memberships.length > 0) {
      const activeCampaignIds = memberships
        .filter((m: any) => m.campaign.status === "ACTIVE")
        .map((m: any) => m.campaign.id);
      if (activeCampaignIds.length === 0) return;
      const clipInActive = await db.clip.findFirst({
        where: { userId, campaignId: { in: activeCampaignIds } },
        select: { id: true },
      });
      if (!clipInActive) return;
    }
  } catch (err: any) {
    console.error(`[STREAK] Freeze check failed for user ${userId}:`, err?.message);
    return;
  }

  // Today, in the user's tz, as a canonical date string. This is the anchor.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });

  // Walk backwards from yesterday. Count consecutive "passed" days. Stop on
  // "pending" (pause, don't break) or "failed" (break — save previousStreak).
  let streak = 0;
  let lastPassedStr: string | null = null;
  let brokeAtStr: string | null = null;
  let cursorStr = shiftDateStr(todayStr, -1);

  // Hard lookback cap. 400 days exceeds every documented streak tier.
  for (let i = 0; i < 400; i++) {
    const status = await evaluateDayByStr(userId, cursorStr, tz);
    if (status === "passed") {
      streak++;
      if (!lastPassedStr) lastPassedStr = cursorStr;
      cursorStr = shiftDateStr(cursorStr, -1);
      continue;
    }
    if (status === "pending") {
      // Pending day — stop counting but don't consider the streak broken.
      break;
    }
    // failed
    brokeAtStr = cursorStr;
    break;
  }

  // Today credit: user has an APPROVED/PENDING/locked clip today.
  const { start: todayStart, end: todayEnd } = dayBoundsFromStr(todayStr, tz);
  const todayActivity = await db.clip.findFirst({
    where: {
      userId,
      isDeleted: false,
      OR: [{ status: "APPROVED" }, { status: "PENDING" }, { streakDayLocked: true }],
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    select: { id: true },
  });

  if (todayActivity) {
    if (streak > 0 || !brokeAtStr) {
      // Either the walk found consecutive passed days ending yesterday, or it
      // stopped on pending/lookback — today extends or starts a streak.
      streak += 1;
      lastPassedStr = todayStr;
    } else {
      // Streak broke somewhere in the past, today restarts at 1.
      streak = 1;
      lastPassedStr = todayStr;
    }
  }

  // Save previousStreak if the streak just broke.
  if (streak === 0 && user.currentStreak > 0) {
    try {
      await db.user.update({ where: { id: userId }, data: { previousStreak: user.currentStreak } });
    } catch {}
  }

  const lastActiveDate = lastPassedStr
    ? new Date(`${lastPassedStr}T00:00:00Z`)
    : user.lastActiveDate;
  const newLongest = Math.max(streak, user.longestStreak);
  const streakChanged = streak !== user.currentStreak;

  console.log(
    `[STREAK-AUDIT] user=${userId} old=${user.currentStreak} new=${streak} tz=${tz} ` +
      `today=${todayStr} lastPassed=${lastPassedStr ?? "none"} brokeAt=${brokeAtStr ?? "none"} ` +
      `todayActivity=${!!todayActivity}`,
  );

  await db.user.update({
    where: { id: userId },
    data: {
      currentStreak: streak,
      longestStreak: newLongest,
      lastActiveDate,
    },
  });

  // Bust the in-memory gamification cache so the next dashboard read reflects
  // the write rather than a 30s-stale value.
  gamificationCache.delete(userId);

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

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone || "UTC";

  // Today's canonical date string in the user's tz.
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const oldestStr = shiftDateStr(todayStr, -(days - 1));
  const { start: oldestStart } = dayBoundsFromStr(oldestStr, tz);
  const { end: todayEnd } = dayBoundsFromStr(todayStr, tz);

  const clips = await db.clip.findMany({
    where: {
      userId,
      createdAt: { gte: oldestStart, lte: todayEnd },
      isDeleted: false,
    },
    select: { createdAt: true, status: true, streakDayLocked: true },
  });

  // Bucket each clip into its user-local YYYY-MM-DD once, up-front.
  const byDate: Map<string, { status: string; streakDayLocked: boolean }[]> = new Map();
  for (const c of clips as any[]) {
    const ds = new Date(c.createdAt).toLocaleDateString("en-CA", { timeZone: tz });
    let bucket = byDate.get(ds);
    if (!bucket) { bucket = []; byDate.set(ds, bucket); }
    bucket.push({ status: c.status, streakDayLocked: !!c.streakDayLocked });
  }

  const result: string[] = [];
  for (let i = 0; i < days; i++) {
    const dayStr = shiftDateStr(todayStr, -i);
    const dayClips = byDate.get(dayStr) || [];
    if (dayClips.length === 0) {
      result.push("empty");
    } else if (dayClips.some((c) => c.streakDayLocked)) {
      result.push("confirmed");
    } else if (dayClips.some((c) => c.status === "APPROVED")) {
      result.push("confirmed");
    } else if (dayClips.every((c) => c.status === "REJECTED")) {
      result.push("empty");
    } else {
      result.push("pending");
    }
  }

  return result;
}

/** Recompute user level and bonus based on total earnings */
export async function updateUserLevel(userId: string): Promise<void> {
  if (!db || !userId) return;

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

  // Cache hit — return in-memory snapshot from this Vercel instance
  const cached = gamificationCache.get(userId);
  if (cached && Date.now() - cached.timestamp < GAMIFICATION_CACHE_TTL) {
    return cached.data;
  }

  try {
    const result = await computeGamificationState(userId);
    if (result) {
      gamificationCache.set(userId, { data: result, timestamp: Date.now() });
    }
    return result;
  } catch (err: any) {
    console.error(`[GAMIFICATION] getGamificationState failed for user ${userId}:`, err?.message);
    // Return null on error — pages already handle null gracefully (empty state).
    return null;
  }
}

async function computeGamificationState(userId: string): Promise<GamificationState | null> {
  if (!db) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      totalEarnings: true, totalViews: true, level: true,
      bonusPercentage: true, currentStreak: true, longestStreak: true,
      referredById: true, isPWAUser: true, lastPWAOpenAt: true,
    },
  });
  if (!user) return null;

  // PWA validity — the +2% bonus requires BOTH `isPWAUser=true` AND a `lastPWAOpenAt`
  // within the last 2 days. The PWA app syncs hourly when open, so anyone who launches the
  // app even once every 2 days keeps the bonus; stop using it for 48h and the bonus drops.
  // A missing timestamp is treated the same as expired: no evidence of recent app use → no
  // bonus. This self-heals legacy rows from before `lastPWAOpenAt` existed.
  if (user.isPWAUser) {
    const lastOpenMs = user.lastPWAOpenAt ? new Date(user.lastPWAOpenAt).getTime() : 0;
    const daysSinceLastOpen = lastOpenMs ? (Date.now() - lastOpenMs) / (1000 * 60 * 60 * 24) : Infinity;
    if (!user.lastPWAOpenAt || daysSinceLastOpen > 2) {
      const reason = !user.lastPWAOpenAt ? "no lastPWAOpenAt recorded" : `no standalone access in ${Math.round(daysSinceLastOpen)} days`;
      console.log(`[PWA] User ${userId} lost PWA bonus — ${reason}`);
      await db.user.update({
        where: { id: userId },
        data: { isPWAUser: false },
      });
      user.isPWAUser = false;
      try {
        await recalculateUnpaidEarnings(userId);
      } catch (err: any) {
        console.error("[PWA] Earnings recalculation failed:", err?.message);
      }
    }
  }

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
      where: { userId, status: "APPROVED", videoUnavailable: false },
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
  // Belt-and-suspenders: the block above already sets isPWAUser=false when lastPWAOpenAt is
  // missing or stale, but we keep the second guard here so display can never award a bonus
  // without both flags healthy.
  const pwaBonusPct = (user.isPWAUser && user.lastPWAOpenAt) ? PWA_BONUS_PERCENT : 0;

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
    select: { level: true, currentStreak: true, referredById: true, isPWAUser: true, lastPWAOpenAt: true, manualBonusOverride: true },
  });
  if (!user) return { clipsUpdated: 0, oldTotal: 0, newTotal: 0 };

  // Effective PWA flag — must match the rule in computeGamificationState so any entry point
  // (tracking, streak break, level change, PWA toggle) pays the correct bonus regardless of
  // whether the dashboard self-heal has run yet. Requires both isPWAUser=true AND a
  // lastPWAOpenAt within 2 days.
  const lastOpenMs = user.lastPWAOpenAt ? new Date(user.lastPWAOpenAt).getTime() : 0;
  const daysSinceLastOpen = lastOpenMs ? (Date.now() - lastOpenMs) / (1000 * 60 * 60 * 24) : Infinity;
  const isPWAUserEffective = !!user.isPWAUser && !!user.lastPWAOpenAt && daysSinceLastOpen <= 2;

  // Get IDs of clips already included in PAID payouts (their earnings are locked)
  const paidPayouts = await db.payoutRequest.findMany({
    where: { userId, status: "PAID" },
    select: { campaignId: true },
    take: 1000,
  });
  const paidCampaignIds = new Set(paidPayouts.map((p: any) => p.campaignId).filter(Boolean));

  // Get all APPROVED clips
  const clips = await db.clip.findMany({
    where: { userId, status: "APPROVED", isDeleted: false, videoUnavailable: false },
    include: {
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true, lastBudgetPauseAt: true } },
    },
    take: 5000,
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
        } catch (aeErr: any) {
          console.error(`[RECALC] Agency earnings fetch failed for campaign ${campaignId}:`, aeErr?.message);
        }
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

      // Streak portion is locked per-clip at approval; lazy-backfill legacy
      // clips from the user's current streak so they stop shifting.
      let lockedStreakPct = (clip as any).streakBonusPercentAtApproval as number | null | undefined;
      if (lockedStreakPct == null) {
        const { getStreakBonusPercent } = await import("@/lib/earnings-calc");
        lockedStreakPct = getStreakBonusPercent(user.currentStreak, config.streakBonuses);
        await db.clip.update({
          where: { id: clip.id },
          data: { streakBonusPercentAtApproval: lockedStreakPct },
        }).catch((bfErr: any) => {
          console.error(`[RECALC] Lazy backfill of streak lock failed for ${clip.id}:`, bfErr?.message);
        });
      }

      const cpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;
      const result = calculateClipperEarnings({
        views: stat.views,
        clipperCpm: cpm,
        campaignMinViews: clip.campaign.minViews,
        campaignMaxPayoutPerClip: clip.campaign.maxPayoutPerClip,
        clipperLevel: user.level,
        clipperStreak: user.currentStreak,
        streakBonusPercentOverride: lockedStreakPct ?? 0,
        levelBonuses: config.levelBonuses,
        streakBonuses: config.streakBonuses,
        isReferred: !!user.referredById,
        isPWAUser: isPWAUserEffective,
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
