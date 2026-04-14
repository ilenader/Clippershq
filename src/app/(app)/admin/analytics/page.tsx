"use client";

import { useEffect, useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { SimpleLineChart, SimpleMultiLineChart } from "@/components/ui/simple-chart";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { TrendingUp, Eye, Users, Film, Megaphone, Heart, CheckCircle, Clock, DollarSign } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";

type MetricKey = "views" | "likes" | "comments" | "shares" | "earnings";

function buildDailyChart(items: any[], days: number): { label: string; value: number }[] {
  const now = new Date();
  const map: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
  }
  for (const item of items) {
    if (!item.createdAt) continue;
    const d = new Date(item.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in map) map[key]++;
  }
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function buildMetricByDay(clips: any[], days: number, metric: MetricKey): { label: string; value: number }[] {
  const now = new Date();
  const map: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
  }
  for (const clip of clips) {
    if (!clip.createdAt) continue;
    const d = new Date(clip.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in map) {
      const stat = clip.stats?.[0];
      map[key] += stat?.[metric] || 0;
    }
  }
  return Object.entries(map).map(([label, value]) => ({ label, value }));
}

function buildEarningsByDay(clips: any[], days: number): { label: string; value: number }[] {
  const now = new Date();
  const map: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
  }
  for (const clip of clips) {
    if (!clip.createdAt) continue;
    const d = new Date(clip.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (key in map) {
      map[key] += clip.earnings || 0;
    }
  }
  return Object.entries(map).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}

