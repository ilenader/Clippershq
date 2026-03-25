"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { SimpleLineChart, SimpleMultiLineChart } from "@/components/ui/simple-chart";
import { TrendingUp, Eye, Users, Film, Megaphone, UserCircle, Calendar, Heart } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";

type MetricKey = "views" | "likes" | "comments" | "shares";

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

function buildPlatformDist(accounts: any[]): { name: string; count: number; percent: number }[] {
  const counts: Record<string, number> = {};
  for (const a of accounts) counts[a.platform || "Other"] = (counts[a.platform || "Other"] || 0) + 1;
  const total = accounts.length || 1;
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

const metricOptions = [
  { value: "views", label: "Views" },
  { value: "likes", label: "Likes" },
  { value: "comments", label: "Comments" },
  { value: "shares", label: "Shares" },
];

const metricColors: Record<string, string> = {
  views: "#2596be",
  likes: "#f43f5e",
  comments: "#8b5cf6",
  shares: "#f59e0b",
};

export default function AdminAnalyticsPage() {
  const [allCampaigns, setAllCampaigns] = useState<any[]>([]);
  const [allClips, setAllClips] = useState<any[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["views"]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
      fetch("/api/clips").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()).catch(() => []),
    ])
      .then(([campaigns, clips, accounts]) => {
        setAllCampaigns(Array.isArray(campaigns) ? campaigns : []);
        setAllClips(Array.isArray(clips) ? clips : []);
        setAllAccounts(Array.isArray(accounts) ? accounts : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredClips = selectedCampaigns.length > 0
    ? allClips.filter((c: any) => selectedCampaigns.includes(c.campaignId))
    : allClips;

  const uniqueClippers = new Set(filteredClips.map((c: any) => c.userId).filter(Boolean));
  const totalViews = filteredClips.reduce((sum: number, c: any) => sum + (c.stats?.[0]?.views || 0), 0);
  const totalLikes = filteredClips.reduce((sum: number, c: any) => sum + (c.stats?.[0]?.likes || 0), 0);
  const activeCampaigns = allCampaigns.filter((c: any) => c.status === "ACTIVE");
  const withCpm = activeCampaigns.filter((c: any) => c.cpmRate > 0);
  const avgCpm = withCpm.length > 0 ? withCpm.reduce((s: number, c: any) => s + c.cpmRate, 0) / withCpm.length : 0;
  const approvedAccounts = allAccounts.filter((a: any) => a.status === "APPROVED").length;
  const clipsToday = filteredClips.filter((c: any) => c.createdAt && isToday(c.createdAt)).length;

  const clipsPerDay = buildDailyChart(filteredClips, 14);
  const platformDist = buildPlatformDist(allAccounts);
  const campaignOptions = allCampaigns.map((c: any) => ({ value: c.id, label: c.name }));

  const activeMetrics = selectedMetrics.length > 0 ? selectedMetrics : ["views"];

  // Build series for multi-line chart
  const chartSeries = activeMetrics.map((m) => ({
    label: metricOptions.find((o) => o.value === m)?.label || m,
    data: buildMetricByDay(filteredClips, 14, m as MetricKey),
    color: metricColors[m] || "#2596be",
  }));

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
        <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={setSelectedCampaigns} allLabel="All campaigns" />
        <MultiDropdown label="Metrics" options={metricOptions} values={selectedMetrics} onChange={setSelectedMetrics} allLabel="All metrics" />
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active campaigns", value: activeCampaigns.length, icon: <Megaphone className="h-5 w-5" />, color: "text-accent" },
          { label: "Approved accounts", value: approvedAccounts, icon: <UserCircle className="h-5 w-5" />, color: "text-accent" },
          { label: "Total clips", value: filteredClips.length, icon: <Film className="h-5 w-5" />, color: "text-accent" },
          { label: "Clips today", value: clipsToday, icon: <Calendar className="h-5 w-5" />, color: "text-accent" },
          { label: "Total views", value: formatNumber(totalViews), icon: <Eye className="h-5 w-5" />, color: "text-[var(--text-muted)]" },
          { label: "Total likes", value: formatNumber(totalLikes), icon: <Heart className="h-5 w-5" />, color: "text-[var(--text-muted)]" },
          { label: "Active clippers", value: uniqueClippers.size, icon: <Users className="h-5 w-5" />, color: "text-[var(--text-muted)]" },
          { label: "Avg. CPM", value: avgCpm > 0 ? formatCurrency(avgCpm) : "0", icon: <TrendingUp className="h-5 w-5" />, color: "text-[var(--text-muted)]" },
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
          <SimpleLineChart data={clipsPerDay} title="Clips submitted per day" color="#2596be" height={200} valueSuffix=" clips" />
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
      <Card>
        <h3 className="mb-4 text-[15px] font-semibold text-[var(--text-primary)]">Platform distribution</h3>
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
    </div>
  );
}
