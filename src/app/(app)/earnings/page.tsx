"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
  const [timeframeDays, setTimeframeDays] = useState(15);
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

  // SSE real-time: refresh when earnings change
  useEffect(() => {
    const handler = () => { fetchData(selectedCampaigns); };
    window.addEventListener("sse:earnings_updated", handler);
    window.addEventListener("sse:clip_updated", handler);
    return () => {
      window.removeEventListener("sse:earnings_updated", handler);
      window.removeEventListener("sse:clip_updated", handler);
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
    return {
      totalEarned: earnings.totalEarned ?? 0,
      approvedEarnings: earnings.approvedEarnings ?? 0,
      pendingEarnings: earnings.pendingEarnings ?? 0,
      paidOut: earnings.paidOut ?? 0,
      lockedInPayouts: earnings.lockedInPayouts ?? 0,
      available: earnings.available ?? 0,
    };
  }, [earnings]);

  if (loading && !earnings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            options={campaignOptions.length > 0 ? campaignOptions : [{ value: "milenko", label: "milenko" }, { value: "dusan-ristic", label: "Dusan Ristic" }]}
            values={selectedCampaigns}
            onChange={handleCampaignChange}
            allLabel="All campaigns"
          />
        </div>
      </div>

      <EarningsSummary data={summary} />

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

      {/* Earnings by Clip */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Earnings by clip</h2>
        {clipsWithEarnings.length === 0 ? (
          <EmptyState
            icon={<DollarSign className="h-10 w-10" />}
            title="No earnings yet"
            description="Your earnings will appear here once clips are approved and tracked."
          />
        ) : (
          <div className="space-y-2">
            {clipsWithEarnings.map((clip: any) => (
              <Card key={clip.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{clip.campaign?.name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {clip.clipAccount?.username} · {formatRelative(clip.createdAt)}
                  </p>
                </div>
                {clip.clipUrl && (
                  <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline whitespace-nowrap flex-shrink-0">
                    <ExternalLink className="h-3 w-3" /> Open clip
                  </a>
                )}
                <div className="text-right flex-shrink-0">
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
