/**
 * Centralized balance calculation.
 * Single source of truth for available balance logic.
 * Used by both the earnings API and payout validation.
 */

export interface BalanceInput {
  clips: { earnings: number; status: string }[];
  payouts: { amount: number; status: string }[];
}

export interface BalanceResult {
  /** Sum of all clip earnings (any status) */
  totalEarned: number;
  /** Sum of earnings from APPROVED clips only */
  approvedEarnings: number;
  /** Sum of earnings from PENDING clips */
  pendingEarnings: number;
  /** Sum of payouts with status PAID */
  paidOut: number;
  /** Sum of payouts with status REQUESTED | UNDER_REVIEW | APPROVED (not yet paid, not rejected) */
  lockedInPayouts: number;
  /** What the user can actually request: approvedEarnings - paidOut - lockedInPayouts */
  available: number;
}

const LOCKED_PAYOUT_STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED"];

export function computeBalance(input: BalanceInput): BalanceResult {
  const totalEarned = input.clips.reduce((s, c) => s + (c.earnings || 0), 0);

  const approvedEarnings = input.clips
    .filter((c) => c.status === "APPROVED")
    .reduce((s, c) => s + (c.earnings || 0), 0);

  const pendingEarnings = input.clips
    .filter((c) => c.status === "PENDING")
    .reduce((s, c) => s + (c.earnings || 0), 0);

  const paidOut = input.payouts
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + (p.amount || 0), 0);

  const lockedInPayouts = input.payouts
    .filter((p) => LOCKED_PAYOUT_STATUSES.includes(p.status))
    .reduce((s, p) => s + (p.amount || 0), 0);

  const available = Math.max(approvedEarnings - paidOut - lockedInPayouts, 0);

  return {
    totalEarned,
    approvedEarnings,
    pendingEarnings,
    paidOut,
    lockedInPayouts,
    available,
  };
}
