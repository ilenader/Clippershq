/**
 * Core earnings calculation logic.
 *
 * Single monetization model: FIXED CLIPPER BUDGET
 *   - Each campaign has a clipper CPM rate
 *   - Each campaign has a clipper budget
 *   - Earnings = (views / 1000) * clipperCpm
 *   - Level/streak bonus increases clipper earnings from the same budget
 *   - Platform fee applies on clipper earnings
 *   - No owner CPM / split logic
 */

// ─── Default configs (overridden by DB GamificationConfig) ──

export const DEFAULT_LEVEL_THRESHOLDS = [
  { level: 0, minEarnings: 0 },
  { level: 1, minEarnings: 300 },
  { level: 2, minEarnings: 1000 },
  { level: 3, minEarnings: 2500 },
  { level: 4, minEarnings: 8000 },
  { level: 5, minEarnings: 20000 },
];

export const DEFAULT_LEVEL_BONUSES: Record<number, number> = {
  0: 0,     // 0%
  1: 3,     // +3%
  2: 6,     // +6%
  3: 10,    // +10%
  4: 15,    // +15%
  5: 20,    // +20%
};

export const DEFAULT_STREAK_BONUSES = [
  { days: 3, bonusPercent: 2 },
  { days: 7, bonusPercent: 4 },
  { days: 14, bonusPercent: 5 },
  { days: 30, bonusPercent: 7 },
  { days: 60, bonusPercent: 9 },
];

export const DEFAULT_PLATFORM_FEE = 9;  // 9% for normal users
export const DEFAULT_REFERRED_FEE = 4;  // 4% for referred users (fixed, never lower)
export const DEFAULT_FEE_TIERS: { streakDays: number; feePercent: number }[] = [];

export const MAX_BONUS_CAP = 25;           // normal max total bonus
export const MANUAL_OVERRIDE_CEILING = 30; // absolute max with manual override
export const DEFAULT_REFERRAL_PERCENT = 5; // inviter earns 5% of referred user earnings

// ─── Types ──────────────────────────────────────────────────

export interface EarningsInput {
  views: number;
  campaignMinViews: number | null;
  campaignCpmRate: number | null;
  campaignMaxPayoutPerClip: number | null;
}

export const PWA_BONUS_PERCENT = 2; // +2% for PWA users

export interface ClipperEarningsInput {
  views: number;
  clipperCpm: number | null;
  campaignMinViews: number | null;
  campaignMaxPayoutPerClip: number | null;
  // Gamification
  clipperLevel: number;
  clipperStreak: number;
  levelBonuses?: Record<number, number>;
  streakBonuses?: { days: number; bonusPercent: number }[];
  platformFeePercent?: number;
  maxBonusCap?: number;
  manualBonusOverride?: number | null;
  isReferred?: boolean;
  isPWAUser?: boolean;
}

export interface EarningsBreakdown {
  clipperEarnings: number;
  platformFee: number;
  bonusPercent: number;
  effectiveFeePercent: number;
  grossClipperEarnings: number;
}

// ─── Legacy function (kept for backward compat with test scripts) ──

export function calculateClipEarnings(input: EarningsInput): number {
  const { views, campaignMinViews, campaignCpmRate, campaignMaxPayoutPerClip } = input;
  if (!views || views <= 0) return 0;
  if (campaignMinViews && views < campaignMinViews) return 0;
  if (!campaignCpmRate || campaignCpmRate <= 0) return 0;

  let earnings = (views / 1000) * campaignCpmRate;
  if (campaignMaxPayoutPerClip && campaignMaxPayoutPerClip > 0) {
    earnings = Math.min(earnings, campaignMaxPayoutPerClip);
  }
  return Math.round(earnings * 100) / 100;
}

// ─── Main earnings calculation ──────────────────────────────

