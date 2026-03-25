"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { EarningsSummary } from "@/components/earnings/EarningsSummary";
import { EarningsChart } from "@/components/earnings/EarningsChart";
import { EarningsFilters } from "@/components/earnings/EarningsFilters";
import { computeEarningsSummary, type EarningsFilterKey } from "@/lib/earnings";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { DollarSign } from "lucide-react";

export default function EarningsPage() {
  const [earnings, setEarnings] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [allClips, setAllClips] = useState<any[]>([]);
  const [earningsFilters, setEarningsFilters] = useState<EarningsFilterKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/earnings").then((r) => r.json()),
      fetch("/api/clips/mine").then((r) => r.json()),
    ])
      .then(([earningsData, clipsData]) => {
        setEarnings(earningsData);
        setAllClips(Array.isArray(clipsData) ? clipsData : []);
        setClips(clipsData.filter((c: any) => c.earnings > 0));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const summary = computeEarningsSummary(earnings || {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Earnings</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Track your earnings across all clips.</p>
      </div>

      <EarningsSummary data={summary} />

      {/* Earnings Chart */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Earnings over time</h2>
          <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
        </div>
        <EarningsChart clips={allClips} filters={earningsFilters} />
      </div>

      {/* Earnings by Clip */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Earnings by clip</h2>
        {clips.length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-10 w-10" />}
            title="No earnings yet"
            description="Your earnings will appear here once clips are approved and tracked."
          />
        ) : (
          <div className="space-y-2">
            {clips.map((clip: any) => (
              <Card key={clip.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{clip.campaign?.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {clip.clipAccount?.username} · {formatRelative(clip.createdAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-400">{formatCurrency(clip.earnings)}</p>
                  <Badge variant={clip.status.toLowerCase() as any} className="mt-1">{clip.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
