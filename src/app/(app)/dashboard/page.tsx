"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EarningsChart } from "@/components/earnings/EarningsChart";
import { EarningsFilters } from "@/components/earnings/EarningsFilters";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { type EarningsFilterKey } from "@/lib/earnings";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { Film, DollarSign, ExternalLink, Flame, Star, Rocket, Check, UserCircle, Megaphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") router.replace("/admin");
  }, [session, userRole, router]);

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

  if (loading && allClips.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
      </div>
    );
  }

  const filteredEarnings = timeFilteredClips.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const g = gamification;
  const levelNames = ["Rookie", "Clipper", "Creator", "Influencer", "Viral", "Icon"];
  const levelName = g ? (levelNames[g.level] || "") : "";
  const levelProgress = g?.nextLevelAt > 0 ? Math.min((g.totalEarnings / g.nextLevelAt) * 100, 100) : 100;

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          {session?.user?.name?.split(" ")[0] || "Clipper"}
        </h1>
        {campaignOptions.length > 0 && (
          <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={handleCampaignChange} allLabel="All campaigns" />
        )}
      </div>

      {/* ── Getting Started ── */}
      {checklistLoaded && !allComplete && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 border-l-2 border-l-accent">
          <div className="flex items-center gap-2 mb-3">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-white flex-1">Getting Started</span>
            <span className="text-[11px] text-white/30">{completedCount}/3</span>
          </div>
          <div className="space-y-2">
            {checklistSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {step.done ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent flex-shrink-0"><Check className="h-3 w-3 text-white" /></div>
                ) : (
                  <div className="h-5 w-5 rounded-full border border-white/10 flex-shrink-0" />
                )}
                {step.done ? (
                  <span className="text-xs text-white/25 line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className="text-xs text-accent font-medium flex items-center gap-1">{step.icon} {step.label}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hero: Earnings ── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 mb-2">Total Earnings</p>
        <p className="text-4xl sm:text-5xl font-bold text-accent tabular-nums tracking-tight">{formatCurrency(filteredEarnings)}</p>
        {g && g.bonusPercent > 0 && (
          <p className="text-sm text-white/50 mt-2">
            <span className="text-accent font-semibold">+{g.bonusPercent}%</span> bonus active
            <span className="text-white/25 ml-2">({g.levelBonus || 0}% level + {g.streakBonusPercent || 0}% streak{g.isPWAUser ? ` + ${g.pwaBonusPercent || 0}% app` : ""})</span>
          </p>
        )}
      </div>

      {/* ── Level + Streak bar ── */}
      {g && g.level != null && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            {/* Level side */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Star className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                <span className="text-sm font-semibold text-white">Level {g.level}</span>
                <span className="text-xs text-white/40">{levelName}</span>
                <span className="text-xs font-semibold text-accent ml-auto sm:ml-2">+{g.levelBonus || 0}%</span>
              </div>
              {g.earningsToNextLevel > 0 && (
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${levelProgress}%` }} />
                  </div>
                  <span className="text-[11px] text-white/30 tabular-nums flex-shrink-0">{formatCurrency(g.earningsToNextLevel)} left</span>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-10 bg-white/[0.06] hidden sm:block" />

            {/* Streak side */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <Flame className="h-4 w-4 text-accent" />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-white tabular-nums">{g.currentStreak}</span>
                  <span className="text-xs text-white/30">day{g.currentStreak !== 1 ? "s" : ""}</span>
                </div>
                {g.streakBonusPercent > 0 ? (
                  <p className="text-[11px] text-accent font-medium">+{g.streakBonusPercent}% streak</p>
                ) : g.nextStreakReward ? (
                  <p className="text-[11px] text-white/25">{g.nextStreakReward.days - g.currentStreak}d to +{g.nextStreakReward.bonusPercent}%</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Earnings Chart ── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 sm:p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Earnings over time</h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
            <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
          </div>
        </div>
        <EarningsChart clips={timeFilteredClips} filters={earningsFilters} days={timeframeDays} />
      </div>

      {/* ── Recent Clips ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent clips</h2>
          <Link href="/clips" className="text-xs text-accent">View all</Link>
        </div>
        {recentClips.length === 0 ? (
          <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6">
            <EmptyState icon={<Film className="h-10 w-10" />} title="No clips yet" description="Submit your first clip to get started." />
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentClips.map((clip: any) => (
              <div key={clip.id} className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-color)] px-4 py-3 flex items-center gap-3 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">{clip.campaign?.name}</p>
                  <p className="text-xs text-white/25 truncate">{clip.clipAccount?.username} · {formatRelative(clip.createdAt)}</p>
                </div>
                <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="text-accent flex-shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {clip.earnings > 0 && <span className="text-xs font-bold text-accent tabular-nums">{formatCurrency(clip.earnings)}</span>}
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
