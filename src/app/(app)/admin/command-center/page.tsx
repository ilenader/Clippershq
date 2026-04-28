"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import {
  Activity, AlertTriangle, Clock, DollarSign, Film, Flag,
  Gauge, HelpCircle, Megaphone, Target, TrendingUp, Users, Zap,
  // Phase 8 — marketplace section icons
  Store, RefreshCw, CheckCircle2, XCircle, Send, Ban, Star,
  Trash2, RotateCcw, Settings, ShoppingBag,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
// Phase 8 — reuse existing chart primitives (no new chart components)
import { DonutChart } from "@/components/ui/donut-chart";
import { SimpleBarChart } from "@/components/ui/simple-chart";
import { AreaGradientChart } from "@/components/ui/area-gradient-chart";

// ─── Date-range presets ────────────────────────────────────

type PresetKey = "today" | "yesterday" | "7d" | "30d" | "thisMonth" | "lastMonth" | "all" | "custom";

function computeRange(preset: PresetKey, custom?: { from: string; to: string }): { from: Date; to: Date } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  if (preset === "today") return { from: start, to: now };
  if (preset === "yesterday") {
    const y = new Date(start); y.setDate(y.getDate() - 1);
    const end = new Date(start.getTime() - 1);
    return { from: y, to: end };
  }
  if (preset === "7d") return { from: new Date(now.getTime() - 7 * 86_400_000), to: now };
  if (preset === "30d") return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
  if (preset === "thisMonth") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (preset === "lastMonth") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: first, to: last };
  }
  if (preset === "all") return { from: new Date("2020-01-01"), to: now };
  if (preset === "custom" && custom?.from && custom?.to) {
    return { from: new Date(custom.from), to: new Date(custom.to) };
  }
  return { from: new Date(now.getTime() - 30 * 86_400_000), to: now };
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

// ─── Formatters ────────────────────────────────────────────

