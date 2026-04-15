"use client";

import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useEffect, useState, useCallback } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { Film, DollarSign, Flame, Star, Rocket, Check, UserCircle, Megaphone, Clock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hapticMedium } from "@/lib/haptics";

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") router.replace("/admin");
  }, [session, userRole, router]);

  const [allClips, setAllClips] = useState<any[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamification, setGamification] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasJoinedCampaign, setHasJoinedCampaign] = useState(false);
  const [checklistLoaded, setChecklistLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/gamification").then((r) => r.json()).catch(() => null),
      fetch("/api/accounts/mine").then((r) => r.json()).catch(() => []),
      fetch("/api/campaign-accounts").then((r) => r.json()).catch(() => []),
      fetch("/api/campaigns").then((r) => r.json()).catch(() => []),
    ]).then(([gamData, accounts, joins, camps]) => {
      if (gamData) setGamification(gamData);
      setHasAccounts(Array.isArray(accounts) && accounts.length > 0);
      setHasJoinedCampaign(Array.isArray(joins) && joins.length > 0);
      setChecklistLoaded(true);
      if (Array.isArray(camps)) setCampaigns(camps.filter((c: any) => c.status === "ACTIVE").slice(0, 5));
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
        setEarnings(earningsData);
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

  const hasClips = allClips.length > 0;
  const checklistSteps = [
    { done: hasAccounts, label: "Add your account", href: "/accounts", icon: <UserCircle className="h-4 w-4" /> },
    { done: hasJoinedCampaign, label: "Join a campaign", href: "/campaigns", icon: <Megaphone className="h-4 w-4" /> },
    { done: hasClips, label: "Submit your first clip", href: "/clips", icon: <Film className="h-4 w-4" /> },
  ];
  const completedCount = checklistSteps.filter((s) => s.done).length;
  const allComplete = completedCount === 3;

  if (loading && allClips.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const g = gamification;
  const totalEarned = earnings?.approvedEarnings ?? 0;
  const available = earnings?.available ?? 0;
  const lockedInPayouts = earnings?.lockedInPayouts ?? 0;
  const levelNames = ["Rookie", "Clipper", "Creator", "Influencer", "Viral", "Icon"];
  const levelName = g ? (levelNames[g.level] || "") : "";
  const levelProgress = g?.nextLevelAt > 0 ? Math.min((g.totalEarnings / g.nextLevelAt) * 100, 100) : 100;

  // Streak countdown
  const todayStatus = g?.streakDayStatuses?.[0] || "empty";
  const postedToday = todayStatus === "confirmed" || todayStatus === "pending";

  // Campaigns needing clips today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const campaignsPostedToday = new Set(
    allClips.filter((c: any) => new Date(c.createdAt) >= todayStart).map((c: any) => c.campaignId)
  );
  const todayClips = allClips.filter((c: any) => new Date(c.createdAt) >= todayStart);
  const clipsToday = todayClips.length;
  const clipsApprovedToday = todayClips.filter((c: any) => c.status === "APPROVED").length;
  const clipsPendingToday = todayClips.filter((c: any) => c.status === "PENDING").length;

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">
          Welcome back, {session?.user?.name?.split(" ")[0] || "Clipper"}
        </h1>
        {campaignOptions.length > 0 && (
          <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={handleCampaignChange} allLabel="All" />
        )}
      </div>

      {/* ── Getting Started ── */}
      {checklistLoaded && !allComplete && (
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] border-l-2 border-l-accent p-4">
          <div className="flex items-center gap-2 mb-3">
            <Rocket className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-[var(--text-primary)] flex-1">Getting Started</span>
            <span className="text-[11px] text-[var(--text-muted)]">{completedCount}/3</span>
          </div>
          <div className="space-y-2">
            {checklistSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5">
                {step.done ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent flex-shrink-0"><Check className="h-3 w-3 text-white" /></div>
                ) : (
                  <div className="h-5 w-5 rounded-full border border-[var(--border-color)] flex-shrink-0" />
                )}
                {step.done ? (
                  <span className="text-xs text-[var(--text-muted)] line-through">{step.label}</span>
                ) : (
                  <Link href={step.href} className="text-xs text-accent font-medium flex items-center gap-1">{step.icon} {step.label}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Earnings Hero ── */}
      <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)] mb-2">Total Earnings</p>
        <p className="text-4xl sm:text-5xl lg:text-6xl font-bold text-accent tabular-nums tracking-tight">{formatCurrency(totalEarned)}</p>
        {g && g.bonusPercent > 0 && (
          <p className="text-sm lg:text-base text-[var(--text-secondary)] mt-2">
            <span className="text-accent font-semibold">+{g.bonusPercent}%</span> bonus
            <span className="text-[var(--text-muted)] ml-1.5">Level +{g.levelBonus || 0}% · Streak +{g.streakBonusPercent || 0}%{g.isPWAUser ? ` · App +${g.pwaBonusPercent || 0}%` : ""}</span>
          </p>
        )}
      </div>

      {/* ── Status Grid 2x2 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Level */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 lg:p-6 text-center">
          <Star className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Level</p>
          <p className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Level {g?.level ?? 0}</p>
          <p className="text-sm text-[var(--text-muted)]">{levelName} · +{g?.levelBonus ?? 0}%</p>
          {g?.earningsToNextLevel > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-[var(--bg-input)] rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${levelProgress}%` }} />
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 tabular-nums">{formatCurrency(g.earningsToNextLevel)} to Level {g.level + 1}</p>
            </div>
          )}
        </div>

        {/* Streak */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 lg:p-6 text-center">
          <Flame className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Streak</p>
          <p className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tabular-nums">{g?.currentStreak ?? 0} <span className="text-sm font-normal text-[var(--text-muted)]">days</span></p>
          {g?.streakBonusPercent > 0 && (
            <p className="text-sm text-accent font-medium">+{g.streakBonusPercent}% bonus</p>
          )}
          {postedToday ? (
            <p className="text-sm text-emerald-400 mt-0.5"><Check className="h-3.5 w-3.5 inline-block -mt-0.5 mr-0.5" /> Posted today</p>
          ) : (
            <p className="text-sm text-accent mt-0.5">Post to keep streak</p>
          )}
        </div>

        {/* Clips Today */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 lg:p-6 text-center">
          <Film className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Clips Today</p>
          <p className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tabular-nums">{clipsToday}</p>
          {clipsApprovedToday > 0 && (
            <p className="text-sm text-emerald-400">{clipsApprovedToday} approved</p>
          )}
          {clipsPendingToday > 0 && clipsApprovedToday === 0 && (
            <p className="text-sm text-amber-400">{clipsPendingToday} pending</p>
          )}
        </div>

        {/* Payout */}
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-4 lg:p-6 text-center">
          <DollarSign className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-1">Available</p>
          <p className="text-2xl lg:text-3xl font-bold text-accent tabular-nums">{formatCurrency(available)}</p>
          {lockedInPayouts > 0 && (
            <p className="text-sm text-amber-400">{formatCurrency(lockedInPayouts)} pending</p>
          )}
        </div>
      </div>

      {/* ── Submit CTA (mobile position) ── */}
      <div className="my-2 lg:hidden">
        <Link href="/clips?submit=true" onClick={() => hapticMedium()} className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-hover/90 active:scale-[0.97] text-white font-bold py-3.5 text-center transition-all duration-150 shadow-sm">
          <Film className="h-5 w-5" /> Submit a Clip
        </Link>
      </div>

      {/* ── Desktop Extra Stats ── */}
      <div className="hidden lg:grid grid-cols-3 gap-4 mt-2">
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 text-center">
          <Film className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">Lifetime Clips</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{allClips.length}</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 text-center">
          <Flame className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">Best Streak</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{g?.longestStreak ?? 0}d</p>
        </div>
        <div className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] p-6 text-center">
          <Megaphone className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">Campaigns Joined</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{campaigns.length}</p>
        </div>
      </div>

      {/* ── Submit CTA (desktop position — after extra stats) ── */}
      <div className="hidden lg:block my-2 max-w-lg mx-auto">
        <Link href="/clips?submit=true" onClick={() => hapticMedium()} className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-hover/90 active:scale-[0.97] text-white font-bold py-5 text-lg text-center transition-all duration-150 shadow-sm">
          <Film className="h-5 w-5" /> Submit a Clip
        </Link>
      </div>

    </div>
  );
}
