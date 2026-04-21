"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import { AlertTriangle, Bot, Film, Mail, TrendingUp, Users, Megaphone, Gauge } from "lucide-react";

interface CostData {
  month: string;
  ai: { messagesThisMonth: number; estimatedCostUSD: number; costPerMessage: number };
  apify: { callsThisMonth: number; estimatedCostUSD: number; trackedClips: number };
  users: { total: number; activeClippersToday: number; activeClippersThisWeek: number };
  clips: { submittedToday: number; submittedThisMonth: number };
  campaigns: { active: number };
  notifications: { sentThisMonth: number; resendFreeLimit: number; percentUsed: number; note?: string };
  totalEstimatedMonthlyCostUSD: number;
  lastUpdated: string;
}

function costColorClass(cost: number): string {
  if (cost < 10) return "text-emerald-400";
  if (cost < 50) return "text-amber-400";
  return "text-red-400";
}

export default function CostStatusPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser | undefined)?.role;
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || role !== "OWNER") {
      router.push("/");
      return;
    }

    let cancelled = false;
    const fetchCosts = async () => {
      try {
        const res = await fetch("/api/admin/cost-status");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        if (!cancelled) { setData(json); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCosts();
    const interval = setInterval(fetchCosts, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [session, status, role, router]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-muted)]">Loading cost data…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">Failed to load cost data: {error || "unknown"}</p>
        </div>
      </div>
    );
  }

  const totalCost = data.totalEstimatedMonthlyCostUSD;
  const costOverThreshold = totalCost > 50;
  const emailWarning = data.notifications.percentUsed > 80;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Gauge className="h-5 w-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Cost status — {data.month}</h1>
      </div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-6">
        Last updated {new Date(data.lastUpdated).toLocaleString()} · auto-refreshes every 60s
      </p>

      {/* Total cost banner */}
      <div className="mb-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-5">
        <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">Total estimated monthly cost</p>
        <p className={`mt-2 text-4xl font-bold tabular-nums ${costColorClass(totalCost)}`}>
          ${totalCost.toFixed(2)}
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Estimates from observed usage; reconcile with each provider's billing page.
        </p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          icon={<Bot className="h-4 w-4 text-accent" />}
          title="Anthropic AI"
          big={`$${data.ai.estimatedCostUSD.toFixed(2)}`}
          line1={`${data.ai.messagesThisMonth.toLocaleString()} messages`}
          line2={`@ $${data.ai.costPerMessage.toFixed(3)} / msg`}
        />
        <MetricCard
          icon={<TrendingUp className="h-4 w-4 text-accent" />}
          title="Apify (tracking)"
          big={`$${data.apify.estimatedCostUSD.toFixed(2)}`}
          line1={`${data.apify.callsThisMonth.toLocaleString()} fetches`}
          line2={`${data.apify.trackedClips} clips being tracked`}
        />
        <MetricCard
          icon={<Mail className="h-4 w-4 text-accent" />}
          title="Email (Resend)"
          big={`${data.notifications.percentUsed}%`}
          line1={`${data.notifications.sentThisMonth.toLocaleString()} / ${data.notifications.resendFreeLimit.toLocaleString()} free`}
          line2="$0 until limit"
        />
        <MetricCard
          icon={<Users className="h-4 w-4 text-accent" />}
          title="Users"
          big={data.users.total.toLocaleString()}
          line1={`${data.users.activeClippersToday} active today`}
          line2={`${data.users.activeClippersThisWeek} active this week`}
        />
        <MetricCard
          icon={<Film className="h-4 w-4 text-accent" />}
          title="Clips"
          big={data.clips.submittedToday.toLocaleString()}
          line1="submitted today"
          line2={`${data.clips.submittedThisMonth.toLocaleString()} this month`}
        />
        <MetricCard
          icon={<Megaphone className="h-4 w-4 text-accent" />}
          title="Active campaigns"
          big={data.campaigns.active.toLocaleString()}
        />
      </div>

      {/* Alerts */}
      {costOverThreshold && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-red-400">Cost alert</p>
            <p className="text-[var(--text-secondary)] mt-1">
              Monthly estimate over $50. Check Apify polling frequency, AI quota, and campaign tracking volume.
            </p>
          </div>
        </div>
      )}

      {emailWarning && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-400">Email quota high</p>
            <p className="text-[var(--text-secondary)] mt-1">
              {data.notifications.percentUsed}% of Resend free tier (3,000/mo) proxied from bell notifications.
              Cross-check in Resend dashboard; consider Resend Pro ($20/mo) if real sends are also near cap.
            </p>
          </div>
        </div>
      )}

      {data.notifications.note && (
        <p className="mt-4 text-xs text-[var(--text-muted)]">{data.notifications.note}</p>
      )}
    </div>
  );
}

function MetricCard({
  icon, title, big, line1, line2,
}: {
  icon: React.ReactNode;
  title: string;
  big: string;
  line1?: string;
  line2?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-4 hover:bg-[var(--bg-card-hover)] transition-colors">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{title}</h3>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{big}</p>
      {line1 && <p className="mt-1 text-sm text-[var(--text-secondary)]">{line1}</p>}
      {line2 && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{line2}</p>}
    </div>
  );
}
