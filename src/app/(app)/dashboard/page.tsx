"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
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

// ── Glass card primitive ──
function GlassCard({ children, className = "", hover = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] ${
        hover ? "hover:bg-white/[0.05] hover:border-white/[0.1] hover:scale-[1.01] cursor-pointer" : ""
      } transition-all duration-300 ease-out p-5 sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

// ── Tooltip ──
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (timerRef.current) clearTimeout(timerRef.current); }; }, []);
  const handleTap = () => {
    setShow(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 3000);
  };
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button type="button" className="inline-flex items-center justify-center h-[14px] w-[14px] rounded-full text-white/30 hover:text-accent transition-colors cursor-pointer" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={handleTap}>
        <Info className="h-[14px] w-[14px]" />
      </button>
      {show && (
        <span className="absolute bottom-full mb-2 w-52 sm:w-60 rounded-xl bg-[#111318]/95 backdrop-blur-xl border border-white/[0.08] px-3.5 py-2.5 text-xs text-white/70 shadow-xl z-50 pointer-events-none right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
          {text}
        </span>
      )}
    </span>
  );
}

// ── Stat label ──
function StatLabel({ children, tip }: { children: React.ReactNode; tip: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 flex items-center">
      {children}
      <Tooltip text={tip} />
    </p>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

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
  const [timeframeDays, setTimeframeDays] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) return 15;
    return 30;
  });
  const [loading, setLoading] = useState(true);
  const [gamification, setGamification] = useState<any>(null);

  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasJoinedCampaign, setHasJoinedCampaign] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/gamification").then((r) => r.json()).catch(() => null),
      fetch("/api/accounts/mine").then((r) => r.json()).catch(() => []),
      fetch("/api/campaign-accounts").then((r) => r.json()).catch(() => []),
    ]).then(([gamData, accounts, joins]) => {
      if (gamData) setGamification(gamData);
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
      </div>
    );
  }

  const filteredEarnings = timeFilteredClips.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const filteredPending = timeFilteredClips.filter((c: any) => c.status === "PENDING").length;

  return (
    <div className="space-y-8 bg-gradient-to-b from-accent/[0.02] to-transparent -m-4 lg:-m-6 p-4 lg:p-6 min-h-full">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            Welcome back, {session?.user?.name?.split(" ")[0] || "Clipper"}
          </h1>
          <p className="text-[15px] text-white/40 mt-1">
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

      {/* ── Getting Started ── */}
      {checklistLoaded && !allComplete && (
        <GlassCard className="border-l-4 !border-l-accent">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-9 w-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <Rocket className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Getting Started</h2>
              <p className="text-xs text-white/40">{completedCount} of 3 complete</p>
            </div>
          </div>
          <div className="space-y-3 mt-4">
            {checklistSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                {step.done ? (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent flex-shrink-0 shadow-[0_0_12px_rgba(37,150,190,0.3)]">
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/10 flex-shrink-0" />
                )}
                {step.done ? (
                  <span className="text-sm text-white/30 line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className="text-sm text-accent hover:text-accent/80 font-medium flex items-center gap-1.5 transition-colors">
                    {step.icon} {step.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ── Earnings Card ── */}
      <GlassCard hover>
        <div className="flex items-center justify-between mb-3">
          <StatLabel tip="Your total approved earnings including level and streak bonuses.">Earnings</StatLabel>
          <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-accent" />
          </div>
        </div>
        <p className="text-3xl sm:text-4xl font-bold text-accent" style={{ textShadow: "0 0 30px rgba(37,150,190,0.4)" }}>
          {formatCurrency(filteredEarnings)}
        </p>
      </GlassCard>

      {/* ── Gamification ── */}
      {gamification && gamification.level != null && (
        <div className="grid gap-5 sm:grid-cols-3">
          {/* Level */}
          <GlassCard hover>
            <div className="flex items-center justify-between mb-3">
              <StatLabel tip="Based on lifetime earnings. Higher levels = bigger permanent bonus.">Your Level</StatLabel>
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-accent" />
              </div>
            </div>
            <div className="flex items-baseline gap-2.5">
              <p className="text-3xl sm:text-4xl font-bold text-accent" style={{ textShadow: "0 0 30px rgba(37,150,190,0.4)" }}>
                Level {gamification.level}
              </p>
              {gamification.bonusPercent > 0 && (
                <span className="text-sm font-semibold text-accent/70">+{gamification.bonusPercent}%</span>
              )}
            </div>
            {gamification.earningsToNextLevel > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-[11px] font-medium mb-1.5">
                  <span className="text-white/40">{formatCurrency(gamification.totalEarnings)}</span>
                  <span className="text-accent">{formatCurrency(gamification.nextLevelAt)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all duration-700 shadow-[0_0_10px_rgba(37,150,190,0.3)]"
                    style={{ width: `${Math.min((gamification.totalEarnings / gamification.nextLevelAt) * 100, 100)}%` }} />
                </div>
                <p className="text-[11px] text-white/30 mt-1.5">
                  {formatCurrency(gamification.earningsToNextLevel)} to next level
                </p>
              </div>
            )}
          </GlassCard>

          {/* Streak */}
          <GlassCard hover>
            <div className="flex items-center justify-between mb-3">
              <StatLabel tip="Post 1 approved clip per day. Miss a day and it resets.">Daily Streak</StatLabel>
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Flame className="h-5 w-5 text-accent" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl sm:text-4xl font-bold text-accent" style={{ textShadow: "0 0 30px rgba(37,150,190,0.4)" }}>
                {gamification.currentStreak}
              </p>
              <span className="text-sm text-white/30">day{gamification.currentStreak !== 1 ? "s" : ""}</span>
            </div>
            <div className="mt-3 space-y-1">
              {gamification.currentStreak > 0 && gamification.streakReward && (
                <p className="text-xs text-accent font-medium">+{gamification.streakReward.bonusPercent}% streak bonus active</p>
              )}
              {gamification.nextStreakReward && (
                <p className="text-xs text-white/30">
                  {gamification.nextStreakReward.days - gamification.currentStreak}d to +{gamification.nextStreakReward.bonusPercent}%
                </p>
              )}
              {gamification.longestStreak > gamification.currentStreak && (
                <p className="text-xs text-white/25">Best: {gamification.longestStreak} days</p>
              )}
            </div>
          </GlassCard>

          {/* Total Bonus */}
          <GlassCard hover>
            <div className="flex items-center justify-between mb-3">
              <StatLabel tip="Level + streak + app bonuses combined. Applied to all earnings.">Total Bonus</StatLabel>
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-accent" />
              </div>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-accent" style={{ textShadow: "0 0 30px rgba(37,150,190,0.4)" }}>
              +{gamification.bonusPercent}%
            </p>
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/30">Level bonus</span>
                <span className="text-white/50 font-medium">+{gamification.levelBonus || 0}%</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/30">Streak bonus</span>
                <span className="text-white/50 font-medium">+{gamification.streakBonusPercent || 0}%</span>
              </div>
              {gamification.isPWAUser && (
                <div className="flex justify-between text-xs">
                  <span className="text-white/30">App bonus</span>
                  <span className="text-white/50 font-medium">+{gamification.pwaBonusPercent || 0}%</span>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Earnings Chart ── */}
      <GlassCard>
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Earnings over time</h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
            <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
          </div>
        </div>
        <EarningsChart clips={timeFilteredClips} filters={earningsFilters} days={timeframeDays} />
      </GlassCard>

      {/* ── Recent Clips ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">Recent clips</h2>
          <Link href="/clips" className="text-sm text-accent hover:text-accent/80 transition-colors">View all</Link>
        </div>
        {recentClips.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon={<Film className="h-10 w-10" />}
              title="No clips yet"
              description="Submit your first clip to get started."
            />
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {recentClips.map((clip: any) => (
              <GlassCard key={clip.id} hover className="!p-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">{clip.campaign?.name}</p>
                  <p className="text-sm text-white/30 truncate mt-0.5">{clip.clipAccount?.username} · {formatRelative(clip.createdAt)}</p>
                </div>
                <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 whitespace-nowrap flex-shrink-0 transition-colors">
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {clip.earnings > 0 && (
                    <span className="text-sm font-semibold text-accent tabular-nums">{formatCurrency(clip.earnings)}</span>
                  )}
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
