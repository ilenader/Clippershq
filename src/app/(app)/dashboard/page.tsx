"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EarningsChart } from "@/components/earnings/EarningsChart";
import { EarningsFilters } from "@/components/earnings/EarningsFilters";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { type EarningsFilterKey } from "@/lib/earnings";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { Film, DollarSign, TrendingUp, ExternalLink, Flame, Star, Zap, Info, Rocket, Check, UserCircle, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Tooltip component ──
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = () => {
    setShow(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 3000);
  };

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        className="inline-flex items-center justify-center h-[14px] w-[14px] rounded-full text-[var(--text-muted)] hover:text-accent transition-colors cursor-pointer"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={handleTap}
      >
        <Info className="h-[14px] w-[14px]" />
      </button>
      {show && (
        <span className="absolute bottom-full mb-2 w-48 sm:w-56 rounded-lg bg-[#1a1a1d] border border-[var(--border-color)] px-3 py-2 text-xs text-white shadow-lg z-50 pointer-events-none right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
          {text}
        </span>
      )}
    </span>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  // Role isolation: non-clippers should use /admin dashboard
  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin");
    }
  }, [session, userRole, router]);

  const [stats, setStats] = useState({ myClips: 0, totalEarnings: 0, pendingClips: 0 });
  const [allClips, setAllClips] = useState<any[]>([]);
  const [recentClips, setRecentClips] = useState<any[]>([]);
  const [earningsFilters, setEarningsFilters] = useState<EarningsFilterKey[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<{ value: string; label: string }[]>([]);
  const [timeframeDays, setTimeframeDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [gamification, setGamification] = useState<any>(null);

  // Getting Started checklist state
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasJoinedCampaign, setHasJoinedCampaign] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);

  // Fetch gamification state
  useEffect(() => {
    fetch("/api/gamification").then((r) => r.json()).then(setGamification).catch(() => {});
  }, []);

  // Fetch checklist data (accounts + campaign joins)
  useEffect(() => {
    Promise.all([
      fetch("/api/accounts/mine").then((r) => r.json()).catch(() => []),
      fetch("/api/campaign-accounts").then((r) => r.json()).catch(() => []),
    ]).then(([accounts, joins]) => {
      setHasAccounts(Array.isArray(accounts) && accounts.length > 0);
      setHasJoinedCampaign(Array.isArray(joins) && joins.length > 0);
      setChecklistLoaded(true);
    });
  }, []);

  const fetchData = useCallback((campaignIds: string[], buildOptions = false) => {
    setLoading(true);
    const qs = campaignIds.length > 0 ? `?campaignIds=${campaignIds.join(",")}` : "";
    Promise.all([
      fetch(`/api/clips/mine${qs}`).then((r) => r.json()),
      fetch(`/api/earnings${qs}`).then((r) => r.json()),
    ])
      .then(([clipsData, earningsData]) => {
        const clipsArr = Array.isArray(clipsData) ? clipsData : [];
        setAllClips(clipsArr);
        setRecentClips(clipsArr.slice(0, 5));
        setStats({
          myClips: clipsArr.length,
          totalEarnings: earningsData.approvedEarnings || 0,
          pendingClips: clipsArr.filter((c: any) => c.status === "PENDING").length,
        });
        if (buildOptions) {
          const map = new Map<string, string>();
          for (const c of clipsArr) {
            if (c.campaignId && c.campaign?.name) map.set(c.campaignId, c.campaign.name);
          }
          setCampaignOptions(Array.from(map, ([value, label]) => ({ value, label })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData([], true); }, [fetchData]);
  useAutoRefresh(() => fetchData(selectedCampaigns), 15000);

  const handleCampaignChange = useCallback((values: string[]) => {
    setSelectedCampaigns(values);
    fetchData(values);
  }, [fetchData]);

  const timeFilteredClips = filterByTimeframe(allClips, timeframeDays);

  // Getting Started checklist
  const hasClips = allClips.length > 0;
  const checklistSteps = [
    { done: hasAccounts, label: "Add your social media account", href: "/accounts", icon: <UserCircle className="h-4 w-4" /> },
    { done: hasJoinedCampaign, label: "Join a campaign", href: "/campaigns", icon: <Megaphone className="h-4 w-4" /> },
    { done: hasClips, label: "Submit your first clip", href: "/clips", icon: <Film className="h-4 w-4" /> },
  ];
  const completedCount = checklistSteps.filter((s) => s.done).length;
  const allComplete = completedCount === 3;

  if (loading && allClips.length === 0 && stats.myClips === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Welcome back, {session?.user?.name?.split(" ")[0] || "Clipper"}
          </h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            Here&apos;s what&apos;s happening with your clips.
          </p>
        </div>
        {campaignOptions.length > 0 && (
          <MultiDropdown
            label="Campaign"
            options={campaignOptions}
            values={selectedCampaigns}
            onChange={handleCampaignChange}
            allLabel="All campaigns"
          />
        )}
      </div>

      {/* ── Getting Started Checklist ── */}
      {checklistLoaded && !allComplete && (
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="border-l-4 border-accent p-5">
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="h-5 w-5 text-accent" />
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Getting Started</h2>
              <span className="ml-auto text-xs text-[var(--text-muted)]">{completedCount} of 3 complete</span>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4">Complete these steps to start earning</p>
            <div className="space-y-3">
              {checklistSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {step.done ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent flex-shrink-0">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--border-color)] flex-shrink-0" />
                  )}
                  {step.done ? (
                    <span className="text-sm text-[var(--text-muted)] line-through">{step.label}</span>
                  ) : (
                    <Link href={step.href} className="text-sm text-accent hover:underline font-medium flex items-center gap-1.5">
                      {step.icon} {step.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Clips", value: timeFilteredClips.length, icon: <Film className="h-4 w-4" />, color: "text-accent", tip: "Total clips you've submitted across all campaigns." },
          { label: "Pending", value: timeFilteredClips.filter((c: any) => c.status === "PENDING").length, icon: <TrendingUp className="h-4 w-4" />, color: "text-accent", tip: "Clips waiting to be reviewed. Usually takes 24-48 hours." },
          { label: "Earnings", value: formatCurrency(timeFilteredClips.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + (c.earnings || 0), 0)), icon: <DollarSign className="h-4 w-4" />, color: "text-accent", tip: "Your total approved earnings including level and streak bonuses." },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                {stat.label}
                <Tooltip text={stat.tip} />
              </p>
              <span className={stat.color}>{stat.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Gamification — Level, Streak, Bonus */}
      {gamification && gamification.level != null && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                Your Level
                <Tooltip text="Based on lifetime earnings. Higher levels = bigger permanent bonus." />
              </p>
              <Star className="h-4 w-4 text-accent" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-accent">Level {gamification.level}</p>
              {gamification.bonusPercent > 0 && (
                <span className="text-sm font-medium text-emerald-400">+{gamification.bonusPercent}% bonus</span>
              )}
            </div>
            {gamification.earningsToNextLevel > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[var(--text-muted)]">{formatCurrency(gamification.totalEarnings)} earned</span>
                  <span className="text-accent">{formatCurrency(gamification.nextLevelAt)} for Level {gamification.level + 1}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                  <div className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.min((gamification.totalEarnings / gamification.nextLevelAt) * 100, 100)}%` }} />
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {formatCurrency(gamification.earningsToNextLevel)} to next level
                </p>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                Daily Streak
                <Tooltip text="Post 1 approved clip per day. Miss a day and it resets." />
              </p>
              <Flame className="h-4 w-4 text-accent" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-accent">{gamification.currentStreak}</p>
              <span className="text-sm text-[var(--text-muted)]">day{gamification.currentStreak !== 1 ? "s" : ""}</span>
            </div>
            {gamification.currentStreak > 0 && gamification.streakReward && (
              <p className="text-xs text-emerald-400 mt-1">+{gamification.streakReward.bonusPercent}% streak bonus active</p>
            )}
            {gamification.nextStreakReward && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Post daily to reach {gamification.nextStreakReward.days}-day streak (+{gamification.nextStreakReward.bonusPercent}%)
              </p>
            )}
            {gamification.longestStreak > gamification.currentStreak && (
              <p className="text-xs text-[var(--text-muted)] mt-1">Best: {gamification.longestStreak} days</p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] flex items-center">
                Total Bonus
                <Tooltip text="Level + streak + app bonuses combined. Applied to all earnings." />
              </p>
              <Zap className="h-4 w-4 text-accent" />
            </div>
            <p className="text-3xl font-bold text-accent">+{gamification.bonusPercent}%</p>
            <div className="mt-2 space-y-0.5">
              <p className="text-xs text-[var(--text-muted)]">Level: +{gamification.levelBonus || 0}%</p>
              <p className="text-xs text-[var(--text-muted)]">Streak: +{gamification.streakBonusPercent || 0}%</p>
              {gamification.isPWAUser && <p className="text-xs text-[var(--text-muted)]">App: +{gamification.pwaBonusPercent || 0}%</p>}
            </div>
          </Card>
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

      {/* Recent Clips */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent clips</h2>
          <Link href="/clips" className="text-sm text-accent hover:underline">View all</Link>
        </div>
        {recentClips.length === 0 ? (
          <EmptyState
            icon={<Film className="h-10 w-10" />}
            title="No clips yet"
            description="Submit your first clip to get started."
          />
        ) : (
          <div className="space-y-2">
            {recentClips.map((clip: any) => (
              <Card key={clip.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-[15px] font-medium text-[var(--text-primary)]">{clip.campaign?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm text-[var(--text-muted)]">{clip.clipAccount?.username} · {formatRelative(clip.createdAt)}</p>
                    <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline whitespace-nowrap">
                      <ExternalLink className="h-3 w-3" /> Open clip
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {clip.earnings > 0 && (
                    <span className="text-sm font-medium text-[var(--text-primary)]">{formatCurrency(clip.earnings)}</span>
                  )}
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
