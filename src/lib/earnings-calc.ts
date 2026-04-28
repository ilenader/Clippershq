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
  { days: 3, bonusPercent: 1 },
  { days: 7, bonusPercent: 2 },
  { days: 14, bonusPercent: 3 },
  { days: 30, bonusPercent: 5 },
  { days: 60, bonusPercent: 7 },
  { days: 90, bonusPercent: 10 },
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
  /** When provided (non-null), skips the streak-tier lookup and uses this %
   *  as the streak bonus portion. Used to lock the streak % at approval time
   *  so later streak changes don't retroactively adjust the clip's bonus.
   *  Level/PWA/budget recalc still runs normally. */
  streakBonusPercentOverride?: number | null;
}

export interface EarningsBreakdown {
  clipperEarnings: number;
  platformFee: number;
  bonusPercent: number;
  bonusAmount: number;
  baseEarnings: number;
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
  return Math.max(0, Math.round(earnings * 100) / 100);
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
    streakBonusPercentOverride = null,
  } = input;

  const baseFee = isReferred ? DEFAULT_REFERRED_FEE : platformFeePercent;

  const empty: EarningsBreakdown = {
    clipperEarnings: 0, platformFee: 0,
    bonusPercent: 0, bonusAmount: 0, baseEarnings: 0,
    effectiveFeePercent: baseFee, grossClipperEarnings: 0,
  };

  if (!views || views <= 0) return empty;
  if (campaignMinViews && views < campaignMinViews) return empty;

  const cpm = clipperCpm || 0;
  if (cpm <= 0) return empty;

  // Calculate level bonus %
  const levelBonus = levelBonuses[clipperLevel] || 0;

  // Calculate streak bonus %. When a locked override is provided (a clip's
  // snapshot at approval time), use it verbatim; otherwise look up the current
  // tier from the user's live streak days.
  let streakBonus = 0;
  if (streakBonusPercentOverride != null) {
    streakBonus = Math.max(0, streakBonusPercentOverride);
  } else {
    for (const tier of [...streakBonuses].sort((a, b) => b.days - a.days)) {
      if (clipperStreak >= tier.days) { streakBonus = tier.bonusPercent; break; }
    }
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

  // IMPORTANT: maxPayoutPerClip caps BASE earnings BEFORE bonus is applied.
  // Bonus is calculated on the CAPPED base and added on top — NOT re-capped afterward.
  // A clipper with +10% bonus on a $5-capped clip earns $5.50, not $5.00.
  // This is intentional: level/streak bonuses are rewards earned on top of the per-clip ceiling,
  // paid from the campaign budget as an incentive. Do not re-cap grossClipper.

  // Base earnings from clipper CPM
  let baseEarnings = (views / 1000) * cpm;

  // Cap the BASE only (before bonus). Bonus is free to exceed the per-clip cap.
  if (campaignMaxPayoutPerClip && campaignMaxPayoutPerClip > 0) {
    baseEarnings = Math.min(baseEarnings, campaignMaxPayoutPerClip);
  }

  // Apply bonus (level + streak + PWA) on the capped base — bonus comes from campaign budget
  const bonusAmount = baseEarnings * (totalBonusPercent / 100);
  const grossClipper = baseEarnings + bonusAmount;

  // Platform fee is calculated for reference but NOT subtracted from clipperEarnings.
  // Fee is applied once at payout time, not at earnings calculation time.
  const fee = grossClipper * (effectiveFee / 100);

  // Floor all monetary outputs at 0 — never return negative earnings downstream
  return {
    clipperEarnings: Math.max(0, round2(grossClipper)),       // GROSS earnings (base + bonus, before fee)
    platformFee: Math.max(0, round2(fee)),                     // For reference only — not subtracted
    bonusPercent: totalBonusPercent,
    bonusAmount: Math.max(0, round2(bonusAmount)),
    baseEarnings: Math.max(0, round2(baseEarnings)),
    effectiveFeePercent: effectiveFee,
    grossClipperEarnings: Math.max(0, round2(grossClipper)),   // Same as clipperEarnings now
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
  return Math.max(0, result.clipperEarnings);
}

/**
 * Full breakdown version of recalculateClipEarnings.
 * Pass `bonusOverride` to force a specific total bonus % (e.g., when tracking wants to use
 * the user's CURRENT gamification bonus instead of recomputing from their stored level/streak/PWA,
 * which may be stale if streak hasn't been re-evaluated yet).
 */
export function recalculateClipEarningsBreakdown(clip: {
  stats: { views: number }[];
  campaign: {
    minViews: number | null;
    cpmRate: number | null;
    maxPayoutPerClip: number | null;
    clipperCpm?: number | null;
    ownerCpm?: number | null;
  };
  user?: { level?: number; currentStreak?: number; referredById?: string | null; isPWAUser?: boolean };
  bonusOverride?: number;
  /** Locked streak bonus % captured at approval time. Forwarded to
   *  calculateClipperEarnings as streakBonusPercentOverride so level/PWA/budget
   *  recalc can still run without disturbing the streak portion. */
  streakBonusPercentAtApproval?: number | null;
}): EarningsBreakdown {
  const latestStat = clip.stats[0];
  const empty: EarningsBreakdown = { clipperEarnings: 0, platformFee: 0, bonusPercent: 0, bonusAmount: 0, baseEarnings: 0, effectiveFeePercent: 9, grossClipperEarnings: 0 };
  if (!latestStat) return empty;

  const cpm = clip.campaign.clipperCpm ?? clip.campaign.cpmRate ?? null;
  return calculateClipperEarnings({
    views: latestStat.views,
    clipperCpm: cpm,
    campaignMinViews: clip.campaign.minViews,
    campaignMaxPayoutPerClip: clip.campaign.maxPayoutPerClip,
    clipperLevel: clip.user?.level ?? 0,
    clipperStreak: clip.user?.currentStreak || 0,
    isReferred: !!clip.user?.referredById,
    isPWAUser: clip.user?.isPWAUser ?? false,
    manualBonusOverride: clip.bonusOverride ?? null,
    streakBonusPercentOverride: clip.streakBonusPercentAtApproval ?? null,
  });
}

/**
 * Resolve the streak bonus % a user currently qualifies for based on streak days.
 * Mirrors the lookup inside calculateClipperEarnings — exported so the approval
 * path can snapshot this value onto a clip as streakBonusPercentAtApproval.
 */
export function getStreakBonusPercent(
  streakDays: number,
  streakBonuses: { days: number; bonusPercent: number }[] = DEFAULT_STREAK_BONUSES,
): number {
  for (const tier of [...streakBonuses].sort((a, b) => b.days - a.days)) {
    if (streakDays >= tier.days) return tier.bonusPercent;
  }
  return 0;
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

/**
 * Calculate owner earnings for CPM_SPLIT campaigns.
 * If clipper earnings are capped (maxPayoutPerClip), owner earnings are proportional:
 *   ownerEarnings = clipperGrossEarnings × (ownerCpm / clipperCpm)
 * This ensures both sides respect the cap proportionally.
 */
export function calculateOwnerEarnings(
  views: number,
  ownerCpm: number | null,
  clipperGrossEarnings?: number,
  clipperCpm?: number | null,
): number {
  if (!views || views <= 0 || !ownerCpm || ownerCpm <= 0) return 0;

  // If clipper earnings and CPM are provided, use proportional calculation
  if (clipperGrossEarnings != null && clipperCpm && clipperCpm > 0) {
    return Math.max(0, round2(clipperGrossEarnings * (ownerCpm / clipperCpm)));
  }

  // Fallback: raw views × ownerCpm (no cap context available).
  // This path only runs for display/reference when clipperGrossEarnings is not provided.
  // Actual earnings calculation always passes clipperGrossEarnings, so maxPayoutPerClip
  // is enforced through the proportional path above.
  return Math.max(0, round2((views / 1000) * ownerCpm));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Marketplace split (Phase 6c) ───────────────────────────
// 60/30/10 across creator / poster / platform. Cap applies to GROSS first
// (matching existing maxPayoutPerClip behavior), then split. Each party's
// bonus (level + streak + PWA) is computed against THEIR own profile and
// added on top of THEIR share. Platform's 10% gets no bonus.

export const MARKETPLACE_CREATOR_SHARE = 0.6;
export const MARKETPLACE_POSTER_SHARE = 0.3;
export const MARKETPLACE_PLATFORM_SHARE = 0.1;

export interface MarketplacePartyInput {
  level: number;
  streak: number;
  isPWAUser: boolean;
  isReferred: boolean;
  manualBonusOverride?: number | null;
  streakBonusPercentAtApproval?: number | null;
  levelBonuses?: Record<number, number>;
  streakBonuses?: { days: number; bonusPercent: number }[];
  maxBonusCap?: number;
}

export interface MarketplaceEarningsBreakdown {
  base: { gross: number; creatorBase: number; posterBase: number; platformBase: number };
  creator: { base: number; bonusPercent: number; bonusAmount: number; total: number };
  poster: { base: number; bonusPercent: number; bonusAmount: number; total: number };
  platform: { amount: number };
}

function computePartyBonusPercent(party: MarketplacePartyInput): number {
  const levelBonuses = party.levelBonuses ?? DEFAULT_LEVEL_BONUSES;
  const streakBonuses = party.streakBonuses ?? DEFAULT_STREAK_BONUSES;
  const maxBonusCap = party.maxBonusCap ?? MAX_BONUS_CAP;

  if (party.manualBonusOverride != null) {
    return Math.min(party.manualBonusOverride, MANUAL_OVERRIDE_CEILING);
  }

  const levelBonus = levelBonuses[party.level] || 0;
  let streakBonus = 0;
  if (party.streakBonusPercentAtApproval != null) {
    streakBonus = Math.max(0, party.streakBonusPercentAtApproval);
  } else {
    for (const tier of [...streakBonuses].sort((a, b) => b.days - a.days)) {
      if (party.streak >= tier.days) { streakBonus = tier.bonusPercent; break; }
    }
  }
  const pwaBonus = party.isPWAUser ? PWA_BONUS_PERCENT : 0;
  return Math.min(levelBonus + streakBonus + pwaBonus, maxBonusCap);
}

export function calculateMarketplaceEarnings(input: {
  views: number;
  campaignCpm: number | null;
  campaignMinViews: number | null;
  campaignMaxPayoutPerClip: number | null;
  creator: MarketplacePartyInput;
  poster: MarketplacePartyInput;
}): MarketplaceEarningsBreakdown {
  const empty: MarketplaceEarningsBreakdown = {
    base: { gross: 0, creatorBase: 0, posterBase: 0, platformBase: 0 },
    creator: { base: 0, bonusPercent: 0, bonusAmount: 0, total: 0 },
    poster: { base: 0, bonusPercent: 0, bonusAmount: 0, total: 0 },
    platform: { amount: 0 },
  };

  if (!input.views || input.views <= 0) return empty;
  if (input.campaignMinViews && input.views < input.campaignMinViews) return empty;
  const cpm = input.campaignCpm || 0;
  if (cpm <= 0) return empty;

  // Cap GROSS first, then split. Bonuses on each share added on top
  // (same per-clip cap behavior as the standard CPM path: bonus may exceed cap).
  let gross = (input.views / 1000) * cpm;
  if (input.campaignMaxPayoutPerClip && input.campaignMaxPayoutPerClip > 0) {
    gross = Math.min(gross, input.campaignMaxPayoutPerClip);
  }

  const creatorBase = round2(gross * MARKETPLACE_CREATOR_SHARE);
  const posterBase = round2(gross * MARKETPLACE_POSTER_SHARE);
  const platformBase = round2(gross * MARKETPLACE_PLATFORM_SHARE);

  const creatorBonusPct = computePartyBonusPercent(input.creator);
  const posterBonusPct = computePartyBonusPercent(input.poster);
  const creatorBonusAmount = round2(creatorBase * (creatorBonusPct / 100));
  const posterBonusAmount = round2(posterBase * (posterBonusPct / 100));

  return {
    base: {
      gross: round2(gross),
      creatorBase,
      posterBase,
      platformBase,
    },
    creator: {
      base: creatorBase,
      bonusPercent: creatorBonusPct,
      bonusAmount: creatorBonusAmount,
      total: round2(creatorBase + creatorBonusAmount),
    },
    poster: {
      base: posterBase,
      bonusPercent: posterBonusPct,
      bonusAmount: posterBonusAmount,
      total: round2(posterBase + posterBonusAmount),
    },
    platform: { amount: platformBase },
  };
}
