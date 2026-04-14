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
import { Film, DollarSign, ExternalLink, Flame, Star, Zap, Rocket, Check, UserCircle, Megaphone, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Dark card ──
function DarkCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-[#111] border border-white/[0.04] hover:border-white/[0.08] transition-colors duration-200 ${className}`}>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") router.replace("/admin");
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
  const [showTips, setShowTips] = useState(false);

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
  const gam = gamification;
  const levelNames = ["Rookie", "Clipper", "Creator", "Influencer", "Viral", "Icon"];
  const levelName = gam ? (levelNames[gam.level] || `Level ${gam.level}`) : "";
  const levelProgress = gam?.nextLevelAt > 0 ? Math.min((gam.totalEarnings / gam.nextLevelAt) * 100, 100) : 100;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {session?.user?.name?.split(" ")[0] || "Clipper"}
          </h1>
          {gam && gam.bonusPercent > 0 && (
            <span className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">
              +{gam.bonusPercent}%
            </span>
          )}
        </div>
        {campaignOptions.length > 0 && (
          <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={handleCampaignChange} allLabel="All campaigns" />
        )}
      </div>

      {/* ── Getting Started ── */}
      {checklistLoaded && !allComplete && (
        <DarkCard className="p-4 border-l-2 !border-l-accent">
          <div className="flex items-center gap-2.5 mb-3">
            <Rocket className="h-4 w-4 text-accent flex-shrink-0" />
            <span className="text-sm font-semibold text-[var(--text-primary)] flex-1">Getting Started</span>
            <span className="text-[11px] text-white/30">{completedCount}/3</span>
          </div>
          <div className="space-y-2.5">
            {checklistSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {step.done ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent flex-shrink-0"><Check className="h-3 w-3 text-white" /></div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 flex-shrink-0" />
                )}
                {step.done ? (
                  <span className="text-xs text-white/25 line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className="text-xs text-accent hover:text-accent/80 font-medium flex items-center gap-1 transition-colors">
                    {step.icon} {step.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </DarkCard>
      )}

      {/* ── Stats Grid: 2x2 compact ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Earnings */}
        <DarkCard className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 mb-1">Earnings</p>
          <p className="text-2xl font-bold text-accent tabular-nums">{formatCurrency(filteredEarnings)}</p>
        </DarkCard>

        {/* Level */}
        <DarkCard className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 mb-1">Level {gam?.level ?? 0}</p>
          <p className="text-2xl font-bold text-accent">+{gam?.bonusPercent ?? 0}%</p>
        </DarkCard>

        {/* Streak */}
        <DarkCard className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 mb-1">Streak</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-bold text-accent tabular-nums">{gam?.currentStreak ?? 0}</p>
            <span className="text-xs text-white/25">days</span>
          </div>
        </DarkCard>

        {/* Bonus breakdown */}
        <DarkCard className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30 mb-1">Bonus</p>
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px]"><span className="text-white/25">Level</span><span className="text-white/50">+{gam?.levelBonus ?? 0}%</span></div>
            <div className="flex justify-between text-[11px]"><span className="text-white/25">Streak</span><span className="text-white/50">+{gam?.streakBonusPercent ?? 0}%</span></div>
            {gam?.isPWAUser && <div className="flex justify-between text-[11px]"><span className="text-white/25">App</span><span className="text-white/50">+{gam.pwaBonusPercent ?? 0}%</span></div>}
          </div>
        </DarkCard>
      </div>

      {/* ── Level + Streak info bar ── */}
      {gam && gam.level != null && (
        <DarkCard className="px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">
                Level {gam.level} — {levelName}
              </p>
              {gam.earningsToNextLevel > 0 && (
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${levelProgress}%` }} />
                  </div>
                  <span className="text-[11px] text-white/30 tabular-nums flex-shrink-0">{formatCurrency(gam.earningsToNextLevel)} to go</span>
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-accent tabular-nums">{gam.currentStreak}d <Flame className="h-4 w-4 text-accent inline-block -mt-0.5" /></p>
              {gam.nextStreakReward && (
                <p className="text-[11px] text-white/30">{gam.nextStreakReward.days - gam.currentStreak}d to +{gam.nextStreakReward.bonusPercent}%</p>
              )}
            </div>
          </div>
        </DarkCard>
      )}

      {/* ── Earnings Chart ── */}
      <DarkCard className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Earnings over time</h2>
          <div className="flex flex-wrap items-center gap-2">
            <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
            <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
          </div>
        </div>
        <EarningsChart clips={timeFilteredClips} filters={earningsFilters} days={timeframeDays} />
      </DarkCard>

      {/* ── Recent Clips ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Recent clips</h2>
          <Link href="/clips" className="text-xs text-accent hover:text-accent/80 transition-colors">View all</Link>
        </div>
        {recentClips.length === 0 ? (
          <DarkCard className="p-6">
            <EmptyState icon={<Film className="h-10 w-10" />} title="No clips yet" description="Submit your first clip to get started." />
          </DarkCard>
        ) : (
          <div className="space-y-1.5">
            {recentClips.map((clip: any) => (
              <DarkCard key={clip.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{clip.campaign?.name}</p>
                  <p className="text-xs text-white/25 truncate">{clip.clipAccount?.username} · {formatRelative(clip.createdAt)}</p>
                </div>
                <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent/80 flex-shrink-0 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  {clip.earnings > 0 && <span className="text-xs font-bold text-accent tabular-nums">{formatCurrency(clip.earnings)}</span>}
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
              </DarkCard>
            ))}
          </div>
        )}
      </div>

      {/* ── How to Earn More (collapsed) ── */}
      <DarkCard className="overflow-hidden">
        <button
          onClick={() => setShowTips(!showTips)}
          className="flex items-center justify-between w-full px-4 py-3 text-left cursor-pointer"
        >
          <span className="text-sm font-semibold text-[var(--text-primary)]">How to earn more</span>
          <ChevronDown className={`h-4 w-4 text-white/30 transition-transform ${showTips ? "rotate-180" : ""}`} />
        </button>
        {showTips && (
          <div className="px-4 pb-4 space-y-3">
            {[
              { icon: <Star className="h-4 w-4 text-accent" />, text: "Earn more to level up. Each level gives a permanent bonus that never resets." },
              { icon: <Flame className="h-4 w-4 text-accent" />, text: "Post daily to build your streak. A 90-day streak gives +10% bonus on all earnings." },
              { icon: <Film className="h-4 w-4 text-accent" />, text: "Join multiple campaigns and follow requirements exactly. Rejected clips waste time." },
              { icon: <Zap className="h-4 w-4 text-accent" />, text: "Refer friends. You earn 5% of their earnings forever. They get a reduced 4% fee." },
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-3 pl-3 border-l border-accent/20">
                <div className="mt-0.5 flex-shrink-0">{tip.icon}</div>
                <p className="text-sm text-white/50 leading-relaxed">{tip.text}</p>
              </div>
            ))}
          </div>
        )}
      </DarkCard>
    </div>
  );
}
