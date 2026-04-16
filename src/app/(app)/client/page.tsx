"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TimeframeSelect } from "@/components/ui/timeframe-select";
import {
  Megaphone, Eye, Film, Heart, MessageCircle, Share2, TrendingUp,
  Trophy, Download, ChevronDown, ChevronRight, ExternalLink, DollarSign,
} from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

function PlatformDot({ platform }: { platform: string }) {
  return <span className="inline-block h-2 w-2 rounded-full bg-accent flex-shrink-0" title={platform} />;
}

function PlatformBadges({ platform }: { platform: string }) {
  const platforms = (platform || "").split(",").map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex items-center gap-1.5">
      {platforms.map((p) => (
        <span key={p} className="inline-flex items-center gap-1 rounded-md bg-accent/10 border border-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
          <PlatformDot platform={p} /> {p}
        </span>
      ))}
    </div>
  );
}

function StatusColor(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
  if (s === "PAUSED") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
  return "bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-subtle)]";
}

export default function ClientDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role;

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [timeframeDays, setTimeframeDays] = useState(0);

  useEffect(() => {
    if (session && userRole && userRole !== "CLIENT" && userRole !== "OWNER") {
      router.replace("/dashboard");
    }
  }, [session, userRole, router]);

  // Load campaign list
  const loadCampaigns = useCallback(() => {
    fetch(`/api/client/campaigns?_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCampaigns(list);
        if (list.length > 0 && !selectedId) {
          setSelectedId(list[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Load campaign detail
  const loadDetail = useCallback(() => {
    if (!selectedId) return;
    fetch(`/api/client/campaigns/${selectedId}?_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!d.error) setDetail(d); })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      setDetailLoading(true);
      loadDetail();
    }
  }, [selectedId, loadDetail]);

  // Auto-refresh both list + detail every 30s
  const refresh = useCallback(() => {
    loadCampaigns();
    loadDetail();
  }, [loadCampaigns, loadDetail]);
  useAutoRefresh(refresh, 30000);

  const selectedCampaign = campaigns.find((c) => c.id === selectedId);

  // Export handler
  const handleExport = async () => {
    if (!selectedId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/client/export?campaignId=${selectedId}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `campaign-report-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success("Report downloaded!");
    } catch { toast.error("Export failed"); }
    setExporting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="py-20">
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns assigned"
          description="You don't have any campaigns assigned yet. Contact the team for access."
        />
      </div>
    );
  }

  const campaign = detail?.campaign || selectedCampaign;
  const summary = detail?.summary; // Always all-time (from API) — used for budget, views, clips, avg
  const allClips = detail?.clips || [];
  const allDailyBreakdown = detail?.dailyBreakdown || [];

  // Build local-date ISO (YYYY-MM-DD) without UTC shift
  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const isAllTime = timeframeDays === 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - (timeframeDays - 1));
  const cutoffIso = toLocalIso(cutoff);

  // Filter clips and daily breakdown by timeframe (no filter when All)
  const filteredClips = isAllTime
    ? allClips
    : allClips.filter((c: any) => c.submitted && toLocalIso(new Date(c.submitted)) >= cutoffIso);
  const filteredDailyBreakdown = isAllTime
    ? allDailyBreakdown
    : allDailyBreakdown.filter((d: any) => d.date && d.date >= cutoffIso);

  // Engagement totals (likes/comments/shares/topViews) reflect the filtered timeframe
  const approvedFiltered = filteredClips.filter((c: any) => c.status === "APPROVED");
  const engagement = {
    totalLikes: approvedFiltered.reduce((s: number, c: any) => s + (c.likes || 0), 0),
    totalComments: approvedFiltered.reduce((s: number, c: any) => s + (c.comments || 0), 0),
    totalShares: approvedFiltered.reduce((s: number, c: any) => s + (c.shares || 0), 0),
    topViews: approvedFiltered.reduce((max: number, c: any) => Math.max(max, c.views || 0), 0),
  };

  // Sort clips by views descending
  const sortedClips = [...filteredClips].sort((a: any, b: any) => (b.views || 0) - (a.views || 0));
  const displayClips = sortedClips.slice(0, 50);
  const hasMoreClips = sortedClips.length > 50;

  // Chart data: when All, show raw daily breakdown; else fill every day in range so gaps show as zeros
  let chartData: { date: string; views: number }[];
  if (isAllTime) {
    chartData = allDailyBreakdown.map((d: any) => ({
      date: (d.date || "").slice(5),
      views: d.views || 0,
    }));
  } else {
    const byDate = new Map<string, any>(filteredDailyBreakdown.map((d: any) => [d.date, d]));
    chartData = [];
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = toLocalIso(d);
      const entry = byDate.get(iso);
      chartData.push({ date: iso.slice(5), views: entry?.views || 0 });
    }
  }

  // Daily totals for filtered breakdown
  const dailyTotals = filteredDailyBreakdown.reduce(
    (acc: any, d: any) => ({
      clips: acc.clips + (d.clips || 0),
      views: acc.views + (d.views || 0),
      likes: acc.likes + (d.likes || 0),
      comments: acc.comments + (d.comments || 0),
      shares: acc.shares + (d.shares || 0),
    }),
    { clips: 0, views: 0, likes: 0, comments: 0, shares: 0 },
  );

  return (
    <div className="space-y-6">
      {/* ─── A) HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-1">Clippers HQ</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] truncate">
              {campaign?.name || "Campaign"}
            </h1>
            {campaign?.status && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${StatusColor(campaign.status)}`}>
                {campaign.status}
              </span>
            )}
          </div>
          {campaign?.platform && <div className="mt-2"><PlatformBadges platform={campaign.platform} /></div>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Campaign selector */}
          {campaigns.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3.5 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
              >
                <span className="max-w-[140px] truncate">{campaign?.name || "Select"}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-elevated)] overflow-hidden">
                  {campaigns.map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedId(c.id); setDropdownOpen(false); }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] ${c.id === selectedId ? "text-accent font-medium" : "text-[var(--text-secondary)]"}`}
                    >
                      <p className="truncate">{c.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{c.platform}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            variant="outline"
            loading={exporting}
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            Export
          </Button>
        </div>
      </div>

      {/* Detail loading state */}
      {detailLoading && !detail && (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      )}

      {detail && (
        <>
          {/* ─── B) KEY METRICS ─── */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {/* Budget card */}
            <Card className="col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Budget</p>
                <DollarSign className="h-5 w-5 text-accent" />
              </div>
              <p className="text-2xl font-bold text-accent tabular-nums">
                {formatCurrency(summary?.totalSpent || 0)}
              </p>
              {campaign?.budget != null && campaign.budget > 0 && (
                <>
                  <p className="text-xs text-[var(--text-muted)] mt-1">of {formatCurrency(campaign.budget)} budget</p>
                  <div className="mt-2 h-2 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.min(((summary?.totalSpent || 0) / campaign.budget) * 100, 100)}%` }}
                    />
                  </div>
                </>
              )}
            </Card>

            {/* Views */}
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</p>
                <Eye className="h-5 w-5 text-accent" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)] tabular-nums">{formatNumber(summary?.totalViews || 0)}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">total views</p>
            </Card>

            {/* Approved clips */}
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clips</p>
                <Film className="h-5 w-5 text-accent" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)] tabular-nums">{summary?.approvedClips || 0}</p>
              {(summary?.pendingClips || 0) > 0 && (
                <p className="text-xs text-amber-400 mt-0.5">{summary.pendingClips} pending</p>
              )}
              {(summary?.pendingClips || 0) === 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5">approved</p>
              )}
            </Card>

            {/* Avg views */}
            <Card>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Avg Views</p>
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)] tabular-nums">{formatNumber(summary?.avgViewsPerClip || 0)}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">per clip</p>
            </Card>
          </div>

          {/* ─── C) ENGAGEMENT ROW (timeframe-filtered) ─── */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Likes", value: engagement.totalLikes, icon: <Heart className="h-4 w-4" /> },
              { label: "Comments", value: engagement.totalComments, icon: <MessageCircle className="h-4 w-4" /> },
              { label: "Shares", value: engagement.totalShares, icon: <Share2 className="h-4 w-4" /> },
              { label: "Top Clip", value: engagement.topViews, icon: <Trophy className="h-4 w-4" /> },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</p>
                  <span className="text-accent">{stat.icon}</span>
                </div>
                <p className="mt-1 text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatNumber(stat.value)}</p>
              </div>
            ))}
          </div>

          {/* ─── D) VIEWS CHART ─── */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Views Over Time</h3>
              <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} includeAll />
            </div>
            {chartData.some((d) => d.views > 0) ? (
              <div className="h-[220px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2596be" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#2596be" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "8px", color: "var(--text-primary)" }}
                      labelStyle={{ color: "var(--text-muted)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="#2596be"
                      strokeWidth={2}
                      fill="url(#viewsGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: "#2596be", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] sm:h-[260px] flex items-center justify-center">
                <p className="text-sm text-[var(--text-muted)]">No views data yet</p>
              </div>
            )}
          </Card>

          {/* ─── E) CLIP PERFORMANCE TABLE ─── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Clip Performance</h3>
              {hasMoreClips && <p className="text-[10px] text-[var(--text-muted)]">Showing top 50 of {sortedClips.length} clips</p>}
            </div>
            {displayClips.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No clips submitted yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:-mx-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">#</th>
                      <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Platform</th>
                      <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                      <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</th>
                      <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">Likes</th>
                      <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden md:table-cell">Comments</th>
                      <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden md:table-cell">Shares</th>
                      <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Earnings</th>
                      <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayClips.map((clip: any, i: number) => (
                      <tr key={i} className={`border-b border-[var(--border-subtle)] ${i % 2 === 1 ? "bg-[var(--bg-secondary)]" : ""}`}>
                        <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <PlatformDot platform={clip.platform} />
                            <span className="text-[var(--text-secondary)] text-xs">{clip.platform}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-[var(--text-primary)] tabular-nums">{formatNumber(clip.views)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden sm:table-cell">{formatNumber(clip.likes)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden md:table-cell">{formatNumber(clip.comments)}</td>
                        <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden md:table-cell">{formatNumber(clip.shares)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-accent tabular-nums">{clip.earnings > 0 ? formatCurrency(clip.earnings) : "\u2014"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <a href={clip.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                            <ExternalLink className="h-3 w-3" /> View
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ─── F) DAILY BREAKDOWN (collapsible) ─── */}
          {filteredDailyBreakdown.length > 0 && (
            <Card>
              <button
                onClick={() => setDailyOpen(!dailyOpen)}
                className="flex items-center justify-between w-full text-left cursor-pointer"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Daily Breakdown</h3>
                {dailyOpen
                  ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                  : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                }
              </button>
              {dailyOpen && (
                <div className="overflow-x-auto -mx-4 sm:-mx-5 mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-color)]">
                        <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                        <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clips</th>
                        <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</th>
                        <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">Likes</th>
                        <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden sm:table-cell">Comments</th>
                        <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] hidden md:table-cell">Shares</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDailyBreakdown.map((day: any, i: number) => (
                        <tr key={day.date} className={`border-b border-[var(--border-subtle)] ${i % 2 === 1 ? "bg-[var(--bg-secondary)]" : ""}`}>
                          <td className="px-4 py-2.5 text-[var(--text-secondary)]">{day.date}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-primary)] tabular-nums">{day.clips}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-primary)] tabular-nums">{formatNumber(day.views)}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden sm:table-cell">{formatNumber(day.likes)}</td>
                          <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden sm:table-cell">{formatNumber(day.comments)}</td>
                          <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] tabular-nums hidden md:table-cell">{formatNumber(day.shares)}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="border-t-2 border-[var(--border-color)]">
                        <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">Total</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">{dailyTotals.clips}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">{formatNumber(dailyTotals.views)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--text-secondary)] tabular-nums hidden sm:table-cell">{formatNumber(dailyTotals.likes)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-[var(--text-secondary)] tabular-nums hidden sm:table-cell">{formatNumber(dailyTotals.comments)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-[var(--text-secondary)] tabular-nums hidden md:table-cell">{formatNumber(dailyTotals.shares)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
