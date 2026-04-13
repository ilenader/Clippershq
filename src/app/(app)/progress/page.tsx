"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Award, Flame, Zap, Trophy, Users, Crown, TrendingUp, ChevronRight, ChevronDown, Clock, Check } from "lucide-react";

const LEVEL_TABLE = [
  { level: 0, earn: 0, bonus: 0, label: "$0", name: "Starter" },
  { level: 1, earn: 300, bonus: 3, label: "$300", name: "Rising" },
  { level: 2, earn: 1000, bonus: 6, label: "$1K", name: "Proven" },
  { level: 3, earn: 2500, bonus: 10, label: "$2.5K", name: "Expert" },
  { level: 4, earn: 8000, bonus: 15, label: "$8K", name: "Elite" },
  { level: 5, earn: 20000, bonus: 20, label: "$20K", name: "Legend" },
];

const STREAK_MILESTONES = [
  { days: 3, bonus: 1 },
  { days: 7, bonus: 2 },
  { days: 14, bonus: 3 },
  { days: 30, bonus: 5 },
  { days: 60, bonus: 7 },
  { days: 90, bonus: 10 },
];

function getCountdown(timezone: string | null): { hours: number; minutes: number } {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
    const minutesLeft = (23 - h) * 60 + (59 - m);
    return { hours: Math.floor(minutesLeft / 60), minutes: minutesLeft % 60 };
  } catch {
    return { hours: 0, minutes: 0 };
  }
}

