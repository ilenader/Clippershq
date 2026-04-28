"use client";

import { Card } from "@/components/ui/card";
import { AreaGradientChart } from "@/components/ui/area-gradient-chart";
import { buildEarningsChart, type Clip, type EarningsFilterKey } from "@/lib/earnings";

interface EarningsChartProps {
  clips: Clip[];
  filters: EarningsFilterKey[];
  /** Number of trailing days (default 14) */
  days?: number;
  /** Chart height in px (default 220) */
  height?: number;
  /** Show empty message when no earnings */
  showEmptyMessage?: boolean;
  /**
   * Phase 6e — when the user has marketplace creator income but no clips of
   * their own, the default "no earnings yet" copy is misleading. The user
   * DOES have earnings — they're shown in the marketplace creator card above
   * this chart. The chart itself only plots per-clip-day earnings, which is
   * still empty for a creator-only user. This flag swaps in honest copy.
   */
  hasMarketplaceCreatorEarnings?: boolean;
}

export function EarningsChart({
  clips,
  filters,
  days = 14,
  height = 220,
  showEmptyMessage = true,
  hasMarketplaceCreatorEarnings = false,
}: EarningsChartProps) {
  const data = buildEarningsChart(clips, days, filters);
  const hasEarnings = clips.some((c) => c.status === "APPROVED" && c.earnings > 0);

  return (
    <Card>
      <AreaGradientChart
        data={data}
        title="Daily earnings"
        color="#2596be"
        height={height}
        valuePrefix="$"
        label="Earnings"
      />
      {!hasEarnings && showEmptyMessage && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {hasMarketplaceCreatorEarnings
            ? "Your marketplace creator earnings are shown above. Submit your own clips to add per-day earnings to this chart."
            : "No earnings yet. Earnings appear as clips get views."}
        </p>
      )}
    </Card>
  );
}
