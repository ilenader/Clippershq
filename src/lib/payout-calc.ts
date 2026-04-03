/**
 * Payout calculation - single source of truth.
 *
 * Formula:
 *   finalPayout = requestedAmount
 *                 - (requestedAmount * feePercent / 100)
 *                 + (requestedAmount * bonusPercent / 100)
 *
 * Fee and bonus are both calculated from the original requested amount.
 */

export interface PayoutBreakdown {
  /** The amount the user typed in */
  requestedAmount: number;
  /** Platform fee percent (9 standard, 4 referred) */
  feePercent: number;
  /** User's current total bonus percent (level + streak) */
  bonusPercent: number;
  /** Dollar amount deducted as fee */
  feeAmount: number;
  /** Dollar amount added back as bonus */
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
  const bonusAmount = round2(requestedAmount * bonusPercent / 100);
  const finalAmount = round2(requestedAmount - feeAmount + bonusAmount);

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