export default function ProgressPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && (userRole === "ADMIN" || userRole === "OWNER")) {
      router.replace("/admin");
    }
  }, [session, userRole, router]);

  const [gam, setGam] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFull60, setShowFull60] = useState(false);
  const [showStreakHelp, setShowStreakHelp] = useState(false);
  const [countdown, setCountdown] = useState({ hours: 0, minutes: 0 });

  useEffect(() => {
    Promise.all([
      fetch("/api/gamification").then((r) => r.json()),
      fetch("/api/gamification?leaderboard=true").then((r) => r.json()).catch(() => []),
    ])
      .then(([gamData, lbData]) => { setGam(gamData); if (Array.isArray(lbData)) setLeaderboard(lbData); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Countdown timer — update every minute
  useEffect(() => {
    if (!gam) return;
    const tz = gam.userTimezone || null;
    setCountdown(getCountdown(tz));
    const interval = setInterval(() => setCountdown(getCountdown(tz)), 60_000);
    return () => clearInterval(interval);
  }, [gam]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  const level = gam?.level ?? 0;
  const bonusPercent = gam?.bonusPercent || 0;
  const streak = gam?.currentStreak || 0;
  const longestStreak = gam?.longestStreak || 0;
  const totalEarnings = gam?.totalEarnings || 0;
  const earningsToNext = gam?.earningsToNextLevel || 0;
  const streakReward = gam?.streakReward;
  const nextStreakReward = gam?.nextStreakReward;
  const streakDayStatuses: string[] = gam?.streakDayStatuses || [];
  const pendingStreakDays = gam?.pendingStreakDays || 0;

  const currentLevelData = LEVEL_TABLE[level] || LEVEL_TABLE[0];
  const nextLevelData = LEVEL_TABLE[level + 1];
  const levelProgress = nextLevelData
    ? Math.min(((totalEarnings - currentLevelData.earn) / (nextLevelData.earn - currentLevelData.earn)) * 100, 100)
    : 100;

  const streakDaysToShow = showFull60 ? 60 : 30;

  // Today's status (index 0)
  const todayStatus = streakDayStatuses[0] || "empty";
  const postedToday = todayStatus === "confirmed" || todayStatus === "pending";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Your Progress</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Level up, keep your streak, invite friends, and earn more.</p>
      </div>

      {/* ── Top summary ── */}
      <div className="grid gap-4 grid-cols-2">
        <Card className="border-accent/20 bg-accent/5 text-center py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Total Bonus</p>
          <p className="text-2xl sm:text-4xl font-bold text-accent mt-1">+{bonusPercent}%</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Applied to all your earnings</p>
        </Card>
        <Card className="text-center py-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Total Earned</p>
          <p className="text-2xl sm:text-4xl font-bold text-[var(--text-primary)] mt-1">{formatCurrency(totalEarnings)}</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">Lifetime approved earnings</p>
        </Card>
      </div>

      {/* ── Simple money example ── */}
      <Card className="border-accent/10">
        <div className="flex items-start gap-3">
          <TrendingUp className="h-5 w-5 text-accent mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">How your bonus affects your money</p>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              Say you earned <strong className="text-accent">$1,000</strong> this month:
            </p>
            <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-none">
              <li>With <strong className="text-accent">0%</strong> bonus → you keep <strong className="text-accent">$1,000</strong></li>
              <li>With <strong className="text-accent">10%</strong> bonus → you keep <strong className="text-accent">$1,100</strong></li>
              <li>With <strong className="text-accent">20%</strong> bonus → you keep <strong className="text-accent">$1,200</strong></li>
            </ul>
            <p className="text-sm text-[var(--text-secondary)] mt-2">Higher bonus = more money in your pocket. Levels and streaks both increase your bonus. Consistency matters!</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Level Progress ── */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
                <Award className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--text-primary)]">Level {level}</p>
                <p className="text-xs text-[var(--text-muted)]">{currentLevelData.name}</p>
              </div>
            </div>
            {bonusPercent > 0 && (
              <span className="rounded-full bg-accent/10 border border-accent/20 px-3 py-1 text-sm font-bold text-accent">+{bonusPercent}%</span>
            )}
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-5">
            Earn more to level up. Each level gives a <strong className="text-[var(--text-primary)]">permanent bonus</strong> that never resets, even if you take a break.
          </p>

          {/* Progress bar */}
          {nextLevelData ? (
            <div className="mb-5">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[var(--text-muted)]">Level {level}</span>
                <span className="text-accent font-medium">Level {level + 1}: {nextLevelData.label}</span>
              </div>
              <div className="h-3 rounded-full bg-[var(--bg-input)] border border-[var(--border-color)] overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.max(levelProgress, 2)}%` }} />
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1.5">
                {formatCurrency(totalEarnings)} / {formatCurrency(nextLevelData.earn)}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-emerald-400 mb-5 py-2">
              <Trophy className="h-5 w-5" /><span className="text-sm font-semibold">Maximum level reached!</span>
            </div>
          )}

          {/* Level roadmap */}
          <div className="space-y-1.5">
            {LEVEL_TABLE.map((t) => {
              const isUnlocked = level >= t.level;
              const isCurrent = level === t.level;
              return (
                <div key={t.level} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  isCurrent ? "bg-accent/10 border border-accent/20 shadow-sm" : isUnlocked ? "bg-accent/5" : ""
                }`}>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                    isCurrent ? "bg-accent text-white shadow-sm"
                    : isUnlocked ? "bg-accent/20 text-accent"
                    : "bg-[var(--bg-input)] text-[var(--text-muted)]"
                  }`}>{t.level}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isCurrent ? "text-accent" : isUnlocked ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{t.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{t.label} earned</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${isCurrent ? "text-accent" : isUnlocked ? "text-accent" : "text-[var(--text-muted)]"}`}>
                    {t.level > 0 ? `+${t.bonus}%` : "-"}
                  </span>
                  {isCurrent && <ChevronRight className="h-4 w-4 text-accent flex-shrink-0" />}
                </div>
              );
            })}
          </div>

          {earningsToNext > 0 && (
            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                <strong className="text-accent">{formatCurrency(earningsToNext)}</strong> more to reach <strong className="text-[var(--text-primary)]">Level {level + 1}</strong>
              </p>
            </div>
          )}
        </Card>

        {/* ── Streak ── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Flame className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{streak}-Day Streak</h2>
            {streakReward && <span className="rounded-full bg-accent/10 border border-accent/20 px-2.5 py-0.5 text-xs font-bold text-accent">+{streakReward.bonusPercent}%</span>}
          </div>

          {/* Countdown timer */}
          <div className="mb-4 rounded-xl border border-[var(--border-color)] px-4 py-3 text-center">
            {todayStatus === "confirmed" ? (
              <p className="text-sm sm:text-base font-medium text-accent">
                <Check className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                Streak safe for today!
              </p>
            ) : todayStatus === "pending" ? (
              <p className="text-sm sm:text-base font-medium text-amber-400">
                <Clock className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                Clip submitted — waiting for review. Your streak is safe while pending.
              </p>
            ) : (
              <p className="text-base sm:text-lg font-semibold text-accent">
                <Clock className="h-4 w-4 sm:h-5 sm:w-5 inline-block mr-1 -mt-0.5" />
                {countdown.hours}h {countdown.minutes}m left to post today
              </p>
            )}
          </div>

          {/* Collapsible "How streaks work" */}
          <button
            onClick={() => setShowStreakHelp(!showStreakHelp)}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer mb-3"
          >
            {showStreakHelp ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            How streaks work
          </button>
          {showStreakHelp && (
            <div className="mb-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-secondary)] space-y-3">
              <p>Post at least 1 clip every day to build your streak. Higher streaks = bigger bonus on <strong className="text-[var(--text-primary)]">ALL</strong> your earnings.</p>
              <div>
                <p className="font-medium text-[var(--text-primary)] mb-1">How it works:</p>
                <ul className="space-y-1 text-xs list-none">
                  <li>• Submit a clip before your day ends (see the countdown above)</li>
                  <li>• Your clip gets reviewed by our team</li>
                  <li>• If approved — your streak day is <strong className="text-[var(--text-primary)]">locked in forever</strong></li>
                  <li>• If rejected — you can submit another clip before the day ends</li>
                  <li>• If ALL your clips for a day are rejected and the day is over — streak resets</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-[var(--text-primary)] mb-1">Tips:</p>
                <ul className="space-y-1 text-xs list-none">
                  <li>• Submit 2-3 clips per day to be safe — if one gets rejected, the others can save your streak</li>
                  <li>• Follow campaign requirements carefully to avoid rejections</li>
                  <li>• If none of your campaigns are active, your streak automatically freezes — no penalty</li>
                </ul>
              </div>
              <p className="text-xs text-[var(--text-muted)]">Your streak bonus applies to ALL your earnings across ALL campaigns. A 5% bonus at 30 days means an extra $50 on every $1,000 you earn.</p>
            </div>
          )}

          {/* Streak progress grid — day 1 = first streak day, counting toward milestones */}
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5 mb-1">
            {Array.from({ length: streakDaysToShow }, (_, i) => {
              const dayNumber = i + 1;
              const milestone = STREAK_MILESTONES.find((m) => m.days === dayNumber);
              const isCompleted = dayNumber <= streak;
              const isTodayCell = postedToday
                ? dayNumber === streak // posted today: today = last completed day
                : dayNumber === streak + 1; // not posted: today = next day to fill

              let bgClass = "";
              let content: React.ReactNode = null;

              if (isCompleted) {
                // Completed streak day
                bgClass = milestone ? "bg-accent border-accent" : "bg-accent/60 border-accent/60";
                content = milestone
                  ? <span className="text-[10px] sm:text-[11px] font-extrabold text-white">+{milestone.bonus}%</span>
                  : <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />;
              } else {
                // Upcoming day
                bgClass = "border-[var(--border-color)] bg-[var(--bg-card)]";
                content = milestone
                  ? <span className="text-[10px] sm:text-[11px] font-bold text-accent">+{milestone.bonus}%</span>
                  : <span className="text-[11px] text-[var(--text-muted)]">{dayNumber}</span>;
              }

              return (
                <div
                  key={i}
                  title={isTodayCell ? "Today" : isCompleted ? `Day ${dayNumber} — completed` : milestone ? `Day ${dayNumber}: +${milestone.bonus}% streak bonus` : `Day ${dayNumber}`}
                  className={`relative flex items-center justify-center h-7 w-7 sm:h-8 sm:w-auto rounded-lg border font-bold transition-all ${bgClass} ${
                    isTodayCell
                      ? `ring-2 ring-accent ring-offset-1 ring-offset-[var(--bg-page)] ${!postedToday ? "animate-pulse" : ""}`
                      : ""
                  }`}
                >
                  {content}
                  {isTodayCell && (
                    <span className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 text-[8px] sm:text-[9px] font-bold text-accent leading-none">
                      TODAY
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-1.5 mt-5 mb-2 text-[10px] sm:text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent/60" /> Completed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500/30 border border-amber-500/50" /> Under review</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[var(--bg-card)] border border-[var(--border-color)]" /> Upcoming</span>
          </div>

          {/* Toggle 30/60 days */}
          <button
            onClick={() => setShowFull60(!showFull60)}
            className="flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer mb-4"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showFull60 ? "rotate-180" : ""}`} />
            {showFull60 ? "Show 30 days" : "Show 60 days"}
          </button>

          {/* Milestone summary */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {STREAK_MILESTONES.map((m) => (
              <div key={m.days} className={`rounded-xl border px-2 py-2 text-center ${streak >= m.days ? "border-accent/30 bg-accent/10" : "border-[var(--border-color)]"}`}>
                <p className="text-sm sm:text-base font-bold text-[var(--text-primary)]">{m.days}d</p>
                <p className="text-xs font-bold text-accent">+{m.bonus}%</p>
              </div>
            ))}
          </div>

          {nextStreakReward && streak < nextStreakReward.days && (
            <p className="text-sm text-[var(--text-secondary)] mt-3 text-center">
              <strong className="text-accent">{nextStreakReward.days - streak}</strong> more day{nextStreakReward.days - streak !== 1 ? "s" : ""} to unlock <strong className="text-accent">+{nextStreakReward.bonusPercent}%</strong>
            </p>
          )}
          {longestStreak > streak && (
            <p className="text-xs text-[var(--text-muted)] mt-2 text-center">Your best: {longestStreak} days</p>
          )}
        </Card>
      </div>

      {/* ── Leaderboard ── */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <Crown className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Top Earners</h2>
          <span className="text-xs text-[var(--text-muted)] ml-auto">Last 30 days</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">Leaderboard coming soon. Keep posting to get ranked!</p>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry: any, i: number) => {
              const rankBg = i === 0 ? "bg-accent/15 border border-accent/30"
                : i === 1 ? "bg-accent/8 border border-accent/20"
                : i === 2 ? "bg-accent/5 border border-accent/15"
                : "border border-[var(--border-color)]";
              return (
                <div key={i} className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${rankBg}`}>
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-accent text-white font-bold text-lg flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{entry.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{(entry.views || 0).toLocaleString()} views</p>
                  </div>
                  <p className="text-lg font-bold text-accent">{formatCurrency(entry.earnings || 0)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── How to Earn More ── */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">How to Earn More</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">Every percentage point directly affects how much money you take home.</p>
        <div className="space-y-4">
          {[
            { icon: <Award className="h-5 w-5 text-accent" />, title: "Earn more → Level up → Permanent bonus", body: <>Your level is based on total lifetime earnings. Each level gives a permanent bonus that <strong>never resets</strong>. Reach Level 5 at $20,000 for <strong className="text-accent">+20%</strong>.</> },
            { icon: <Flame className="h-5 w-5 text-accent" />, title: "Post daily → Build streak → Extra bonus", body: <>Get at least 1 approved clip every day. A 60-day streak gives <strong className="text-accent">+9%</strong> bonus on top of your level bonus. Miss a day and the streak bonus resets.</> },
            { icon: <Users className="h-5 w-5 text-accent" />, title: "Invite friends → Passive income", body: <>Share your referral link. You earn <strong className="text-accent">5%</strong> of every referred user's approved earnings, forever.</> },
            { icon: <Zap className="h-5 w-5 text-accent" />, title: "Stay consistent → Maximize earnings", body: <>Level + streak combined can reach up to <strong className="text-accent">+25%</strong> or more. On a $1,000 payout, that's <strong className="text-accent">$250 extra</strong>. Stay consistent and keep climbing.</> },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</p>
                <p className="text-sm text-[var(--text-secondary)]">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
