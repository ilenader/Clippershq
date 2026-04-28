/**
 * Centralized balance calculation.
 * Single source of truth for available balance logic.
 * Supports both global and campaign-scoped balances.
 */

export interface BalanceInput {
  clips: { earnings: number; status: string; campaignId?: string }[];
  payouts: { amount: number; status: string; campaignId?: string | null }[];
  // Phase 6d — creator's 60% share from marketplace clips lives in
  // MarketplaceCreatorEarning, NOT in Clip.earnings (which holds the poster's
  // 30%). Treat any present row as APPROVED — cron + review only write these
  // rows when the underlying clip is APPROVED and rolls them back on
  // rejection. There is no "pending" state for creator earnings.
  // Self-listing (creator === poster on same clip) is mathematically safe:
  // Clip.earnings holds poster's 30%, MarketplaceCreatorEarning.amount holds
  // creator's 60% — separate rows in separate tables, no double-count.
  // Sum to user = 30% + 60% = 90% gross (platform's 10% stays hidden).
  marketplaceCreatorEarnings?: { amount: number; campaignId: string }[];
}

export interface BalanceResult {
  totalEarned: number;
  approvedEarnings: number;
  pendingEarnings: number;
  paidOut: number;
  lockedInPayouts: number;
  available: number;
}

export interface CampaignBalance {
  campaignId: string;
  campaignName?: string;
  earned: number;
  paidOut: number;
  locked: number;
  available: number;
}

const LOCKED_PAYOUT_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED"];

/** Compute global balance across all campaigns */
export function computeBalance(input: BalanceInput): BalanceResult {
  // Phase 6d — sum creator's 60% share from marketplace clips. Always counts
  // toward APPROVED earnings (no pending state — see BalanceInput comment).
  const creatorEarnings = (input.marketplaceCreatorEarnings ?? [])
    .reduce((s, c) => s + (c.amount || 0), 0);

  // totalEarned = only APPROVED clips + marketplace creator earnings
  const totalEarned = round2(input.clips
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + (c.earnings || 0), 0) + creatorEarnings);

  const approvedEarnings = round2(input.clips
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + (c.earnings || 0), 0) + creatorEarnings);

  // FLAGGED clips are hidden from CLIPPERs behind a PENDING facade
  // (see /api/clips/mine + /api/earnings sanitization). Bucket them with
  // PENDING here so the balance reported to the clipper matches the status
  // they see on their clip cards. APPROVED/available is NEVER touched —
  // FLAGGED earnings must never count toward withdrawable balance.
  const pendingEarnings = round2(input.clips
    .filter((c) => c.status === "PENDING" || c.status === "FLAGGED")
    .reduce((s, c) => s + (c.earnings || 0), 0));

  const paidOut = round2(input.payouts
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + (p.amount || 0), 0));

  const lockedInPayouts = round2(input.payouts
    .filter((p) => LOCKED_PAYOUT_STATUSES.includes(p.status))
    .reduce((s, p) => s + (p.amount || 0), 0));

  const available = round2(Math.max(approvedEarnings - paidOut - lockedInPayouts, 0));

  return { totalEarned, approvedEarnings, pendingEarnings, paidOut, lockedInPayouts, available };
}

/** Compute per-campaign balances */
export function computeCampaignBalances(input: BalanceInput): CampaignBalance[] {
  const campaignMap: Record<string, { earned: number; paidOut: number; locked: number }> = {};

  for (const clip of input.clips) {
    if (!clip.campaignId || clip.status !== "APPROVED") continue;
    if (!campaignMap[clip.campaignId]) campaignMap[clip.campaignId] = { earned: 0, paidOut: 0, locked: 0 };
    campaignMap[clip.campaignId].earned += clip.earnings || 0;
  }

  // Phase 6d — fold creator's 60% from marketplace clips into per-campaign
  // earned. These rows only exist when the underlying clip is APPROVED, so
  // no status filter is needed here (see BalanceInput comment).
  for (const row of input.marketplaceCreatorEarnings ?? []) {
    if (!row.campaignId) continue;
    if (!campaignMap[row.campaignId]) campaignMap[row.campaignId] = { earned: 0, paidOut: 0, locked: 0 };
    campaignMap[row.campaignId].earned += row.amount || 0;
  }

  for (const payout of input.payouts) {
    if (!payout.campaignId) continue;
    if (!campaignMap[payout.campaignId]) campaignMap[payout.campaignId] = { earned: 0, paidOut: 0, locked: 0 };
    if (payout.status === "PAID") {
      campaignMap[payout.campaignId].paidOut += payout.amount || 0;
    } else if (LOCKED_PAYOUT_STATUSES.includes(payout.status)) {
      campaignMap[payout.campaignId].locked += payout.amount || 0;
    }
  }

  return Object.entries(campaignMap).map(([campaignId, data]) => ({
    campaignId,
    earned: round2(data.earned),
    paidOut: round2(data.paidOut),
    locked: round2(data.locked),
    available: round2(Math.max(data.earned - data.paidOut - data.locked, 0)),
  }));
}

/**
 * Get campaign budget status. Uses DB directly.
 * Returns { budget, spent, remaining, isOverBudget }
 */
export async function getCampaignBudgetStatus(campaignId: string): Promise<{
  budget: number;
  spent: number;
  remaining: number;
  isOverBudget: boolean;
} | null> {
  if (!campaignId) return null;
  try {
    const { db } = await import("@/lib/db");
    if (!db) return null;

    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { budget: true, pricingModel: true },
    });
    if (!campaign || campaign.budget == null) return null;

    const earningsAgg = await db.clip.aggregate({
      where: { campaignId, isDeleted: false, status: "APPROVED", videoUnavailable: false },
      _sum: { earnings: true },
    });
    let spent = round2(earningsAgg._sum.earnings ?? 0);

    // For CPM_SPLIT: budget covers both clipper and owner earnings
    if (campaign.pricingModel === "CPM_SPLIT") {
      const ownerAgg = await db.agencyEarning.aggregate({
        where: { campaignId },
        _sum: { amount: true },
      });
      spent = round2(spent + (ownerAgg._sum.amount ?? 0));
    }

    // Phase 6d — marketplace creator (60%) and platform (10%) earnings always
    // count toward campaign spend regardless of pricingModel. A marketplace
    // clip's Clip.earnings only holds the poster's 30%; the other two shares
    // live in separate tables. Skipping them would understate spend by ~70%
    // on marketplace campaigns and let owners overspend their budget.
    const creatorAgg = await db.marketplaceCreatorEarning.aggregate({
      where: { campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
      _sum: { amount: true },
    });
    const platformAgg = await db.marketplacePlatformEarning.aggregate({
      where: { campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
      _sum: { amount: true },
    });
    spent = round2(spent + (creatorAgg._sum.amount ?? 0) + (platformAgg._sum.amount ?? 0));

    const remaining = round2(Math.max(campaign.budget - spent, 0));

    return {
      budget: campaign.budget,
      spent,
      remaining,
      isOverBudget: spent >= campaign.budget,
    };
  } catch {
    return null;
  }
}

/** Round to 2 decimal places safely */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
