"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { formatCurrency, formatRelative, formatNumber } from "@/lib/utils";
import {
  Megaphone, Film, UserCircle, Wallet, AlertTriangle,
  ClipboardList, Users, ExternalLink, Check, X, Flag,
  RotateCcw, Activity, Clock,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const clipStatusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FLAGGED", label: "Flagged" },
];

export default function AdminDashboardPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [clipStatusFilter, setClipStatusFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [trackingClip, setTrackingClip] = useState<any | null>(null);

  const loadAll = () => {
    // Use scope=manage so admin only gets their own campaigns
    Promise.all([
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
      fetch("/api/clips").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()).catch(() => []),
      fetch("/api/payouts").then((r) => r.json()).catch(() => []),
    ])
      .then(([c, cl, a, p]) => {
        setCampaigns(Array.isArray(c) ? c : []);
        setClips(Array.isArray(cl) ? cl : []);
        setAccounts(Array.isArray(a) ? a : []);
        setPayouts(Array.isArray(p) ? p : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAll(); }, []);

  const handleClipReview = async (id: string, action: string, reason?: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/clips/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      setClips((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: action, rejectionReason: action === "REJECTED" ? reason || null : null } : c
        )
      );
      toast.success(`Clip ${action.toLowerCase()}.`);
      setRejectModal(null);
      setRejectReason("");
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    }
    setActing(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  let filteredClips = selectedCampaigns.length > 0
    ? clips.filter((c: any) => selectedCampaigns.includes(c.campaignId))
    : clips;
  if (clipStatusFilter.length > 0) {
    filteredClips = filteredClips.filter((c: any) => clipStatusFilter.includes(c.status));
  }

  const activeCampaigns = campaigns.filter((c: any) => c.status === "ACTIVE").length;
  const uniqueClippers = new Set(clips.map((c: any) => c.userId).filter(Boolean));
  const pendingClips = clips.filter((c: any) => c.status === "PENDING").length;
  const approvedClips = clips.filter((c: any) => c.status === "APPROVED").length;
  const flaggedClips = clips.filter((c: any) => c.status === "FLAGGED").length;
  const pendingAccounts = accounts.filter((a: any) => a.status === "PENDING").length;
  const approvedAccounts = accounts.filter((a: any) => a.status === "APPROVED").length;
  const pendingPayouts = payouts.filter((p: any) => p.status === "REQUESTED" || p.status === "UNDER_REVIEW");
  const pendingPayoutAmount = pendingPayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
  const campaignOptions = campaigns.map((c: any) => ({ value: c.id, label: c.name }));
  const rejectionExamples = ["Wrong format", "Wrong sound", "Bad quality", "Duplicate", "Suspicious", "Wrong platform"];

  // Money overview — real data
  const totalEarned = clips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const approvedEarnings = clips.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const pendingEarnings = clips.filter((c: any) => c.status === "PENDING").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const paidOut = payouts.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const remaining = approvedEarnings - paidOut;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          {selectedCampaigns.length > 0
            ? `Showing ${selectedCampaigns.length} campaign${selectedCampaigns.length > 1 ? "s" : ""}`
            : "Control center — all activity"}
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/campaigns"><Card hover>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Active campaigns</p>
            <Megaphone className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{activeCampaigns}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{campaigns.length} total</p>
        </Card></Link>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clips</p>
            <Film className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{clips.length}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{pendingClips} pending · {approvedClips} approved</p>
        </Card>
        <Link href="/admin/accounts"><Card hover>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Accounts</p>
            <UserCircle className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{accounts.length}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{approvedAccounts} approved · {pendingAccounts} pending</p>
        </Card></Link>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clippers</p>
            <Users className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{uniqueClippers.size}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">unique submitters</p>
        </Card>
      </div>

      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/payouts"><Card hover className={pendingPayouts.length > 0 ? "border-accent/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Payout queue</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(pendingPayoutAmount)}</p>
            </div>
            <Wallet className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{pendingPayouts.length} pending</p>
        </Card></Link>
        <Card className={flaggedClips > 0 ? "border-orange-500/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Flagged</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{flaggedClips}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Requires review</p>
        </Card>
        <Card className={pendingAccounts > 0 ? "border-accent/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Pending accounts</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{pendingAccounts}</p>
            </div>
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Awaiting verification</p>
        </Card>
      </div>

      {/* Total Money Overview */}
      <Card>
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-3">Total money overview</h3>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "Total earned", value: formatCurrency(totalEarned) },
            { label: "Approved", value: formatCurrency(approvedEarnings) },
            { label: "Pending", value: formatCurrency(pendingEarnings) },
            { label: "Paid out", value: formatCurrency(paidOut) },
            { label: "Remaining", value: formatCurrency(remaining) },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
              <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Clip overview — row-based */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Clip overview</h2>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {campaignOptions.length > 0 && (
            <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={setSelectedCampaigns} allLabel="All campaigns" />
          )}
          <MultiDropdown label="Status" options={clipStatusOptions} values={clipStatusFilter} onChange={setClipStatusFilter} allLabel="All statuses" />
        </div>

        {filteredClips.length === 0 ? (
          <Card><p className="text-sm text-[var(--text-muted)] text-center py-8">No clips matching filters.</p></Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
            {/* Header */}
            <div className="grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px_auto] gap-2 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              <span>Account</span>
              <span>Campaign</span>
              <span>Clip</span>
              <span className="text-right">Views</span>
              <span className="text-right">Likes</span>
              <span className="text-right">Comments</span>
              <span className="text-right">Shares</span>
              <span className="text-right">Earned</span>
              <span className="text-center">Track</span>
              <span></span>
            </div>
            {/* Rows */}
            {filteredClips.map((clip: any) => {
              const stat = clip.stats?.[0];
              const isActing = acting === clip.id;
              return (
                <div key={clip.id} className={`grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px_auto] gap-2 items-center px-4 py-2.5 border-b last:border-b-0 transition-colors ${clip.status === "FLAGGED" ? "bg-red-500/[0.04] border-red-500/15 hover:bg-red-500/[0.07]" : "border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]"}`}>
                  {/* Account */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {clip.clipAccount?.username || clip.user?.username || "Clipper"}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">{formatRelative(clip.createdAt)}</p>
                  </div>

                  {/* Campaign */}
                  <p className="text-sm text-[var(--text-secondary)] truncate">{clip.campaign?.name || "—"}</p>

                  {/* Clip link */}
                  <a
                    href={clip.clipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors truncate"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    Open
                  </a>

                  {/* Views */}
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.views) : "0"}</span>
                  {/* Likes */}
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.likes) : "0"}</span>
                  {/* Comments */}
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.comments) : "0"}</span>
                  {/* Shares */}
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.shares) : "0"}</span>

                  {/* Earnings */}
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{clip.earnings > 0 ? formatCurrency(clip.earnings) : "—"}</span>

                  {/* Tracking */}
                  <div className="flex justify-center">
                    {clip.status === "APPROVED" ? (
                      <button
                        onClick={() => setTrackingClip(clip)}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent/5 border border-accent/10 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/15 transition-colors cursor-pointer"
                      >
                        <Activity className="h-3 w-3" />
                        Live
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)]">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5">
                    {clip.status === "PENDING" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "APPROVED")} loading={isActing} icon={<Check className="h-3 w-3" />}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectModal(clip.id)} icon={<X className="h-3 w-3" />}>Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "FLAGGED")} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                      </>
                    )}
                    {clip.status === "APPROVED" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo approval</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "FLAGGED")} loading={isActing} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                      </>
                    )}
                    {clip.status === "REJECTED" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo rejection</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "FLAGGED")} loading={isActing} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                      </>
                    )}
                    {clip.status === "FLAGGED" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "APPROVED")} icon={<Check className="h-3 w-3" />}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleClipReview(clip.id, "REJECTED")} icon={<X className="h-3 w-3" />}>Reject</Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tracking modal */}
      <Modal open={!!trackingClip} onClose={() => setTrackingClip(null)} title="Hourly tracking" className="max-w-lg">
        {trackingClip && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{trackingClip.clipAccount?.username || "Clip"}</p>
                <p className="text-xs text-[var(--text-muted)]">{trackingClip.campaign?.name}</p>
              </div>
              <a href={trackingClip.clipUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <ExternalLink className="h-3 w-3" /> Open clip
              </a>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
              <div className="grid grid-cols-[1fr_72px_72px_72px] gap-2 px-4 py-2 border-b border-[var(--border-color)] text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                <span>Time</span>
                <span className="text-right">Views</span>
                <span className="text-right">Likes</span>
                <span className="text-right">Comments</span>
              </div>
              {Array.from({ length: 6 }).map((_, i) => {
                const stat = trackingClip.stats?.[0];
                const submitted = new Date(trackingClip.createdAt);
                const slotTime = new Date(submitted.getTime() + i * 60 * 60 * 1000);
                const timeLabel = i === 0
                  ? `${slotTime.getHours().toString().padStart(2, "0")}:${slotTime.getMinutes().toString().padStart(2, "0")} (submitted)`
                  : `${slotTime.getHours().toString().padStart(2, "0")}:00`;
                const isCurrent = i === 0;
                // Show current snapshot for first row, 0 for future slots (ready for real hourly data)
                const views = isCurrent && stat ? stat.views : 0;
                const likes = isCurrent && stat ? stat.likes : 0;
                const comments = isCurrent && stat ? stat.comments : 0;
                return (
                  <div key={i} className="grid grid-cols-[1fr_72px_72px_72px] gap-2 items-center px-4 py-2 border-b border-[var(--border-subtle)] last:border-b-0">
                    <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Clock className="h-3 w-3 text-[var(--text-muted)]" />
                      {timeLabel}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(views)}</span>
                    <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(likes)}</span>
                    <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(comments)}</span>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                Hourly tracking will automatically populate once the tracking system is connected. Current values show the latest snapshot.
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject clip">
        <div className="space-y-4">
          <Input id="rejectReason" label="Rejection reason" placeholder="Enter reason..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {rejectionExamples.map((r) => (
              <button key={r} type="button" onClick={() => setRejectReason(r)} className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer">{r}</button>
            ))}
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="danger" loading={acting === rejectModal} onClick={() => rejectModal && handleClipReview(rejectModal, "REJECTED", rejectReason)}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
