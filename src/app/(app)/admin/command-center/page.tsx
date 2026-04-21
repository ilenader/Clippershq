"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import {
  Activity, AlertTriangle, Clock, DollarSign, Film, Flag,
  Gauge, HelpCircle, Megaphone, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

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
            ? "text-4xl md:text-5xl lg:text-6xl"
            : "text-3xl md:text-4xl lg:text-5xl"
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
