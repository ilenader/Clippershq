"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Users, Copy, Check, ChevronDown } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/utils";

export default function AdminReferralsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole === "CLIPPER") {
      router.replace("/dashboard");
    }
  }, [session, userRole, router]);

  const [ref, setRef] = useState<any>(null);
  const [adminData, setAdminData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { return () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }; }, []);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetches = [
      fetch("/api/referrals").then((r) => r.json()),
    ];
    // Owner gets full admin view
    if (userRole === "OWNER") {
      fetches.push(fetch("/api/referrals?admin=true").then((r) => r.json()));
    }
    Promise.all(fetches)
      .then(([refData, admin]) => {
        setRef(refData);
        if (admin) setAdminData(admin);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userRole]);

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

  const totals = adminData?.platformTotals || { totalReferrals: 0, totalReferralEarnings: 0, totalReferrers: 0 };
  const allReferrers: any[] = adminData?.allReferrers || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Referrals</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Your referral link and platform-wide referral analytics.</p>
      </div>

      {/* Section 1: Your referral link */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Your Referral Link</h2>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Share your link. Earn <strong className="text-accent">5%</strong> of every referred user's approved earnings, forever.
        </p>
        {ref?.referralCode && (
          <div className="flex items-center gap-2 mb-5">
            <div className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-primary)] truncate font-mono">
              {typeof window !== "undefined" ? `${window.location.origin}/login?ref=${ref.referralCode}` : ref.referralCode}
            </div>
            <button onClick={copyLink} className="flex items-center gap-1.5 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-all cursor-pointer">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
        <div className="grid gap-4 grid-cols-2">
          <div className="rounded-xl border border-[var(--border-color)] px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">You Invited</p>
            <p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{ref?.referralCount || 0}</p>
          </div>
          <div className="rounded-xl border border-[var(--border-color)] px-4 py-4 text-center">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Your Referral Earnings</p>
            <p className="text-3xl font-bold text-accent mt-1">{formatCurrency(ref?.referralEarnings || 0)}</p>
          </div>
        </div>
      </Card>

      {/* Section 2: Platform overview (Owner only) */}
      {userRole === "OWNER" && (
        <>
          {/* Stats cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Total Referrers</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{totals.totalReferrers}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">users who invited someone</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Total Referred Users</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{totals.totalReferrals}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">joined via referral link</p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Total Referral Earnings</p>
              <p className="mt-2 text-3xl font-bold text-accent">{formatCurrency(totals.totalReferralEarnings)}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">5% commissions paid out</p>
            </Card>
          </div>

          {/* All referrers table */}
          <Card>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">All Referrers</h2>
            {allReferrers.length === 0 ? (
              <EmptyState icon={<Users className="h-10 w-10" />} title="No referrals on the platform yet" description="Once users start inviting others, they'll appear here." />
            ) : (
              <div className="space-y-2">
                {allReferrers.map((referrer: any, i: number) => (
                  <div key={referrer.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === referrer.id ? null : referrer.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-all cursor-pointer ${
                        i === 0 ? "border-accent/20 bg-accent/5" : "border-[var(--border-color)] hover:bg-[var(--bg-card-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {referrer.image ? (
                            <img src={referrer.image} alt="" className="h-8 w-8 rounded-full" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                              {(referrer.username || "?")[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-primary)]">{referrer.username}</p>
                            <p className="text-xs text-[var(--text-muted)]">Code: {referrer.referralCode || "—"} · {referrer.referralCount} invited</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-accent">{formatCurrency(referrer.referralEarnings)}</p>
                          <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${expanded === referrer.id ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </button>

                    {/* Expanded: referred users */}
                    {expanded === referrer.id && referrer.referrals.length > 0 && (
                      <div className="ml-6 mt-1 space-y-1 border-l-2 border-accent/20 pl-4 pb-2">
                        {referrer.referrals.map((r: any) => (
                          <div key={r.id} className="flex items-center justify-between rounded-lg bg-[var(--bg-input)] px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-[var(--text-primary)]">{r.username}</p>
                              <p className="text-xs text-[var(--text-muted)]">
                                Joined {formatRelative(r.createdAt)} · {formatNumber(r.totalViews)} views · {r.clipCount} clips
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-accent">{formatCurrency(r.totalEarnings * 0.05)}</p>
                              <p className="text-xs text-[var(--text-muted)]">from {formatCurrency(r.totalEarnings)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
