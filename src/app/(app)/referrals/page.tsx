"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { Users, Copy, Check, Trophy, Share2, UserPlus, DollarSign } from "lucide-react";
import { toast } from "@/lib/toast";

export default function ReferralsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole === "ADMIN") {
      router.replace("/admin/referrals");
    }
  }, [session, userRole, router]);

  const [ref, setRef] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }; }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/referrals").then((r) => r.json()),
      fetch("/api/referrals?leaderboard=true").then((r) => r.json()).catch(() => []),
    ])
      .then(([refData, lbData]) => {
        setRef(refData);
        if (Array.isArray(lbData)) setLeaderboard(lbData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyLink = () => {
    if (!ref?.referralCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/login?ref=${ref.referralCode}`);
    setCopied(true);
    toast.success("Referral link copied!");
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  const referrals: any[] = ref?.referrals || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Referrals</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Invite friends, earn passive income.</p>
      </div>

      {/* ── Invite Card ── */}
      <Card className="border-accent/20 bg-accent/5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invite & Earn</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Share your link. Earn <strong className="text-accent">5%</strong> of every referred user's approved earnings, forever.
          Referred users also get a reduced platform fee (<strong className="text-accent">4%</strong> instead of 9%).
        </p>
        {ref?.referralCode && (
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 rounded-xl border border-accent/20 bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-primary)] truncate font-mono">
              {typeof window !== "undefined" ? `${window.location.origin}/login?ref=${ref.referralCode}` : ref.referralCode}
            </div>
            <button onClick={copyLink} className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-all cursor-pointer">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <div className="grid gap-4 grid-cols-2">
          <div className="rounded-xl border border-accent/20 px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Invited</p>
            <p className="text-3xl lg:text-4xl font-bold text-[var(--text-primary)] mt-1">{ref?.referralCount || 0}</p>
          </div>
          <div className="rounded-xl border border-accent/20 px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Referral Earnings</p>
            <p className="text-3xl lg:text-4xl font-bold text-accent mt-1">{formatCurrency(ref?.referralEarnings || 0)}</p>
          </div>
        </div>
      </Card>

      {/* ── How It Works ── */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">How It Works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: <Share2 className="h-5 w-5 text-white" />, title: "Share your link", desc: "Send your unique link to friends or post it on social media" },
            { icon: <UserPlus className="h-5 w-5 text-white" />, title: "They sign up & clip", desc: "When someone signs up through your link and starts earning" },
            { icon: <DollarSign className="h-5 w-5 text-white" />, title: "You earn 5% forever", desc: "You automatically get 5% of their approved earnings, forever" },
          ].map((step, i) => (
            <Card key={i}>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent flex-shrink-0">
                  {step.icon}
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</p>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{step.desc}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Top Referrers Leaderboard ── */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <Trophy className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Top Referrers</h2>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">No referrers yet. Be the first to invite someone!</p>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry: any, i: number) => {
              const rankBg = i === 0 ? "bg-accent/15 border border-accent/30"
                : i === 1 ? "bg-accent/8 border border-accent/20"
                : i === 2 ? "bg-accent/5 border border-accent/15"
                : "border border-[var(--border-color)]";
              return (
                <div key={entry.userId} className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${rankBg}`}>
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-accent text-white font-bold text-lg flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-semibold text-[var(--text-primary)]">{entry.username}</p>
                    <p className="text-xs text-[var(--text-muted)]">{entry.referralCount} invited</p>
                  </div>
                  <p className="text-lg font-bold text-accent">{formatCurrency(entry.referralEarnings)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── My Referrals ── */}
      <Card>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Your Referrals</h2>
        {referrals.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" />}
            title="No referrals yet"
            description="Share your link above to start earning passive income!"
          />
        ) : (
          <div className="space-y-2">
            {referrals.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-[var(--border-color)] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{r.username}</p>
                  <p className="text-xs text-[var(--text-muted)]">Joined {formatRelative(r.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-accent">{formatCurrency(r.totalEarnings * 0.05)}</p>
                  <p className="text-xs text-[var(--text-muted)]">from {formatCurrency(r.totalEarnings)} earned</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
