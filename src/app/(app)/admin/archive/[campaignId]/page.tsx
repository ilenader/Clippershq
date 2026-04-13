"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Users, Eye, Film, ThumbsUp, DollarSign, BarChart3, XCircle, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";

interface ClipData {
  clipId: string;
  clipUrl: string | null;
  platform: string | null;
  accountUsername: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  earnings: number;
  baseEarnings: number;
  bonusPercent: number;
  bonusAmount: number;
  ownerEarnings: number;
  status: string;
  createdAt: string;
}

interface ClipperData {
  userId: string;
  username: string;
  image: string | null;
  clipCount: number;
  totalViews: number;
  totalEarnings: number;
  paidOut: number;
  unpaid: number;
  clips: ClipData[];
}

export default function ArchiveCampaignPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClippers, setExpandedClippers] = useState<Set<string>>(new Set());
  const [showDesc, setShowDesc] = useState(false);
  const [showReqs, setShowReqs] = useState(false);
  const [checkingClips, setCheckingClips] = useState(false);

  const loadData = () => {
    fetch(`/api/admin/archive/${campaignId}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Forbidden" : "Not found");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [campaignId]);

  const checkClips = async () => {
    setCheckingClips(true);
    try {
      const res = await fetch("/api/admin/track-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignIds: [campaignId], includeInactive: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      toast.success("Clips checked — refreshing data");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to check clips.");
    }
    setCheckingClips(false);
  };

  const toggleClipper = (userId: string) => {
    setExpandedClippers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link href="/admin/archive">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>Back to Archive</Button>
        </Link>
        <EmptyState icon={<XCircle className="h-10 w-10" />} title={error || "Campaign not found"} description="This campaign may not exist or you don't have access." />
      </div>
    );
  }

  const { campaign, stats, budgetStatus, ownerEarningsTotal, clippers } = data;
  const cpm = campaign.clipperCpm ?? campaign.cpmRate;
  const isCpmSplit = campaign.pricingModel === "CPM_SPLIT";
  const totalClipperEarnings = clippers.reduce((s: number, c: ClipperData) => s + c.totalEarnings, 0);

  return (
    <div className="space-y-6 pb-10">
      {/* Back button */}
      <Link href="/admin/archive">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />}>Back to Archive</Button>
      </Link>

      {/* ── Campaign Overview ── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">{campaign.name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {campaign.clientName && <span>{campaign.clientName} &middot; </span>}
              {campaign.platform?.replace(/,\s*/g, " · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 flex-shrink-0 items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={checkClips}
              loading={checkingClips}
              disabled={checkingClips}
              icon={<RefreshCw className="h-3 w-3" />}
            >
              Check Clips
            </Button>
            <Badge variant={isCpmSplit ? "verified" : "completed"}>
              {isCpmSplit ? "CPM Split" : "Agency Fee"}
            </Badge>
            <Badge variant="archived">Archived</Badge>
          </div>
        </div>

        {/* Key info row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-4">
          {cpm != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Clipper CPM</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(cpm)}</p>
            </div>
          )}
          {isCpmSplit && campaign.ownerCpm != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Owner CPM</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.ownerCpm)}</p>
            </div>
          )}
          {campaign.budget != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Budget</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.budget)}</p>
            </div>
          )}
          {campaign.minViews != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Min Views</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{formatNumber(campaign.minViews)}</p>
            </div>
          )}
          {campaign.maxPayoutPerClip != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Max / Clip</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{formatCurrency(campaign.maxPayoutPerClip)}</p>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-4">
          <span>Created: {formatDate(campaign.createdAt)}</span>
          {campaign.archivedAt && <span>Archived: {formatDate(campaign.archivedAt)}</span>}
          {campaign.startDate && <span>Start: {formatDate(campaign.startDate)}</span>}
          {campaign.endDate && <span>End: {formatDate(campaign.endDate)}</span>}
        </div>

        {/* Collapsible description */}
        {campaign.description && (
          <div className="mb-3">
            <button onClick={() => setShowDesc(!showDesc)} className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {showDesc ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Description
            </button>
            {showDesc && (
              <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] p-3">
                {campaign.description}
              </p>
            )}
          </div>
        )}

        {/* Collapsible requirements */}
        {campaign.requirements && (
          <div>
            <button onClick={() => setShowReqs(!showReqs)} className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
              {showReqs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Requirements
            </button>
            {showReqs && (
              <p className="mt-2 text-sm text-[var(--text-secondary)] whitespace-pre-wrap rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] p-3">
                {campaign.requirements}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Film className="h-4 w-4" />} label="Total Clips" value={stats.totalClips.toString()} />
        <StatCard icon={<Film className="h-4 w-4 text-emerald-400" />} label="Approved" value={stats.approvedClips.toString()} color="text-emerald-400" />
        <StatCard icon={<XCircle className="h-4 w-4 text-red-400" />} label="Rejected" value={stats.rejectedClips.toString()} color="text-red-400" />
        <StatCard icon={<Eye className="h-4 w-4 text-accent" />} label="Total Views" value={formatNumber(stats.totalViews)} color="text-accent" />
        <StatCard icon={<ThumbsUp className="h-4 w-4 text-accent" />} label="Total Likes" value={formatNumber(stats.totalLikes)} color="text-accent" />
        <StatCard icon={<DollarSign className="h-4 w-4 text-emerald-400" />} label="Clipper Earnings" value={formatCurrency(totalClipperEarnings)} color="text-emerald-400" />
        {budgetStatus && (
          <>
            <StatCard icon={<BarChart3 className="h-4 w-4 text-amber-400" />} label="Budget Spent" value={formatCurrency(budgetStatus.spent)} sub={`of ${formatCurrency(budgetStatus.budget)}`} color="text-amber-400" />
            <StatCard icon={<BarChart3 className="h-4 w-4 text-emerald-400" />} label="Remaining" value={formatCurrency(budgetStatus.remaining)} color="text-emerald-400" />
          </>
        )}
        {isCpmSplit && (
          <StatCard icon={<DollarSign className="h-4 w-4 text-cyan-400" />} label="Owner Earnings" value={formatCurrency(ownerEarningsTotal)} color="text-cyan-400" />
        )}
      </div>

      {/* ── Clipper Breakdown ── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Clipper Breakdown</h2>
          <span className="text-sm text-[var(--text-muted)]">({clippers.length})</span>
        </div>

        {clippers.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No approved clips for this campaign.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2 text-xs font-medium text-[var(--text-muted)]">
              <span>Clipper</span>
              <span className="text-right">Clips</span>
              <span className="text-right">Views</span>
              <span className="text-right">Earned</span>
              <span className="text-right">Paid Out</span>
              <span className="text-right">Unpaid</span>
            </div>

            {clippers.map((clipper: ClipperData) => {
              const isExpanded = expandedClippers.has(clipper.userId);
              return (
                <div key={clipper.userId}>
                  {/* Clipper row — Desktop */}
                  <Card>
                    <button
                      onClick={() => toggleClipper(clipper.userId)}
                      className="w-full text-left"
                    >
                      {/* Desktop: table row */}
                      <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-center">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
                          </div>
                          {clipper.image ? (
                            <img src={clipper.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                              {clipper.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{clipper.username}</span>
                        </div>
                        <span className="text-sm text-[var(--text-secondary)] text-right tabular-nums">{clipper.clipCount}</span>
                        <span className="text-sm text-[var(--text-secondary)] text-right tabular-nums">{formatNumber(clipper.totalViews)}</span>
                        <span className="text-sm font-medium text-emerald-400 text-right tabular-nums">{formatCurrency(clipper.totalEarnings)}</span>
                        <span className="text-sm text-[var(--text-secondary)] text-right tabular-nums">{formatCurrency(clipper.paidOut)}</span>
                        <span className="text-sm text-right tabular-nums" style={{ color: clipper.unpaid > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                          {formatCurrency(clipper.unpaid)}
                        </span>
                      </div>

                      {/* Mobile: card layout */}
                      <div className="sm:hidden">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-shrink-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />}
                          </div>
                          {clipper.image ? (
                            <img src={clipper.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">
                              {clipper.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{clipper.username}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 ml-7">
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)]">Clips</p>
                            <p className="text-sm font-medium text-[var(--text-secondary)] tabular-nums">{clipper.clipCount}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)]">Views</p>
                            <p className="text-sm font-medium text-[var(--text-secondary)] tabular-nums">{formatNumber(clipper.totalViews)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)]">Earned</p>
                            <p className="text-sm font-medium text-emerald-400 tabular-nums">{formatCurrency(clipper.totalEarnings)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)]">Paid Out</p>
                            <p className="text-sm font-medium text-[var(--text-secondary)] tabular-nums">{formatCurrency(clipper.paidOut)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--text-muted)]">Unpaid</p>
                            <p className="text-sm font-medium tabular-nums" style={{ color: clipper.unpaid > 0 ? "var(--text-primary)" : "var(--text-muted)" }}>
                              {formatCurrency(clipper.unpaid)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </button>
                  </Card>

                  {/* Expanded clips */}
                  {isExpanded && (
                    <div className="ml-2 sm:ml-8 mt-1 mb-2 space-y-1">
                      {clipper.clips.map((clip: ClipData) => (
                        <div
                          key={clip.clipId}
                          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]/60 p-3"
                        >
                          {/* Desktop clip layout */}
                          <div className="hidden sm:block">
                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {clip.clipUrl && (
                                  <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1 text-sm">
                                    <ExternalLink className="h-3 w-3" />
                                    Open clip
                                  </a>
                                )}
                                {clip.accountUsername && (
                                  <span className="text-xs text-[var(--text-muted)]">@{clip.accountUsername}</span>
                                )}
                                {clip.platform && (
                                  <span className="text-xs text-[var(--text-muted)] capitalize">{clip.platform}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={clip.status === "APPROVED" ? "approved" : clip.status === "REJECTED" ? "rejected" : "pending"}>
                                  {clip.status}
                                </Badge>
                                <span className="text-xs text-[var(--text-muted)]">{formatDate(clip.createdAt)}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-6 gap-3">
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Views</p>
                                <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatNumber(clip.views)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Likes</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.likes)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Comments</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.comments)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Shares</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.shares)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Earnings</p>
                                <p className="text-sm font-medium text-emerald-400 tabular-nums">{formatCurrency(clip.earnings)}</p>
                                {clip.bonusPercent > 0 && (
                                  <p className="text-[10px] text-emerald-400/70">
                                    base {formatCurrency(clip.baseEarnings)} + {clip.bonusPercent}% ({formatCurrency(clip.bonusAmount)})
                                  </p>
                                )}
                              </div>
                              {isCpmSplit && clip.ownerEarnings > 0 && (
                                <div>
                                  <p className="text-xs text-[var(--text-muted)]">Owner</p>
                                  <p className="text-sm text-cyan-400 tabular-nums">{formatCurrency(clip.ownerEarnings)}</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Mobile clip layout */}
                          <div className="sm:hidden space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {clip.clipUrl && (
                                  <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline flex items-center gap-1 text-sm flex-shrink-0">
                                    <ExternalLink className="h-3 w-3" />
                                    Open clip
                                  </a>
                                )}
                              </div>
                              <Badge variant={clip.status === "APPROVED" ? "approved" : clip.status === "REJECTED" ? "rejected" : "pending"}>
                                {clip.status}
                              </Badge>
                            </div>
                            {(clip.accountUsername || clip.platform) && (
                              <div className="flex items-center gap-2">
                                {clip.accountUsername && <span className="text-xs text-[var(--text-muted)]">@{clip.accountUsername}</span>}
                                {clip.platform && <span className="text-xs text-[var(--text-muted)] capitalize">{clip.platform}</span>}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-[10px] text-[var(--text-muted)]">Views</p>
                                <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatNumber(clip.views)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[var(--text-muted)]">Likes</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.likes)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[var(--text-muted)]">Comments</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.comments)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-[var(--text-muted)]">Shares</p>
                                <p className="text-sm text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.shares)}</p>
                              </div>
                            </div>
                            <div className="flex items-baseline justify-between pt-1 border-t border-[var(--border-color)]/50">
                              <div>
                                <p className="text-sm font-medium text-emerald-400 tabular-nums">
                                  {formatCurrency(clip.earnings)}
                                  {clip.bonusPercent > 0 && (
                                    <span className="text-[10px] text-emerald-400/70 ml-1">
                                      (+{formatCurrency(clip.bonusAmount)} bonus)
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="text-[10px] text-[var(--text-muted)]">{formatDate(clip.createdAt)}</span>
                            </div>
                            {isCpmSplit && clip.ownerEarnings > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-[var(--text-muted)]">Owner earnings</span>
                                <span className="text-sm text-cyan-400 tabular-nums">{formatCurrency(clip.ownerEarnings)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Owner Earnings Section (CPM_SPLIT only) ── */}
      {isCpmSplit && ownerEarningsTotal > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Owner Earnings</h2>
          </div>
          <Card>
            <div className="mb-3">
              <p className="text-xs text-[var(--text-muted)]">Total Owner Earnings</p>
              <p className="text-xl font-bold text-cyan-400">{formatCurrency(ownerEarningsTotal)}</p>
            </div>
            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)]">
                    <th className="text-left text-xs font-medium text-[var(--text-muted)] py-2 pr-4">Clipper</th>
                    <th className="text-right text-xs font-medium text-[var(--text-muted)] py-2 px-4">Clip Earnings</th>
                    <th className="text-right text-xs font-medium text-[var(--text-muted)] py-2 pl-4">Owner Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {clippers.map((clipper: ClipperData) => {
                    const clipperOwnerTotal = clipper.clips.reduce((s: number, c: ClipData) => s + c.ownerEarnings, 0);
                    if (clipperOwnerTotal <= 0) return null;
                    return (
                      <tr key={clipper.userId} className="border-b border-[var(--border-color)]/50">
                        <td className="py-2 pr-4 text-[var(--text-primary)]">{clipper.username}</td>
                        <td className="py-2 px-4 text-right text-emerald-400 tabular-nums">{formatCurrency(clipper.totalEarnings)}</td>
                        <td className="py-2 pl-4 text-right text-cyan-400 tabular-nums">{formatCurrency(clipperOwnerTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden space-y-2">
              {clippers.map((clipper: ClipperData) => {
                const clipperOwnerTotal = clipper.clips.reduce((s: number, c: ClipData) => s + c.ownerEarnings, 0);
                if (clipperOwnerTotal <= 0) return null;
                return (
                  <div key={clipper.userId} className="flex items-center justify-between py-2 border-b border-[var(--border-color)]/50">
                    <span className="text-sm text-[var(--text-primary)] truncate mr-3">{clipper.username}</span>
                    <div className="flex gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--text-muted)]">Clip</p>
                        <p className="text-sm text-emerald-400 tabular-nums">{formatCurrency(clipper.totalEarnings)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-[var(--text-muted)]">Owner</p>
                        <p className="text-sm text-cyan-400 tabular-nums">{formatCurrency(clipperOwnerTotal)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
      </div>
      <p className={`text-lg font-bold tabular-nums ${color || "text-[var(--text-primary)]"}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}
