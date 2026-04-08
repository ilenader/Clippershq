/**
 * Payout calculation - single source of truth.
 *
 * Formula:
 *   finalPayout = requestedAmount - (requestedAmount * feePercent / 100)
 *
 * Bonus is already included in clip.earnings (applied at earnings calc time).
 * Only the platform fee is deducted at payout time.
 */

export interface PayoutBreakdown {
  /** The amount the user typed in (from their gross earnings balance) */
  requestedAmount: number;
  /** Platform fee percent (9 standard, 4 referred) */
  feePercent: number;
  /** User's current total bonus percent (for display only — already in earnings) */
  bonusPercent: number;
  /** Dollar amount deducted as fee */
  feeAmount: number;
  /** Bonus amount (for display only — already in requested amount) */
  bonusAmount: number;
  /** What the user actually receives */
  finalAmount: number;
}

export function calculatePayoutBreakdown(
  requestedAmount: number,
  feePercent: number,
  bonusPercent: number,
): PayoutBreakdown {
  const feeAmount = round2(requestedAmount * feePercent / 100);
  // Bonus is already included in the requested amount (baked into clip.earnings)
  // bonusAmount here is for display/reference only
  const bonusAmount = round2(requestedAmount * bonusPercent / (100 + bonusPercent));
  const finalAmount = round2(requestedAmount - feeAmount);

  return {
    requestedAmount: round2(requestedAmount),
    feePercent,
    bonusPercent,
    feeAmount,
    bonusAmount,
    finalAmount,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
