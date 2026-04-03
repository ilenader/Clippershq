/**
 * Earnings logic — pure functions, no dependencies on UI framework.
 * Can be imported into any project.
 */

export interface Clip {
  id: string;
  createdAt: string;
  earnings: number;
  status: string;
  campaign?: { name: string } | null;
  clipAccount?: { username: string; platform: string } | null;
}

export interface EarningsData {
  totalEarned: number;
  approvedEarnings: number;
  pendingEarnings: number;
  paidOut: number;
  lockedInPayouts: number;
  available: number;
}

export interface EarningsChartPoint {
  label: string;
  value: number;
}

export type EarningsFilterKey = "total" | "approved" | "pending";

export const EARNINGS_FILTER_OPTIONS: { value: EarningsFilterKey; label: string }[] = [
  { value: "total", label: "Total earned" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
];

/**
 * Build a day-by-day earnings chart from a list of clips.
 * @param clips - Array of clip objects with createdAt, earnings, and status
 * @param days - Number of trailing days to include (default 14)
 * @param filters - Which earnings categories to include. Empty or ["total"] = all.
 */
export function buildEarningsChart(
  clips: Clip[],
  days: number = 14,
  filters: EarningsFilterKey[] = []
): EarningsChartPoint[] {
  const now = new Date();
  const map: Record<string, number> = {};

  // Initialize all days with 0
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
  }

  // Determine which statuses to include
  // Default (no filter or "total"): only APPROVED — consistent with "Total earnings" card
  // "approved": only APPROVED
  // "pending": only PENDING
  const activeFilters = filters.length === 0 ? ["approved"] : filters;
  const includeApproved = activeFilters.includes("total") || activeFilters.includes("approved");
  const includePending = activeFilters.includes("pending");

  for (const clip of clips) {
    if (!clip.createdAt || !clip.earnings) continue;

    // Only count clips whose status matches the selected filters
    if (clip.status === "APPROVED" && !includeApproved) continue;
    if (clip.status === "PENDING" && !includePending) continue;
    // REJECTED / FLAGGED / other statuses are NEVER included
    if (clip.status !== "APPROVED" && clip.status !== "PENDING") continue;

    const d = new Date(clip.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in map) {
      map[key] += clip.earnings;
    }
  }

  return Object.entries(map).map(([label, value]) => ({
    label,
    value: parseFloat(value.toFixed(2)),
  }));
}

/**
 * Compute earnings summary from raw API data.
 */
export function computeEarningsSummary(data: Partial<EarningsData>): EarningsData {
  return {
    totalEarned: data.totalEarned ?? 0,
    approvedEarnings: data.approvedEarnings ?? 0,
    pendingEarnings: data.pendingEarnings ?? 0,
    paidOut: data.paidOut ?? 0,
    lockedInPayouts: data.lockedInPayouts ?? 0,
    available: data.available ?? 0,
  };
}