/** Human-readable duration. 45s / 12 min / 2h 15min / 1d 6h. */
function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return `${Math.max(0, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

/** $12.34 under $100, $1,234 over — two decimals for the small numbers where
 *  the cents actually move, whole dollars for the bigger aggregates. */
function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 100) {
    return `$${value.toFixed(2)}`;
  }
  return `$${Math.round(value).toLocaleString()}`;
}

/** 1,234,567 grouping on any integer stat. */
function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString();
}

// ─── Page ──────────────────────────────────────────────────

export default function CommandCenterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser | undefined)?.role;

  const [preset, setPreset] = useState<PresetKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<any | null>(null);
  const [realtime, setRealtime] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phase 8 — tick counter for marketplace section's "Refreshed Xs ago"
  // indicator. Bumps every 5s so the relative timestamp drifts without
  // forcing a refetch — purely cosmetic. Skipped on initial render.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(
    () => computeRange(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const fetchData = useCallback(async (realtimeOnly = false) => {
    try {
      const qs = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      }).toString();
      const res = await fetch(`/api/admin/command-center?${qs}`);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      if (realtimeOnly) {
        setRealtime(json.realtime);
      } else {
        setData(json);
        setRealtime(json.realtime);
      }
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || role !== "OWNER") {
      router.push("/");
      return;
    }

    fetchData();
    const fullInterval = setInterval(() => fetchData(false), 60_000);
    const liveInterval = setInterval(() => fetchData(true), 15_000);
    return () => { clearInterval(fullInterval); clearInterval(liveInterval); };
  }, [session, status, role, router, fetchData]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-muted)]">Loading Command Center…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">Failed to load: {error || "unknown"}</p>
        </div>
      </div>
    );
  }

  const rt = realtime || data.realtime;

  return (
    <div className="w-full px-4 sm:px-6 py-6 2xl:max-w-[1800px] 2xl:mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Gauge className="h-5 w-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Command Center</h1>
      </div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-5">
        Range metrics refresh every 60s · live metrics every 15s
      </p>

      {/* Date range picker */}
      <div className="sticky top-0 z-10 mb-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`relative overflow-hidden rounded-lg px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.97] ${
                preset === p.key
                  ? "bg-accent text-white"
                  : "bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Real-time row */}
      <SectionTitle icon={<Zap className="h-4 w-4 text-accent" />} title="Real-time" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          title="Users online right now"
          value={formatNumber(rt?.liveUsersOnline ?? 0)}
          sub="Connected through live chat this second"
          tooltip="Clippers actively connected to the SSE chat system right this moment. Drops the instant they close the tab."
        />
        <StatCard
          title="Active in last 15 min"
          value={formatNumber(rt?.activeSessionsLast15Min ?? 0)}
          sub="Unique clippers who posted a clip recently"
          tooltip="Distinct user IDs that submitted a clip within the last 15 minutes. Proxy for recent session activity."
        />
        <StatCard
          title="Peak users this hour"
          value={formatNumber(rt?.peakActiveThisHour ?? 0)}
          sub="Distinct clippers in the last 60 min"
          tooltip="Most users active within the last 60 minutes (proxy). True peak-concurrent would need a time-series table."
        />
        <StatCard
          title="Database usage"
          value={data.system.databaseSize.pretty || "—"}
          sub={data.system.databaseSize.percentOfFree != null ? `${data.system.databaseSize.percentOfFree}% of 500 MB free tier` : "Free tier"}
          tone={data.system.databaseSize.percentOfFree != null && data.system.databaseSize.percentOfFree > 80 ? "amber" : undefined}
          tooltip="Total Postgres data stored in Supabase. Free tier caps at 500 MB; upgrade before you hit 100%."
        />
        <StatCard
          title="Last tracking update"
          value={formatDuration(data.system.cronStatus.minutesAgo)}
          sub="Since last view-count refresh"
          tone={data.system.cronStatus.minutesAgo != null && data.system.cronStatus.minutesAgo > 15 ? "red" : undefined}
          tooltip="When the tracking cron last fetched view counts from TikTok/IG/YT. Over 15 min ago = cron may be stalled. (Proxy — derived from TrackingJob.lastCheckedAt, not a real cron-run audit log.)"
        />
      </div>

      {/* Money section */}
      <SectionTitle icon={<DollarSign className="h-4 w-4 text-accent" />} title="Money" />

      {/* The big-picture money row: where money came from, where it went,
          what you kept, what's still available. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          big
          title="Total campaign value"
          value={formatCurrency(data.money.totalCampaignValue ?? 0)}
          sub="Budgets of campaigns created in range"
          tooltip="Total money brands put into campaigns created on the platform within this date range. Open-ended (no-budget) campaigns are excluded. This is the gross merchandise value (GMV) flowing through in the period."
        />
        <StatCard
          big
          title="Paid to clippers"
          value={formatCurrency(data.money.totalPaidToClippers ?? 0)}
          sub="Clipper earnings on approved clips"
          tooltip="Sum of clip.earnings across all APPROVED clips reviewed in the date range. This is the total clipper-side gross earnings the platform has committed (before clipper payout requests / fees)."
        />
        <StatCard
          big
          title="Your profit (9–10% fee)"
          value={formatCurrency(data.money.platformRevenue ?? 0)}
          sub="Platform fees + CPM splits"
          tooltip="Your cut: AgencyEarning.amount for CPM_SPLIT campaigns + clip.earnings × feePercentAtApproval/100 for AGENCY_FEE campaigns. Reviewed-in-range only."
        />
        <StatCard
          big
          title="Unspent campaign budget"
          value={formatCurrency(data.money.totalUnspentBudget ?? 0)}
          sub="Available across active campaigns"
          tooltip="Point-in-time snapshot: sum of (budget − spent) for every ACTIVE campaign right now. Not filtered by the date picker — 'money still available to be earned today'. Spent includes both clipper and owner/agency earnings."
        />
      </div>

      {/* Secondary money metrics — same Money section, lower priority. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard
          title="Avg earnings per clipper"
          value={formatCurrency(data.money.avgPayoutPerClipper)}
          sub="Among clippers who posted in range"
          tooltip="Total approved clip earnings divided by the count of distinct clippers who had at least one clip in the range. Clippers with no clips in the range aren't counted in the denominator."
        />
        <StatCard
          title="Approval rate"
          value={data.health.approvalRate != null ? `${data.health.approvalRate}%` : "—"}
          sub="Approved out of all reviewed clips"
          tone={data.health.approvalRate != null && data.health.approvalRate < 50 ? "red" : undefined}
          tooltip="Approved clips as a percent of (approved + rejected) clips reviewed in the range. Pending clips aren't counted — they haven't been decided yet."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Revenue per day</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.charts.revenuePerDay}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2596be" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2596be" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#888" }} />
              <Tooltip contentStyle={{ background: "#14141a", border: "1px solid #2a2a33", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#2596be" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Top 10 clippers</h3>
            <TooltipIcon text="The 10 clippers who earned the most from approved clips in this date range. Excludes flagged and unavailable videos." />
          </div>
          {data.money.top10EarningClippers.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No earnings in this period.</p>
          ) : (
            <ol className="space-y-2">
              {data.money.top10EarningClippers.map((c: any, i: number) => (
                <li key={c.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-[var(--text-muted)] tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate text-[var(--text-primary)]">{c.username}</span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums">{c.clipCount} clips</span>
                  <span className="tabular-nums text-accent font-semibold">{formatCurrency(c.totalEarnings)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Health section */}
      <SectionTitle icon={<Activity className="h-4 w-4 text-accent" />} title="Platform health" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          title="Clips waiting for review"
          value={formatNumber(data.health.clipsPendingReview)}
          sub="Pending clips submitted in range"
          tone={data.health.clipsPendingReview > 50 ? "amber" : undefined}
          tooltip="Count of PENDING clips created in the date range. These are clips clippers have submitted but you haven't approved or rejected yet."
        />
        <StatCard
          title="Admin avg review time"
          value={formatDuration(data.health.avgReviewTimeAdminMin)}
          sub="From clip submit to admin decision"
          tooltip="Average time between clip creation and the review action (approve/reject) WHEN the reviewer is an ADMIN. Owner reviews don't affect this number."
        />
        <StatCard
          title="Owner avg review time"
          value={formatDuration(data.health.avgReviewTimeOwnerMin)}
          sub="From clip submit to owner decision"
          tooltip="Average time between clip creation and review action WHEN the reviewer is an OWNER. Admin reviews don't affect this number."
        />
        <StatCard
          title="Total views in period"
          value={formatNumber(data.health.totalViewsThisRange)}
          sub="Across all tracked clips"
          tooltip="Sum of the maximum view count recorded per clip within the date range. Using MAX per clip avoids double-counting clips that got multiple tracking updates."
        />
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Film className="h-4 w-4 text-accent" />
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Clips submitted per day</h3>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.charts.clipsPerDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#14141a", border: "1px solid #2a2a33", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="count" fill="#2596be" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Growth section */}
      <SectionTitle icon={<TrendingUp className="h-4 w-4 text-accent" />} title="Growth" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <StatCard
          title="New clipper signups"
          value={formatNumber(data.growth.newClippersStats.today)}
          sub={`today · ${formatNumber(data.growth.newClippersStats.week)} this week · ${formatNumber(data.growth.newClippersStats.month)} this month`}
          tooltip="New accounts with role CLIPPER — excludes OWNER, ADMIN, and CLIENT signups. Window is rolling today / 7 days / calendar month."
        />
        <StatCard
          title="Recent clip submissions"
          value={formatNumber(rt?.recentClipSubmissions?.length ?? 0)}
          sub="Clips submitted in the last 10 minutes"
          tooltip="Count of clips created in the last 10 minutes. The live feed below shows who submitted them."
        />
        <StatCard
          title="Your response time"
          value={formatDuration(data.support.ownerResponseTimeMin)}
          sub="Avg time from clipper ticket to owner reply"
          tone={data.support.ownerResponseTimeMin != null && data.support.ownerResponseTimeMin > 120 ? "amber" : undefined}
          tooltip="Average time between a clipper's ticket message and the NEXT owner reply in that thread. Only counts user→owner gaps; owner-to-owner or user-to-user messages don't affect this."
        />
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-accent" />
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Daily signups — last 30 days</h3>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.growth.newClippersStats.dailyLast30}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e24" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(d) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: "#888" }} />
            <Tooltip contentStyle={{ background: "#14141a", border: "1px solid #2a2a33", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="count" stroke="#2596be" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Campaigns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Campaigns running low</h3>
            <TooltipIcon text="Active campaigns with less than 20% of budget remaining. Spent includes clipper earnings AND owner/agency earnings on CPM_SPLIT campaigns — both consume the same budget." />
          </div>
          {data.campaigns.underBudget.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">All active campaigns have more than 20% of their budget remaining.</p>
          ) : (
            <ul className="space-y-2">
              {data.campaigns.underBudget.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-l-2 border-amber-400/40 pl-3">
                  <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  <span className="tabular-nums text-amber-400 font-semibold flex-shrink-0">{c.percentRemaining}% · {formatCurrency(c.spent)} / {formatCurrency(c.budget)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Inactive campaigns</h3>
            <TooltipIcon text="Active campaigns that received zero clip submissions in the last 7 days. Paused and archived campaigns are excluded — these are 'live' campaigns nobody is clipping for." />
          </div>
          {data.campaigns.dead.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Every active campaign had submissions in the last 7 days.</p>
          ) : (
            <ul className="space-y-2">
              {data.campaigns.dead.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-l-2 border-red-400/40 pl-3">
                  <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{c.ownerName} · {c.daysInactive}d+ idle</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Phase 8 — Marketplace section. Lives between Campaigns and
          Activity+Fraud so the visual hierarchy flows
          top-of-funnel → operations → marketplace deep dive → fraud. */}
      <MarketplaceSection
        marketplace={data.marketplace}
        lastUpdated={data.lastUpdated}
        nowTick={nowTick}
        onRefresh={() => fetchData(false)}
      />

      {/* Activity + Fraud */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Recent clip submissions</h3>
            <TooltipIcon text="Every clip submitted in the last 10 minutes, newest first. Refreshes every 15 seconds." />
          </div>
          {!rt?.recentClipSubmissions?.length ? (
            <p className="text-sm text-[var(--text-muted)]">No activity in this period. Check back in a few minutes.</p>
          ) : (
            <ul className="space-y-2">
              {rt.recentClipSubmissions.map((c: any) => (
                <li key={c.clipId} className="text-sm flex items-start gap-2">
                  <Clock className="h-3 w-3 text-[var(--text-muted)] mt-1 flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="text-[var(--text-primary)]">{c.username}</span>
                    <span className="text-[var(--text-muted)]"> → </span>
                    <span className="text-[var(--text-primary)]">{c.campaignName}</span>
                    <span className="text-xs text-[var(--text-muted)] block truncate">{c.platform} · {new Date(c.createdAt).toLocaleTimeString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Duplicate clip alerts</h3>
            <TooltipIcon text="Same clip URL submitted by more than one user in the date range. A single match may be a mistake; multiple users on the same URL is usually clip stealing. Manual review recommended." />
          </div>
          {!data.fraud.suspiciousClipUrls.length ? (
            <p className="text-sm text-[var(--text-muted)]">No duplicate submissions detected in this period.</p>
          ) : (
            <ul className="space-y-2">
              {data.fraud.suspiciousClipUrls.map((s: any, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2 border-l-2 border-red-400/40 pl-3">
                  <AlertTriangle className="h-3 w-3 text-red-400 mt-1 flex-shrink-0" />
                  <span className="flex-1 min-w-0 break-all">
                    <span className="text-[var(--text-primary)] text-xs">{s.clipUrl}</span>
                    <span className="block text-xs text-red-400">{s.distinctUsers} users submitted this URL</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
        <p>
          Metrics refresh every 15 seconds (real-time) or 60 seconds (analytics). Dollar figures are estimates — reconcile against provider billing (Supabase, Anthropic, Apify) for the authoritative numbers.
        </p>
        <p>
          "Peak users this hour" and "Last tracking update" are proxies derived from recent activity — a persisted time-series would give exact values but needs a schema change.
        </p>
      </div>
    </div>
  );
}

// ─── UI primitives ─────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{title}</h2>
    </div>
  );
}

function StatCard({
  title, value, sub, tone, big, tooltip,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "amber" | "red";
  big?: boolean;
  tooltip?: string;
}) {
  const toneClass =
    tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-4 hover:bg-[var(--bg-card-hover)] transition-colors">
      <div className="flex items-center gap-1.5">
        <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
        {tooltip && <TooltipIcon text={tooltip} />}
      </div>
      <p
        className={`mt-2 font-bold tracking-tight tabular-nums ${
          big
            ? "text-3xl md:text-4xl"
            : "text-2xl md:text-3xl"
        } ${toneClass}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-sm text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

/**
 * Lightweight info icon with a native tooltip. The `title` attribute works on
 * desktop hover and on mobile long-press without pulling in a floating-ui /
 * popover dependency. For heavier tooltip UX later, swap this one helper.
 */
function TooltipIcon({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex cursor-help text-[var(--text-muted)] hover:text-accent transition-colors"
    >
      <HelpCircle className="h-3 w-3" />
    </span>
  );
}

// ─── Phase 8: Marketplace section ─────────────────────────────

// Donut palette — matches spec. PENDING/REJECTED/POST_EXPIRED intentionally
// share warm hues since they all represent "not done / not approved" states;
// the donut legend keeps them distinguishable by label.
const MARKETPLACE_STATUS_COLORS: Record<string, string> = {
  PENDING: "#fbbf24",       // amber-400
  APPROVED: "#34d399",      // emerald-400
  POSTED: "#2596be",        // brand accent
  REJECTED: "#fb7185",      // rose-400
  EXPIRED: "#94a3b8",       // slate-400
  POST_EXPIRED: "#f43f5e",  // rose-500 — slightly darker to differ from REJECTED
};

function activityIconAndColor(action: string): { Icon: any; color: string } {
  switch (action) {
    case "MARKETPLACE_LISTING_APPROVE":
    case "MARKETPLACE_SUBMISSION_APPROVE":
    case "MARKETPLACE_USER_BAN_LIFTED":
    case "MARKETPLACE_LISTING_DELETE_REQUEST_CANCEL":
      return { Icon: CheckCircle2, color: "text-emerald-400" };
    case "MARKETPLACE_LISTING_REJECT":
    case "MARKETPLACE_SUBMISSION_REJECT":
      return { Icon: XCircle, color: "text-rose-400" };
    case "MARKETPLACE_SUBMISSION_POSTED":
      return { Icon: Send, color: "text-accent" };
    case "MARKETPLACE_USER_BANNED":
      return { Icon: Ban, color: "text-rose-400" };
    case "MARKETPLACE_STRIKE_ISSUED":
      return { Icon: AlertTriangle, color: "text-amber-400" };
    case "MARKETPLACE_RATING_CREATED":
      return { Icon: Star, color: "text-yellow-400" };
    case "MARKETPLACE_LISTING_DELETE_REQUEST":
      return { Icon: Trash2, color: "text-rose-400" };
    case "MARKETPLACE_LISTING_OVERRIDE":
      return { Icon: Settings, color: "text-[var(--text-muted)]" };
    default:
      return { Icon: Activity, color: "text-[var(--text-muted)]" };
  }
}

function relativeTime(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const t = typeof input === "string" ? new Date(input).getTime() : input.getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

interface MarketplaceSectionProps {
  marketplace: any | null;
  lastUpdated: string | null | undefined;
  nowTick: number;
  onRefresh: () => void;
}

function MarketplaceSection({ marketplace, lastUpdated, onRefresh }: MarketplaceSectionProps) {
  // Phase 8 — empty-state when API returned null (computation failed).
  // Match the existing campaigns-empty-card pattern.
  if (!marketplace) {
    return (
      <>
        <SectionTitle icon={<ShoppingBag className="h-4 w-4 text-accent" />} title="Marketplace" />
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-6">
          <p className="text-sm text-[var(--text-muted)]">Marketplace metrics unavailable. Check server logs.</p>
        </div>
      </>
    );
  }

  const lifetime = marketplace.lifetime || {};
  const range = marketplace.range_metrics || {};
  const strikes = marketplace.strikes || {};
  const topPosters: any[] = marketplace.topPosters || [];
  const topCreators: any[] = marketplace.topCreators || [];
  const recentActivity: any[] = marketplace.recentActivity || [];

  const submissionsByStatus: any[] = range.submissionsByStatus || [];
  const donutSegments = submissionsByStatus
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: s.status,
      value: s.count,
      color: MARKETPLACE_STATUS_COLORS[s.status] || "#888",
    }));

  // Bar chart — top posters by earnings (range-scoped). Empty list = empty
  // state; SimpleBarChart handles zero-data with a built-in fallback only
  // for the line variant, so guard explicitly.
  const posterBarData = topPosters.map((p) => ({
    label: `@${p.username}`,
    value: p.earnings,
  }));

  // Daily series — area charts expect {label, value}. Date "MM-DD" slice
  // matches the rest of the dashboard's compact axis labels.
  const dailySubsForChart = (range.dailySubmissions || []).map((d: any) => ({
    label: typeof d.date === "string" ? d.date.slice(5) : "",
    value: d.count ?? 0,
  }));
  const dailyRevForChart = (range.dailyRevenue || []).map((d: any) => ({
    label: typeof d.date === "string" ? d.date.slice(5) : "",
    value: d.revenue ?? 0,
  }));

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
            Marketplace
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">
            Refreshed {relativeTime(lastUpdated)}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] active:scale-[0.97] transition-all"
            aria-label="Refresh marketplace data"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Row 1 — 4-card stat cluster */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          big
          title="Marketplace GMV (range)"
          value={formatCurrency(range.marketplaceGmv ?? 0)}
          sub={`Creator + Poster + Platform splits`}
          tooltip="Total marketplace gross merchandise value in the date range. Sum of creator's 60% + poster's 30% + platform's 10% on clips approved within the window."
        />
        <StatCard
          big
          title="Platform 10% revenue"
          value={formatCurrency(range.platformRevenue ?? 0)}
          sub="Marketplace platform cut in range"
          tooltip="Sum of MarketplacePlatformEarning.amount on clips with reviewedAt in range. This is the marketplace's pure-platform slice (separate from agency fees and CPM splits in the global money block)."
        />
        <StatCard
          big
          title="Submissions in range"
          value={formatNumber(range.submissionsTotal ?? 0)}
          sub={`${formatNumber(range.posted ?? 0)} posted in range`}
          tooltip="Count of MarketplaceSubmission rows created within the date range. The 'posted in range' sub-stat counts submissions whose postedAt timestamp falls in the window."
        />
        <StatCard
          big
          title="Active listings"
          value={formatNumber(lifetime.activeListings ?? 0)}
          sub="As of now"
          tooltip="Count of MarketplacePosterListing rows in ACTIVE status right now. Ignores the date picker — point-in-time."
        />
      </div>

      {/* Row 2 — Donut + Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Submissions by status
            </h3>
            <TooltipIcon text="Distribution of MarketplaceSubmission statuses for submissions created in the date range. PENDING/REJECTED/POST_EXPIRED share warm tones; POSTED is the brand accent (the success state)." />
          </div>
          {donutSegments.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No submissions in this period.</p>
          ) : (
            <DonutChart segments={donutSegments} />
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Top posters (range earnings)
            </h3>
            <TooltipIcon text="Top 10 posters by their 30% cut on marketplace clips approved in the date range. Earnings = sum of Clip.earnings for clips that have a matching MarketplaceClipPost." />
          </div>
          {posterBarData.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No poster earnings in this period.</p>
          ) : (
            <SimpleBarChart
              data={posterBarData}
              title=""
              valuePrefix="$"
              height={220}
            />
          )}
        </div>
      </div>

      {/* Row 3 — Area + Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Film className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Submissions per day
            </h3>
          </div>
          <AreaGradientChart data={dailySubsForChart} label="Submissions" height={220} />
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Marketplace revenue per day
            </h3>
          </div>
          <AreaGradientChart
            data={dailyRevForChart}
            label="Revenue"
            valuePrefix="$"
            height={220}
          />
        </div>
      </div>

      {/* Row 4 — Top creators list + Activity feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Top creators (range earnings)
            </h3>
            <TooltipIcon text="Top 10 creators by their 60% cut on marketplace clips approved in the date range. Submission count is total submissions in range — useful for spotting creators with high volume but low conversion." />
          </div>
          {topCreators.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No creator earnings in this period.</p>
          ) : (
            <ol className="space-y-2">
              {topCreators.map((c: any, i: number) => (
                <li
                  key={c.userId}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <span className="w-5 text-[var(--text-muted)] tabular-nums">{i + 1}.</span>
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.image}
                      alt=""
                      className="h-6 w-6 rounded-full flex-shrink-0 bg-[var(--bg-input)]"
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-[var(--bg-input)] flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate text-[var(--text-primary)]">@{c.username}</span>
                  {c.ratingAvg != null && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-yellow-400 tabular-nums flex-shrink-0">
                      <Star className="h-3 w-3 fill-yellow-400" />
                      {Number(c.ratingAvg).toFixed(1)}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)] tabular-nums flex-shrink-0">
                    {c.submissionsCount} subs
                  </span>
                  <span className="tabular-nums text-accent font-semibold flex-shrink-0">
                    {formatCurrency(c.earnings)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Recent marketplace activity
            </h3>
            <TooltipIcon text="Last 20 high-signal marketplace audit events: approvals, rejections, posts, bans, strikes, ratings, and deletion-requests. Cosmetic edits and housekeeping events are filtered out." />
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No marketplace activity yet.</p>
          ) : (
            <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {recentActivity.map((a: any) => {
                const { Icon, color } = activityIconAndColor(a.action);
                const isListing = a.targetType === "marketplace_listing";
                return (
                  <li
                    key={a.id}
                    className="flex items-start gap-2 text-sm border-l-2 border-[var(--border-color)] pl-3"
                  >
                    <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-[var(--text-primary)]">{a.summary}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          @{a.username}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{relativeTime(a.createdAt)}</span>
                        {isListing && a.targetId && (
                          <a
                            href="/marketplace/admin"
                            className="text-accent hover:underline truncate"
                            title={a.targetId}
                          >
                            listing
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Row 5 — strike tiers + global avg rating (point-in-time) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          title="1-strike users"
          value={formatNumber(strikes.oneStrike ?? 0)}
          sub="As of now (last 30 days)"
          tooltip="Users with exactly 1 marketplace strike in the trailing 30-day window. Strikes accumulate from missed post deadlines (Phase 5)."
        />
        <StatCard
          title="2-strike users"
          value={formatNumber(strikes.twoStrike ?? 0)}
          sub="As of now (last 30 days)"
          tone={(strikes.twoStrike ?? 0) > 0 ? "amber" : undefined}
          tooltip="Users with exactly 2 marketplace strikes in the trailing 30-day window. One more = 48-hour ban."
        />
        <StatCard
          title="3+ strike users"
          value={formatNumber(strikes.threeOrMore ?? 0)}
          sub="As of now (last 30 days)"
          tone={(strikes.threeOrMore ?? 0) > 0 ? "red" : undefined}
          tooltip="Users with 3 or more strikes in the trailing 30-day window. These users have triggered the auto-ban (48h)."
        />
        <StatCard
          title="Currently banned"
          value={formatNumber(strikes.currentlyBanned ?? 0)}
          sub="As of now"
          tone={(strikes.currentlyBanned ?? 0) > 0 ? "red" : undefined}
          tooltip="Distinct users with at least one MarketplaceStrike row whose bannedUntil is still in the future. Their listings are auto-paused for the duration."
        />
        <StatCard
          title="Global avg rating"
          value={
            lifetime.globalAvgRating != null
              ? `${Number(lifetime.globalAvgRating).toFixed(2)}`
              : "—"
          }
          sub={`${formatNumber(lifetime.globalRatingCount ?? 0)} ratings · As of now`}
          tooltip="Average score across every marketplace rating ever submitted (both directions). Scale is 1-5; 4.5+ is healthy, below 3.5 indicates a quality problem."
        />
      </div>
    </>
  );
}
