"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { EarningsSummary } from "@/components/earnings/EarningsSummary";
import { EarningsChart } from "@/components/earnings/EarningsChart";
import { EarningsFilters } from "@/components/earnings/EarningsFilters";
import { type EarningsFilterKey, type EarningsData } from "@/lib/earnings";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { DollarSign, ExternalLink } from "lucide-react";

export default function EarningsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin");
    }
  }, [session, userRole, router]);
  const [earnings, setEarnings] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [earningsFilters, setEarningsFilters] = useState<EarningsFilterKey[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<{ value: string; label: string }[]>([]);
  const [timeframeDays, setTimeframeDays] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return 15;
    return 30;
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback((campaignIds: string[], buildOptions = false) => {
    setLoading(true);
    const qs = campaignIds.length > 0 ? `?campaignIds=${campaignIds.join(",")}` : "";
    Promise.all([
      fetch(`/api/earnings${qs}`).then((r) => r.json()),
      fetch(`/api/clips/mine${qs}`).then((r) => r.json()),
    ])
      .then(([earningsData, clipsData]) => {
        const clipsArr = Array.isArray(clipsData) ? clipsData : [];
        setEarnings(earningsData);
        setClips(clipsArr);
        if (buildOptions) {
          const map = new Map<string, string>();
          for (const c of clipsArr) {
            if (c.campaignId && c.campaign?.name) {
              map.set(c.campaignId, c.campaign.name);
            }
          }
          setCampaignOptions(Array.from(map, ([value, label]) => ({ value, label })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initial fetch — builds campaign options from the full (unfiltered) clip list
  useEffect(() => {
    fetchData([], true);
  }, [fetchData]);
  useAutoRefresh(useCallback(() => fetchData(selectedCampaigns), [fetchData, selectedCampaigns]), 120000); // Fallback polling

  // SSE real-time: refresh when earnings change (debounced)
  const sseDebounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    const handler = () => {
      if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
      sseDebounceRef.current = setTimeout(() => fetchData(selectedCampaigns), 500);
    };
    window.addEventListener("sse:earnings_updated", handler);
    window.addEventListener("sse:clip_updated", handler);
    return () => {
      window.removeEventListener("sse:earnings_updated", handler);
      window.removeEventListener("sse:clip_updated", handler);
      if (sseDebounceRef.current) clearTimeout(sseDebounceRef.current);
    };
  }, [fetchData, selectedCampaigns]);

  // Re-fetch when campaign selection changes
  const handleCampaignChange = useCallback((values: string[]) => {
    setSelectedCampaigns(values);
    fetchData(values);
  }, [fetchData]);

  const timeFilteredClips = useMemo(() => filterByTimeframe(clips, timeframeDays), [clips, timeframeDays]);
  const clipsWithEarnings = useMemo(() => clips.filter((c: any) => c.earnings > 0), [clips]);

  const summary: EarningsData = useMemo(() => {
    if (!earnings) return { totalEarned: 0, approvedEarnings: 0, pendingEarnings: 0, paidOut: 0, lockedInPayouts: 0, available: 0 };
    // Compute earnings from timeframe-filtered clips
    const approvedInPeriod = timeFilteredClips
      .filter((c: any) => c.status === "APPROVED")
      .reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    const pendingInPeriod = timeFilteredClips
      .filter((c: any) => c.status === "PENDING")
      .reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    const totalInPeriod = approvedInPeriod + pendingInPeriod;
    return {
      totalEarned: Math.round(totalInPeriod * 100) / 100,
      approvedEarnings: Math.round(approvedInPeriod * 100) / 100,
      pendingEarnings: Math.round(pendingInPeriod * 100) / 100,
      // Payouts are all-time (not tied to clip submission date)
      paidOut: earnings.paidOut ?? 0,
      lockedInPayouts: earnings.lockedInPayouts ?? 0,
      available: earnings.available ?? 0,
    };
  }, [earnings, timeFilteredClips]);

  if (loading && !earnings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Earnings</h1>
            <p className="text-[15px] text-[var(--text-secondary)]">
              {selectedCampaigns.length > 0
                ? `Showing ${selectedCampaigns.length} campaign${selectedCampaigns.length > 1 ? "s" : ""}`
                : "Track your earnings across all clips."}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <MultiDropdown
            label="Campaign"
            options={campaignOptions}
            values={selectedCampaigns}
            onChange={handleCampaignChange}
            allLabel="All campaigns"
          />
        </div>
      </div>

      {/* ── Compact Summary ── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 text-center max-w-lg mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">Available for Payout</p>
        <p className="text-3xl sm:text-4xl font-bold text-accent tabular-nums">{formatCurrency(summary.available)}</p>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">All-time balance</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Earned</p>
          <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(summary.totalEarned)}</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Approved</p>
          <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(summary.approvedEarnings)}</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Paid Out</p>
          <p className="text-lg font-bold text-accent tabular-nums">{formatCurrency(summary.paidOut)}</p>
        </div>
      </div>
      {(summary.pendingEarnings > 0 || summary.lockedInPayouts > 0) && (
        <div className="flex flex-wrap gap-2">
          {summary.pendingEarnings > 0 && (
            <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400">
              {formatCurrency(summary.pendingEarnings)} pending review
            </span>
          )}
          {summary.lockedInPayouts > 0 && (
            <span className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-1.5 text-xs font-medium text-accent">
              {formatCurrency(summary.lockedInPayouts)} in payout queue
            </span>
          )}
        </div>
      )}

      {/* Earnings Chart */}
      <div>
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Earnings over time</h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
            <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
          </div>
        </div>
        <EarningsChart clips={timeFilteredClips} filters={earningsFilters} days={timeframeDays} />
      </div>

    </div>
  );
}