export function calculateClipperEarnings(input: ClipperEarningsInput): EarningsBreakdown {
  const {
    views, clipperCpm,
    campaignMinViews, campaignMaxPayoutPerClip,
    clipperLevel, clipperStreak,
    levelBonuses = DEFAULT_LEVEL_BONUSES,
    streakBonuses = DEFAULT_STREAK_BONUSES,
    platformFeePercent = DEFAULT_PLATFORM_FEE,
    maxBonusCap = MAX_BONUS_CAP,
    manualBonusOverride = null,
    isReferred = false,
    isPWAUser = false,
  } = input;

  const baseFee = isReferred ? DEFAULT_REFERRED_FEE : platformFeePercent;

  const empty: EarningsBreakdown = {
    clipperEarnings: 0, platformFee: 0,
    bonusPercent: 0, effectiveFeePercent: baseFee, grossClipperEarnings: 0,
  };

  if (!views || views <= 0) return empty;
  if (campaignMinViews && views < campaignMinViews) return empty;

  const cpm = clipperCpm || 0;
  if (cpm <= 0) return empty;

  // Calculate level bonus %
  const levelBonus = levelBonuses[clipperLevel] || 0;

  // Calculate streak bonus %
  let streakBonus = 0;
  for (const tier of [...streakBonuses].sort((a, b) => b.days - a.days)) {
    if (clipperStreak >= tier.days) { streakBonus = tier.bonusPercent; break; }
  }

  // PWA bonus (additive, stacks with level + streak)
  const pwaBonus = isPWAUser ? PWA_BONUS_PERCENT : 0;

  // Apply bonus cap
  let totalBonusPercent: number;
  if (manualBonusOverride != null) {
    totalBonusPercent = Math.min(manualBonusOverride, MANUAL_OVERRIDE_CEILING);
  } else {
    totalBonusPercent = Math.min(levelBonus + streakBonus + pwaBonus, maxBonusCap);
  }

  const effectiveFee = isReferred ? Math.max(baseFee, DEFAULT_REFERRED_FEE) : baseFee;

  // Base earnings from clipper CPM
  let grossClipper = (views / 1000) * cpm;

  // Cap before bonus
  if (campaignMaxPayoutPerClip && campaignMaxPayoutPerClip > 0) {
    grossClipper = Math.min(grossClipper, campaignMaxPayoutPerClip);
  }

  // Apply bonus (level + streak) — bonus comes from campaign budget
  const bonusAmount = grossClipper * (totalBonusPercent / 100);
  grossClipper += bonusAmount;

  // Cap again after bonus
  if (campaignMaxPayoutPerClip && campaignMaxPayoutPerClip > 0) {
    grossClipper = Math.min(grossClipper, campaignMaxPayoutPerClip);
  }

  // Platform fee
  const fee = grossClipper * (effectiveFee / 100);

  return {
    clipperEarnings: round2(grossClipper - fee),
    platformFee: round2(fee),
    bonusPercent: totalBonusPercent,
    effectiveFeePercent: effectiveFee,
    grossClipperEarnings: round2(grossClipper),
  };
}

// ─── Backward-compatible alias (used by old code that called calculateDualEarnings) ──

export function calculateDualEarnings(input: {
  views: number;
  monetizationType?: string;
  clipperCpm?: number | null;
  ownerCpm?: number | null;
  campaignCpmRate?: number | null;
  campaignMinViews?: number | null;
  campaignMaxPayoutPerClip?: number | null;
  clipperLevel?: number;
  clipperStreak?: number;
  levelBonuses?: Record<number, number>;
  streakBonuses?: { days: number; bonusPercent: number }[];
  platformFeePercent?: number;
  feeTiers?: { streakDays: number; feePercent: number }[];
  maxBonusCap?: number;
  manualBonusOverride?: number | null;
  isReferred?: boolean;
  isPWAUser?: boolean;
}): EarningsBreakdown {
  // Use clipperCpm; fallback to campaignCpmRate for legacy campaigns
  const cpm = input.clipperCpm ?? input.campaignCpmRate ?? null;
  const result = calculateClipperEarnings({
    views: input.views,
    clipperCpm: cpm,
    campaignMinViews: input.campaignMinViews ?? null,
    campaignMaxPayoutPerClip: input.campaignMaxPayoutPerClip ?? null,
    clipperLevel: input.clipperLevel ?? 0,
    clipperStreak: input.clipperStreak ?? 0,
    levelBonuses: input.levelBonuses,
    streakBonuses: input.streakBonuses,
    platformFeePercent: input.platformFeePercent,
    maxBonusCap: input.maxBonusCap,
    manualBonusOverride: input.manualBonusOverride,
    isReferred: input.isReferred,
    isPWAUser: input.isPWAUser,
  });
  return result;
}

// ─── Recalculate helpers ────────────────────────────────────

export function recalculateClipEarnings(clip: {
  stats: { views: number }[];
  campaign: {
    minViews: number | null;
    cpmRate: number | null;
    maxPayoutPerClip: number | null;
    monetizationType?: string;
    clipperCpm?: number | null;
    ownerCpm?: number | null;
  };
  user?: { level?: number; currentStreak?: number; referredById?: string | null; isPWAUser?: boolean };
}): number {
  const latestStat = clip.stats[0];
  if (!latestStat) return 0;

  // Use clipperCpm; fallback to cpmRate for legacy campaigns
  const cpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;

  const result = calculateClipperEarnings({
    views: latestStat.views,
    clipperCpm: cpm,
    campaignMinViews: clip.campaign.minViews,
    campaignMaxPayoutPerClip: clip.campaign.maxPayoutPerClip,
    clipperLevel: clip.user?.level ?? 0,
    clipperStreak: clip.user?.currentStreak || 0,
    isReferred: !!clip.user?.referredById,
    isPWAUser: clip.user?.isPWAUser ?? false,
  });
  return result.clipperEarnings;
}

/** Compute which level a user should be based on total earnings */
export function computeLevel(
  totalEarnings: number,
  thresholds = DEFAULT_LEVEL_THRESHOLDS,
): number {
  let level = 0;
  for (const t of thresholds) {
    if (totalEarnings >= t.minEarnings) level = t.level;
  }
  return level;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
