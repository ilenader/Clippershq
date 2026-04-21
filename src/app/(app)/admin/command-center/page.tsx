"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import {
  Activity, AlertTriangle, Bot, Clock, Database, DollarSign, Film, Flag,
  Gauge, Mail, Megaphone, Target, TrendingUp, Users, Zap,
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Gauge className="h-5 w-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Command Center</h1>
      </div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-5">
        Range metrics refresh every 60s · live metrics every 15s
      </p>

      {/* Date range picker */}
      <div className="sticky top-0 z-10 mb-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
        <div className="flex flex-wrap gap-2">
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
        <StatCard title="Live sockets" value={String(rt?.liveUsersOnline ?? 0)} sub="open SSE now" />
        <StatCard title="Active 15 min" value={String(rt?.activeSessionsLast15Min ?? 0)} sub="distinct users" />
        <StatCard
          title="Active this hour"
          value={String(rt?.peakActiveThisHour ?? 0)}
          sub="proxy for peak"
        />
        <StatCard
          title="DB size"
          value={data.system.databaseSize.pretty || "—"}
          sub={data.system.databaseSize.percentOfFree != null ? `${data.system.databaseSize.percentOfFree}% of 500 MB` : "free tier"}
          tone={data.system.databaseSize.percentOfFree != null && data.system.databaseSize.percentOfFree > 80 ? "amber" : undefined}
        />
        <StatCard
          title="Last tracking"
          value={data.system.cronStatus.minutesAgo != null ? `${data.system.cronStatus.minutesAgo}m ago` : "—"}
          sub="TrackingJob.lastCheckedAt (proxy)"
          tone={data.system.cronStatus.minutesAgo != null && data.system.cronStatus.minutesAgo > 15 ? "red" : undefined}
        />
      </div>

      {/* Money section */}
      <SectionTitle icon={<DollarSign className="h-4 w-4 text-accent" />} title="Money" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <StatCard title="Platform revenue" value={`$${(data.money.platformRevenue ?? 0).toFixed(2)}`} sub="agency earnings in range" big />
        <StatCard
          title="Avg payout / clipper"
          value={data.money.avgPayoutPerClipper != null ? `$${data.money.avgPayoutPerClipper.toFixed(2)}` : "—"}
          sub="approved clip earnings / active clippers"
        />
        <StatCard
          title="Approval rate"
          value={data.health.approvalRate != null ? `${data.health.approvalRate}%` : "—"}
          sub="approved / reviewed in range"
          tone={data.health.approvalRate != null && data.health.approvalRate < 50 ? "red" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Revenue per day</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
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
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Top 10 earners</h3>
          </div>
          {data.money.top10EarningClippers.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No earnings in this period.</p>
          ) : (
            <ol className="space-y-2">
              {data.money.top10EarningClippers.map((c: any, i: number) => (
                <li key={c.userId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-[var(--text-muted)] tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate text-[var(--text-primary)]">{c.username}</span>
                  <span className="tabular-nums text-accent font-semibold">${c.totalEarnings.toFixed(2)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Health section */}
      <SectionTitle icon={<Activity className="h-4 w-4 text-accent" />} title="Platform health" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard title="Pending review" value={String(data.health.clipsPendingReview)} sub="in range" tone={data.health.clipsPendingReview > 50 ? "amber" : undefined} />
        <StatCard title="Admin review time" value={data.health.avgReviewTimeAdminMin != null ? `${data.health.avgReviewTimeAdminMin}m` : "—"} sub="avg from submit → review" />
        <StatCard title="Owner review time" value={data.health.avgReviewTimeOwnerMin != null ? `${data.health.avgReviewTimeOwnerMin}m` : "—"} sub="avg from submit → review" />
        <StatCard title="Total views" value={(data.health.totalViewsThisRange ?? 0).toLocaleString()} sub="in range" />
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Film className="h-4 w-4 text-accent" />
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Clips submitted per day</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
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
        <StatCard title="New clippers today" value={String(data.growth.newClippersStats.today ?? 0)} sub={`${data.growth.newClippersStats.week ?? 0} this week · ${data.growth.newClippersStats.month ?? 0} this month`} />
        <StatCard title="Bot" value={String(rt?.recentClipSubmissions?.length ?? 0)} sub="clips in last 10 min" />
        <StatCard
          title="Owner response"
          value={data.support.ownerResponseTimeMin != null ? `${data.support.ownerResponseTimeMin}m` : "—"}
          sub="avg reply time to tickets"
          tone={data.support.ownerResponseTimeMin != null && data.support.ownerResponseTimeMin > 120 ? "amber" : undefined}
        />
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-accent" />
          <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Daily signups — last 30 days</h3>
        </div>
        <ResponsiveContainer width="100%" height={180}>
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
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Campaigns under budget (&lt;20% left)</h3>
          </div>
          {data.campaigns.underBudget.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No campaigns under 20%.</p>
          ) : (
            <ul className="space-y-2">
              {data.campaigns.underBudget.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-l-2 border-amber-400/40 pl-3">
                  <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  <span className="tabular-nums text-amber-400 font-semibold flex-shrink-0">{c.percentRemaining}% · ${c.spent.toFixed(2)} / ${c.budget.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone className="h-4 w-4 text-accent" />
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Dead campaigns (no clips in 7d)</h3>
          </div>
          {data.campaigns.dead.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No dead ACTIVE campaigns.</p>
          ) : (
            <ul className="space-y-2">
              {data.campaigns.dead.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm border-l-2 border-red-400/40 pl-3">
                  <span className="truncate text-[var(--text-primary)]">{c.name}</span>
                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{c.ownerName} · {c.daysInactive}d+</span>
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
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Live activity (10 min)</h3>
          </div>
          {!rt?.recentClipSubmissions?.length ? (
            <p className="text-sm text-[var(--text-muted)]">No submissions in the last 10 minutes.</p>
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
            <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Duplicate clip URLs</h3>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Same clipUrl submitted by multiple users in range — likely stealing. {data.fraud.note.split(".")[0]}.
          </p>
          {!data.fraud.suspiciousClipUrls.length ? (
            <p className="text-sm text-[var(--text-muted)]">No duplicates detected.</p>
          ) : (
            <ul className="space-y-2">
              {data.fraud.suspiciousClipUrls.map((s: any, i: number) => (
                <li key={i} className="text-sm flex items-start gap-2 border-l-2 border-red-400/40 pl-3">
                  <AlertTriangle className="h-3 w-3 text-red-400 mt-1 flex-shrink-0" />
                  <span className="flex-1 min-w-0 break-all">
                    <span className="text-[var(--text-primary)] text-xs">{s.clipUrl}</span>
                    <span className="block text-xs text-red-400">{s.distinctUsers} users</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-2">
        All $ figures are estimates reconciled against provider billing. "Last tracking" and "Active this hour" are proxies (marked in source) — no persisted time-series exists without a schema change.
      </p>
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
  title, value, sub, tone, big,
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "amber" | "red";
  big?: boolean;
}) {
  const toneClass =
    tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
      <p className={`mt-1 ${big ? "text-3xl" : "text-xl"} font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
