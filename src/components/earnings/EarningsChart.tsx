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
}

export function EarningsChart({
  clips,
  filters,
  days = 14,
  height = 220,
  showEmptyMessage = true,
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
      />
      {!hasEarnings && showEmptyMessage && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          No earnings yet. Earnings appear as clips get views.
        </p>
      )}
    </Card>
  );
}