function buildPlatformDist(accounts: any[]): { name: string; count: number; percent: number }[] {
  const counts: Record<string, number> = {};
  for (const a of accounts) counts[a.platform || "Other"] = (counts[a.platform || "Other"] || 0) + 1;
  const total = accounts.length || 1;
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function buildPlatformViewDist(clips: any[]): { name: string; clips: number; views: number; viewPercent: number }[] {
  const data: Record<string, { clips: number; views: number }> = {};
  for (const clip of clips) {
    const platform = clip.clipAccount?.platform || clip.campaign?.platform?.split(",")[0]?.trim() || "Other";
    if (!data[platform]) data[platform] = { clips: 0, views: 0 };
    data[platform].clips++;
    data[platform].views += clip.stats?.[0]?.views || 0;
  }
  const totalViews = Object.values(data).reduce((s, d) => s + d.views, 0) || 1;
  return Object.entries(data)
    .map(([name, d]) => ({
      name,
      clips: d.clips,
      views: d.views,
      viewPercent: Math.round((d.views / totalViews) * 1000) / 10,
    }))
    .sort((a, b) => b.views - a.views);
}

const metricOptions = [
  { value: "views", label: "Views" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "shares", label: "Shares" },
  { value: "earnings", label: "Earnings" },
];

const metricColors: Record<string, string> = {
  views: "#2596be",
  likes: "#f43f5e",
  comments: "#8b5cf6",
  shares: "#f59e0b",
  earnings: "#2596be",
};

export default function AdminAnalyticsPage() {
  const [allCampaigns, setAllCampaigns] = useState<any[]>([]);
  const [allClips, setAllClips] = useState<any[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [spendByCampaign, setSpendByCampaign] = useState<Record<string, number>>({});
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["views"]);
  const [clipStatusFilter, setClipStatusFilter] = useState("APPROVED");
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const statusDropRef = useRef<HTMLDivElement>(null);
  const [timeframeDays, setTimeframeDays] = useState(30);
  useEffect(() => { if (window.innerWidth < 1024) setTimeframeDays(15); }, []);
  const [leftChartMode, setLeftChartMode] = useState<"clips" | "earnings">("clips");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
      fetch("/api/clips").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()).catch(() => []),
      fetch("/api/campaigns/spend").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([campaigns, clips, accounts, spend]) => {
        setAllCampaigns(Array.isArray(campaigns) ? campaigns : []);
        setAllClips(Array.isArray(clips) ? clips : []);
        setAllAccounts(Array.isArray(accounts) ? accounts : []);
        setSpendByCampaign(typeof spend === "object" && spend !== null ? spend : {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusDropRef.current && !statusDropRef.current.contains(e.target as Node)) setStatusDropOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const statusOptions = [
    { value: "APPROVED", label: "Approved only" },
    { value: "REJECTED", label: "Rejected only" },
    { value: "APPROVED_REJECTED", label: "Approved + Rejected" },
    { value: "ALL", label: "All clips" },
  ];

  const campaignFilteredClips = selectedCampaigns.length > 0
    ? allClips.filter((c: any) => selectedCampaigns.includes(c.campaignId))
    : allClips;
  const statusFilteredClips = clipStatusFilter === "ALL"
    ? campaignFilteredClips
    : clipStatusFilter === "APPROVED_REJECTED"
    ? campaignFilteredClips.filter((c: any) => c.status === "APPROVED" || c.status === "REJECTED")
    : campaignFilteredClips.filter((c: any) => c.status === clipStatusFilter);
  const filteredClips = filterByTimeframe(statusFilteredClips, timeframeDays);

  // Active clippers: all-time (not filtered by timeframe)
  const allCampaignFilteredClips = selectedCampaigns.length > 0
    ? allClips.filter((c: any) => selectedCampaigns.includes(c.campaignId))
    : allClips;
  const uniqueClippers = new Set(allCampaignFilteredClips.map((c: any) => c.userId).filter(Boolean));
  const totalViews = filteredClips.reduce((sum: number, c: any) => sum + (c.stats?.[0]?.views || 0), 0);
  const totalLikes = filteredClips.reduce((sum: number, c: any) => sum + (c.stats?.[0]?.likes || 0), 0);
  const activeCampaigns = allCampaigns.filter((c: any) => c.status === "ACTIVE");
  const displayedCampaigns = selectedCampaigns.length > 0
    ? allCampaigns.filter((c: any) => selectedCampaigns.includes(c.id))
    : activeCampaigns;
  const withCpm = displayedCampaigns.filter((c: any) => (c.clipperCpm ?? c.cpmRate) > 0);
  const avgCpm = withCpm.length > 0 ? withCpm.reduce((s: number, c: any) => s + (c.clipperCpm ?? c.cpmRate ?? 0), 0) / withCpm.length : 0;
  const approvedClips = filteredClips.filter((c: any) => c.status === "APPROVED").length;
  const pendingClips = filteredClips.filter((c: any) => c.status === "PENDING").length;
  // Total earnings: sum of approved clip earnings within timeframe
  const totalEarnings = filteredClips
    .filter((c: any) => c.status === "APPROVED")
    .reduce((s: number, c: any) => s + (c.earnings || 0), 0);

  const clipsPerDay = buildDailyChart(filteredClips, timeframeDays);
  const platformDist = buildPlatformDist(allAccounts);
  const platformViewDist = buildPlatformViewDist(filteredClips);
  const campaignOptions = allCampaigns.map((c: any) => ({ value: c.id, label: c.name }));

  const activeMetrics = selectedMetrics.length > 0 ? selectedMetrics : ["views"];

  // Build series for multi-line chart
  const chartSeries = activeMetrics.map((m) => ({
    label: metricOptions.find((o) => o.value === m)?.label || m,
    data: m === "earnings"
      ? buildEarningsByDay(filteredClips, timeframeDays)
      : buildMetricByDay(filteredClips, timeframeDays, m as MetricKey),
    color: metricColors[m] || "#2596be",
  }));

  // Build left chart data
  const leftChartData = leftChartMode === "earnings"
    ? buildEarningsByDay(filteredClips, timeframeDays)
    : clipsPerDay;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analytics</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          {selectedCampaigns.length > 0
            ? `Filtered by ${selectedCampaigns.length} campaign${selectedCampaigns.length > 1 ? "s" : ""}`
            : "All campaigns"}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
        <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={setSelectedCampaigns} allLabel="All campaigns" />
        <MultiDropdown label="Metrics" options={metricOptions} values={selectedMetrics} onChange={setSelectedMetrics} allLabel="All metrics" />
        <div className="relative" ref={statusDropRef}>
          <button
            onClick={() => setStatusDropOpen(!statusDropOpen)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
          >
            <span className="text-[var(--text-muted)]">Status:</span>
            {statusOptions.find((o) => o.value === clipStatusFilter)?.label || "All"}
            <svg className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${statusDropOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {statusDropOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] sm:min-w-[220px] max-w-[85vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-elevated)]">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setClipStatusFilter(opt.value); setStatusDropOpen(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer ${
                    clipStatusFilter === opt.value ? "text-accent bg-accent/5" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <div className={`h-3.5 w-3.5 rounded border transition-colors ${
                    clipStatusFilter === opt.value
                      ? "border-accent bg-accent"
                      : "border-[var(--border-color)]"
                  }`}>
                    {clipStatusFilter === opt.value && (
                      <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
                    )}
                  </div>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active campaigns", value: activeCampaigns.length, icon: <Megaphone className="h-5 w-5" />, color: "text-accent" },
          { label: "Total clips", value: filteredClips.length, icon: <Film className="h-5 w-5" />, color: "text-accent" },
          { label: "Active clippers", value: uniqueClippers.size, icon: <Users className="h-5 w-5" />, color: "text-accent" },
          { label: "Approved clips", value: approvedClips, icon: <CheckCircle className="h-5 w-5" />, color: "text-accent" },
          { label: "Pending clips", value: pendingClips, icon: <Clock className="h-5 w-5" />, color: "text-accent" },
          { label: "Total views", value: formatNumber(totalViews), icon: <Eye className="h-5 w-5" />, color: "text-accent" },
          { label: "Total earnings", value: formatCurrency(totalEarnings), icon: <DollarSign className="h-5 w-5" />, color: "text-accent" },
          { label: "Total likes", value: formatNumber(totalLikes), icon: <Heart className="h-5 w-5" />, color: "text-accent" },
          { label: "Avg. CPM", value: avgCpm > 0 ? formatCurrency(avgCpm) : "$0", icon: <TrendingUp className="h-5 w-5" />, color: "text-accent" },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</p>
              <span className={stat.color}>{stat.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-1.5">
            {(["clips", "earnings"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLeftChartMode(mode)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  leftChartMode === mode
                    ? "bg-accent text-white"
                    : "border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                }`}
              >
                {mode === "clips" ? "Clips" : "Earnings"}
              </button>
            ))}
          </div>
          <SimpleLineChart
            data={leftChartData}
            title={leftChartMode === "earnings" ? "Earnings per day" : "Clips submitted per day"}
            color="#2596be"
            height={200}
            valueSuffix={leftChartMode === "earnings" ? "" : " clips"}
          />
          {filteredClips.length === 0 && <p className="mt-3 text-sm text-[var(--text-muted)]">No clips submitted yet.</p>}
        </Card>
        <Card>
          <SimpleMultiLineChart
            series={chartSeries}
            title="Metrics by clip submission date"
            height={200}
          />
          {filteredClips.length === 0 && <p className="mt-3 text-sm text-[var(--text-muted)]">No data yet.</p>}
        </Card>
      </div>

      {/* Platform Distribution */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-[15px] font-semibold text-[var(--text-primary)]">Platform: accounts</h3>
          {platformDist.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No accounts submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {platformDist.map((platform) => (
                <div key={platform.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-[var(--text-primary)] font-medium">{platform.name}</span>
                    <span className="text-[var(--text-muted)] tabular-nums">{platform.count} account{platform.count !== 1 ? "s" : ""} · {platform.percent}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-input)]">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.max(platform.percent, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <h3 className="mb-4 text-[15px] font-semibold text-[var(--text-primary)]">Platform: views & clips</h3>
          {platformViewDist.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No clips submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {platformViewDist.map((p) => (
                <div key={p.name}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-[var(--text-primary)] font-medium">{p.name}</span>
                    <span className="text-[var(--text-muted)] tabular-nums">
                      {p.clips} clip{p.clips !== 1 ? "s" : ""} · {formatNumber(p.views)} views · {p.viewPercent}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-input)]">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.max(p.viewPercent, 2)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
