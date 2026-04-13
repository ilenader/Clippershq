"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { formatCurrency, formatNumber, formatRelative } from "@/lib/utils";
import { ArrowLeft, Star, Flame, Users, Zap, Film, DollarSign, ExternalLink, Shield, Percent, ShieldOff, ChevronDown, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";

export default function UserProfilePage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframeDays, setTimeframeDays] = useState(15);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [showBanModal, setShowBanModal] = useState(false);
  const [banConfirmText, setBanConfirmText] = useState("");
  const [banning, setBanning] = useState(false);
  const [campDropOpen, setCampDropOpen] = useState(false);
  const [showStreakRestore, setShowStreakRestore] = useState(false);
  const [restoreDays, setRestoreDays] = useState("");
  const [restoreReason, setRestoreReason] = useState("Review delayed");
  const [restoring, setRestoring] = useState(false);
  const campDropRef = useRef<HTMLDivElement>(null);

  const currentUserId = session?.user?.id;
  const currentUserRole = (session?.user as any)?.role;
  const isOwner = currentUserRole === "OWNER";
  const isViewingOwnProfile = currentUserId === id;

  const loadUser = () => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => r.json())
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUser(); }, [id]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (campDropRef.current && !campDropRef.current.contains(e.target as Node)) setCampDropOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!user || user.error) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--text-muted)]">User not found.</p>
      </div>
    );
  }

  const roleBadge: Record<string, string> = { CLIPPER: "active", ADMIN: "pending", OWNER: "rejected" };
  const allClips = user.clips || [];
  const campaignScoped = selectedCampaignId
    ? allClips.filter((c: any) => c.campaignId === selectedCampaignId)
    : allClips;
  const filteredClips = filterByTimeframe(campaignScoped, timeframeDays);
  const filteredApproved = filteredClips.filter((c: any) => c.status === "APPROVED");
  const filteredPending = filteredClips.filter((c: any) => c.status === "PENDING");
  const filteredRejected = filteredClips.filter((c: any) => c.status === "REJECTED");
  const filteredEarnings = filteredApproved.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const filteredViews = filteredClips.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0);

  // Unique campaigns this user joined (for filter dropdown)
  const userCampaigns: { id: string; name: string }[] = [];
  const seenCampaigns = new Set<string>();
  for (const c of allClips) {
    if (c.campaignId && c.campaign?.name && !seenCampaigns.has(c.campaignId)) {
      seenCampaigns.add(c.campaignId);
      userCampaigns.push({ id: c.campaignId, name: c.campaign.name });
    }
  }
  // Also include campaigns from user.campaigns if available
  for (const c of (user.campaigns || [])) {
    if (c.id && c.name && !seenCampaigns.has(c.id)) {
      seenCampaigns.add(c.id);
      userCampaigns.push({ id: c.id, name: c.name });
    }
  }

  // Per-campaign payout calculations
  const payoutRequests: any[] = user.payoutRequests || [];
  const scopedPayouts = selectedCampaignId
    ? payoutRequests.filter((p: any) => p.campaignId === selectedCampaignId)
    : payoutRequests;
  const getEffectiveAmount = (p: any) => p.finalAmount != null ? p.finalAmount : p.feeAmount != null ? p.amount - p.feeAmount : p.amount * 0.91;
  const filteredPaidOut = scopedPayouts.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + getEffectiveAmount(p), 0);
  const filteredPendingPayout = scopedPayouts.filter((p: any) => ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status)).reduce((s: number, p: any) => s + getEffectiveAmount(p), 0);
  const filteredUnpaid = Math.max(Math.round((filteredEarnings - filteredPaidOut - filteredPendingPayout) * 100) / 100, 0);

  // Per-account views (keyed by clipAccountId which matches clipAccounts[].id)
  const accountViewsMap: Record<string, number> = {};
  for (const clip of allClips) {
    if (clip.clipAccountId && clip.stats?.[0]?.views) {
      accountViewsMap[clip.clipAccountId] = (accountViewsMap[clip.clipAccountId] || 0) + (clip.stats[0].views || 0);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <button onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* ── Header ── */}
      <div className="flex items-center gap-4 sm:gap-5">
        {user.image ? (
          <img src={user.image} alt="" className="h-14 w-14 sm:h-16 sm:w-16 rounded-full flex-shrink-0" />
        ) : (
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-xl font-bold text-accent">
            {(user.username || "?")[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">{user.name || user.username}</h1>
            <Badge variant={roleBadge[user.role] as any}>{user.role}</Badge>
            {user.isReferred && (
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">Referred</span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{user.email || "No email"}</p>
          {user.discordId && <p className="text-xs text-[var(--text-muted)]">Discord: {user.discordId}</p>}
          <p className="text-xs text-[var(--text-muted)]">Joined {formatRelative(user.createdAt)}</p>
        </div>
      </div>

      {/* ── Gamification Summary ── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="border-accent/20 bg-accent/5">
          <div className="flex items-center gap-1.5 mb-1"><Percent className="h-3.5 w-3.5 text-accent" /><span className="text-xs text-[var(--text-muted)]">Total Bonus</span></div>
          <p className="text-2xl font-bold text-accent">+{user.effectiveBonusPercent ?? 0}%</p>
          <p className="text-xs text-[var(--text-muted)]">Level + streak combined</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-emerald-400" /><span className="text-xs text-[var(--text-muted)]">Payout Fee</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{user.effectiveFeePercent ?? 9}%</p>
          <p className="text-xs text-[var(--text-muted)]">{user.isReferred ? "Referred rate" : "Standard rate"}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><Star className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs text-[var(--text-muted)]">Level</span></div>
          <p className="text-2xl font-bold text-accent">L{user.level ?? 0}</p>
          <p className="text-xs text-[var(--text-muted)]">+{user.bonusPercentage || 0}% level bonus</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><Flame className="h-3.5 w-3.5 text-orange-400" /><span className="text-xs text-[var(--text-muted)]">Streak</span></div>
          <p className="text-2xl font-bold text-accent">{user.currentStreak || 0}d</p>
          <p className="text-xs text-[var(--text-muted)]">Best: {user.longestStreak || 0}d</p>
          {isOwner && !isViewingOwnProfile && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => { setShowStreakRestore(true); setRestoreDays(""); setRestoreReason("Review delayed"); }} icon={<RotateCcw className="h-3 w-3" />}>
              Restore Streak
            </Button>
          )}
        </Card>
      </div>

      {/* ── Referral & Trust ── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><Users className="h-3.5 w-3.5 text-accent" /><span className="text-xs text-[var(--text-muted)]">Referrals</span></div>
          <p className="text-2xl font-bold text-accent">{user.referrals?.length || 0}</p>
          {user.referrer && <p className="text-xs text-[var(--text-muted)]">Invited by: {user.referrer.username}</p>}
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><Shield className="h-3.5 w-3.5 text-emerald-400" /><span className="text-xs text-[var(--text-muted)]">Trust Score</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{user.trustScore || 0}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-accent" /><span className="text-xs text-[var(--text-muted)]">Lifetime Earnings</span></div>
          <p className="text-2xl font-bold text-accent">{formatCurrency(user.totalEarnings || 0)}</p>
        </Card>
      </div>

      {user.manualBonusOverride != null && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5">
          <p className="text-sm text-blue-400">Manual bonus override active: <strong>{user.manualBonusOverride}%</strong></p>
        </div>
      )}

      {/* ── Ban / Unban controls (owner only, not own profile) ── */}
      {!isViewingOwnProfile && (
        <div className="flex items-center gap-3">
          {user.status === "BANNED" ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 flex-1">
                <ShieldOff className="h-4 w-4 text-red-400" />
                <p className="text-sm text-red-400 font-medium">This user is permanently banned.</p>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!confirm("Unban this user? They will be able to log in and use the platform again.")) return;
                  setBanning(true);
                  try {
                    const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ACTIVE" }) });
                    if (!res.ok) throw new Error((await res.json()).error || "Failed");
                    toast.success("User unbanned.");
                    loadUser();
                  } catch (err: any) { toast.error(err.message); }
                  setBanning(false);
                }}
                loading={banning}
              >
                Unban User
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              size="sm"
              onClick={() => { setShowBanModal(true); setBanConfirmText(""); }}
              icon={<ShieldOff className="h-3.5 w-3.5" />}
            >
              Ban User
            </Button>
          )}
        </div>
      )}

      {/* Ban confirmation modal */}
      <Modal open={showBanModal} onClose={() => setShowBanModal(false)} title="Ban user" className="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
            <p className="text-sm text-red-400">
              This will permanently ban <strong className="text-[var(--text-primary)]">{user.username || user.name}</strong>. They won&apos;t be able to log in again.
            </p>
          </div>
          <Input
            id="banConfirm"
            label='Type "BAN" to confirm'
            placeholder="BAN"
            value={banConfirmText}
            onChange={(e) => setBanConfirmText(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowBanModal(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={banConfirmText !== "BAN"}
              loading={banning}
              onClick={async () => {
                setBanning(true);
                try {
                  const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "BANNED" }) });
                  if (!res.ok) throw new Error((await res.json()).error || "Failed");
                  toast.success("User banned.");
                  setShowBanModal(false);
                  loadUser();
                } catch (err: any) { toast.error(err.message); }
                setBanning(false);
              }}
            >
              Permanently Ban
            </Button>
          </div>
        </div>
      </Modal>

      {/* Restore Streak modal */}
      <Modal open={showStreakRestore} onClose={() => setShowStreakRestore(false)} title="Restore streak" className="max-w-md">
        <div className="space-y-4">
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Current streak: <strong className="text-accent">{user.currentStreak || 0} days</strong>
            </p>
            {user.lastActiveDate && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Last active: {formatRelative(user.lastActiveDate)}
              </p>
            )}
          </div>
          <Input
            id="restoreDays"
            label={`Restore to day (max: ${user.longestStreak || 30})`}
            type="number"
            min="1"
            max={user.longestStreak || 30}
            placeholder="e.g. 14"
            value={restoreDays}
            onChange={(e) => setRestoreDays(e.target.value)}
          />
          <div>
            <label htmlFor="restoreReason" className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Reason</label>
            <select
              id="restoreReason"
              value={restoreReason}
              onChange={(e) => setRestoreReason(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="Review delayed">Review delayed</option>
              <option value="System error">System error</option>
              <option value="Owner decision">Owner decision</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowStreakRestore(false)}>Cancel</Button>
            <Button
              loading={restoring}
              disabled={!restoreDays || parseInt(restoreDays) < 1 || parseInt(restoreDays) > (user.longestStreak || 30)}
              onClick={async () => {
                setRestoring(true);
                try {
                  const res = await fetch(`/api/admin/users/${id}/restore-streak`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ days: parseInt(restoreDays), reason: restoreReason }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Failed");
                  toast.success(`Streak restored to ${data.newStreak} days`);
                  setShowStreakRestore(false);
                  loadUser();
                } catch (err: any) {
                  toast.error(err.message || "Failed to restore streak.");
                }
                setRestoring(false);
              }}
              icon={<RotateCcw className="h-4 w-4" />}
            >
              Restore Streak
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Timeframe-filtered Stats ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Activity</h2>
        <div className="flex items-center gap-2">
          {userCampaigns.length > 1 && (
            <div className="relative" ref={campDropRef}>
              <button
                onClick={() => setCampDropOpen(!campDropOpen)}
                className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
              >
                <span className="text-[var(--text-muted)]">Campaign:</span>
                {selectedCampaignId ? userCampaigns.find((c) => c.id === selectedCampaignId)?.name || "Unknown" : "All Campaigns"}
                <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${campDropOpen ? "rotate-180" : ""}`} />
              </button>
              {campDropOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] sm:min-w-[220px] max-w-[85vw] max-h-64 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-elevated)]">
                  <button onClick={() => { setSelectedCampaignId(""); setCampDropOpen(false); }}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${!selectedCampaignId ? "text-accent bg-accent/5" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                    <div className={`h-3.5 w-3.5 rounded border ${!selectedCampaignId ? "border-accent bg-accent" : "border-[var(--border-color)]"}`}>
                      {!selectedCampaignId && <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}
                    </div>
                    All Campaigns
                  </button>
                  <div className="border-t border-[var(--border-subtle)] my-1" />
                  {userCampaigns.map((c) => (
                    <button key={c.id} onClick={() => { setSelectedCampaignId(c.id); setCampDropOpen(false); }}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${selectedCampaignId === c.id ? "text-accent bg-accent/5" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                      <div className={`h-3.5 w-3.5 rounded border ${selectedCampaignId === c.id ? "border-accent bg-accent" : "border-[var(--border-color)]"}`}>
                        {selectedCampaignId === c.id && <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}
                      </div>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Earnings</p>
          <p className="text-xl font-bold text-accent">{formatCurrency(filteredEarnings)}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Views</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{formatNumber(filteredViews)}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Paid Out</p>
          <p className="text-xl font-bold text-emerald-400">{formatCurrency(filteredPaidOut)}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Pending Payout</p>
          <p className="text-xl font-bold text-amber-400">{formatCurrency(filteredPendingPayout)}</p>
        </Card>
        <Card>
          <p className="text-xs text-[var(--text-muted)]">Unpaid</p>
          <p className="text-xl font-bold text-accent">{formatCurrency(filteredUnpaid)}</p>
        </Card>
      </div>

      {/* ── Clips ── */}
      <div className="grid gap-4 grid-cols-3 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Approved</p>
          <p className="text-2xl font-bold text-emerald-400">{filteredApproved.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Pending</p>
          <p className="text-2xl font-bold text-amber-400">{filteredPending.length}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-[var(--text-muted)]">Rejected</p>
          <p className="text-2xl font-bold text-red-400">{filteredRejected.length}</p>
        </Card>
      </div>

      {/* ── Accounts ── */}
      {user.clipAccounts?.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Social Accounts</h2>
          <div className="flex flex-wrap gap-2">
            {user.clipAccounts.map((a: any) => {
              const views = accountViewsMap[a.id] || 0;
              return (
                <div key={a.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${a.deletedByUser ? "border-[var(--border-subtle)] opacity-60" : "border-[var(--border-color)]"}`}>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{a.username}</span>
                  <Badge variant={a.status.toLowerCase() as any}>{a.platform}</Badge>
                  {views > 0 && <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatNumber(views)} views</span>}
                  {a.deletedByUser && (
                    <span className="rounded-md bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">Removed by user</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Teams ── */}
      {user.teamMemberships?.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Teams</h2>
          <div className="flex flex-wrap gap-2">
            {user.teamMemberships.map((tm: any) => (
              <span key={tm.id} className="rounded-lg bg-accent/10 px-3 py-1.5 text-sm text-accent">{tm.team?.name || "Team"} ({tm.role})</span>
            ))}
          </div>
        </Card>
      )}

      {/* ── Campaigns ── */}
      {user.campaigns?.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Joined Campaigns</h2>
          <div className="space-y-1.5">
            {user.campaigns.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-[var(--bg-input)] px-3 py-2">
                <span className="text-sm text-[var(--text-primary)]">{c.name}</span>
                <Badge variant={c.status?.toLowerCase() as any}>{c.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Recent Clips ── */}
      {filteredClips.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Clips</h2>
          <div className="space-y-2">
            {filteredClips.slice(0, 15).map((clip: any) => {
              const stat = clip.stats?.[0];
              return (
                <div key={clip.id} className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--text-primary)] truncate">{clip.campaign?.name || "-"}</span>
                      <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--text-muted)]">
                      <span>{clip.clipAccount?.username || "-"}</span>
                      <span>{formatRelative(clip.createdAt)}</span>
                      {stat && <span>{formatNumber(stat.views)} views</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {clip.earnings > 0 && <span className="text-sm font-medium text-accent">{formatCurrency(clip.earnings)}</span>}
                    <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
