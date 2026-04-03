/**
 * Centralized balance calculation.
 * Single source of truth for available balance logic.
 * Supports both global and campaign-scoped balances.
 */

export interface BalanceInput {
  clips: { earnings: number; status: string; campaignId?: string }[];
  payouts: { amount: number; status: string; campaignId?: string | null }[];
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
  // totalEarned = only APPROVED clips (same as approvedEarnings for safety)
  const totalEarned = round2(input.clips
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + (c.earnings || 0), 0));

  const approvedEarnings = round2(input.clips
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + (c.earnings || 0), 0));

  const pendingEarnings = round2(input.clips
    .filter((c) => c.status === "PENDING")
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

/** Round to 2 decimal places safely */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
