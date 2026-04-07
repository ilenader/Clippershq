"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { TrackingModal } from "@/components/tracking-modal";
import {
  Film, Check, X, Flag, ExternalLink, RotateCcw, Trash2,
  Shield, AlertTriangle, Zap, Settings2, Activity,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "@/lib/toast";
import { formatRelative, formatNumber, formatCurrency } from "@/lib/utils";
import type { FraudLevel } from "@/lib/fraud";

const statusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FLAGGED", label: "Flagged" },
];

const fraudColors: Record<FraudLevel, { bg: string; text: string; border: string }> = {
  CLEAN: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  SUSPECT: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20" },
  FLAGGED: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
  HIGH_RISK: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
};

export default function AdminClipsPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as any)?.role === "OWNER";
  const [clips, setClips] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterCampaigns, setFilterCampaigns] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [overrideClip, setOverrideClip] = useState<any | null>(null);
  const [overrideForm, setOverrideForm] = useState({ views: "", likes: "", comments: "", shares: "" });
  const [overriding, setOverriding] = useState(false);
  const [trackingClip, setTrackingClip] = useState<any | null>(null);

  const load = async () => {
    try {
      const ts = Date.now();
      const [clipsRes, campaignRes] = await Promise.all([
        fetch(`/api/clips?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/campaigns?scope=manage&_t=${ts}`, { cache: "no-store" }),
      ]);
      const [clipsData, campaignData] = await Promise.all([
        clipsRes.json(), campaignRes.json(),
      ]);
      setClips(Array.isArray(clipsData) ? clipsData : []);
      setCampaigns(Array.isArray(campaignData) ? campaignData : []);
    } catch (err) {
      console.error("Failed to load admin clips:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useAutoRefresh(load, 10000);

  const campaignOptions = campaigns.map((c: any) => ({ value: c.id, label: c.name }));

  let filteredClips = filterStatuses.length > 0
    ? clips.filter((c: any) => filterStatuses.includes(c.status))
    : clips;
  if (filterCampaigns.length > 0) {
    filteredClips = filteredClips.filter((c: any) => filterCampaigns.includes(c.campaignId));
  }

  const handleReview = async (id: string, action: string, reason?: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/clips/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      setClips((prev) => prev.map((c) => c.id === id ? { ...c, status: action, rejectionReason: action === "REJECTED" ? reason || null : null } : c));
      toast.success(`Clip ${action.toLowerCase()}.`);
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    }
    setActing(null);
  };

  const deleteClip = async (id: string) => {
    if (!confirm("Permanently delete this clip?")) return;
    setActing(id);
    try {
      const res = await fetch(`/api/clips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setClips((prev) => prev.filter((c) => c.id !== id));
      toast.success("Clip deleted.");
    } catch { toast.error("Failed to delete."); }
    setActing(null);
  };

  const openOverride = (clip: any) => {
    const stat = clip.stats?.[0];
    setOverrideClip(clip);
    setOverrideForm({ views: stat?.views?.toString() || "0", likes: stat?.likes?.toString() || "0", comments: stat?.comments?.toString() || "0", shares: stat?.shares?.toString() || "0" });
  };

  const submitOverride = async () => {
    if (!overrideClip) return;
    setOverriding(true);
    try {
      const res = await fetch(`/api/clips/${overrideClip.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ views: parseInt(overrideForm.views) || 0, likes: parseInt(overrideForm.likes) || 0, comments: parseInt(overrideForm.comments) || 0, shares: parseInt(overrideForm.shares) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Stats updated. New earnings: ${formatCurrency(data.earnings)}`);
      setOverrideClip(null);
      load();
    } catch (err: any) { toast.error(err.message || "Override failed."); }
    setOverriding(false);
  };

  function getClipFraud(clip: any): { level: FraudLevel; score: number; reasons: string[] } | null {
    // Use stored fraud data from backend (computed by tracking cron)
    const score = clip.fraudScore ?? 0;
    let reasons: string[] = [];
    try { reasons = clip.fraudReasons ? JSON.parse(clip.fraudReasons) : []; } catch { reasons = []; }
    let level: FraudLevel = "CLEAN";
    if (score >= 50) level = "HIGH_RISK";
    else if (score >= 30) level = "FLAGGED";
    else if (score >= 15) level = "SUSPECT";
    if (score === 0 && reasons.length === 0) return null;
    return { level, score, reasons };
  }

  const [trackingAll, setTrackingAll] = useState(false);
  const [trackResult, setTrackResult] = useState<string | null>(null);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackSelected, setTrackSelected] = useState<Set<string>>(new Set());

  // Count active clips per campaign for the modal
  const activeClipsByCampaign: Record<string, number> = {};
  for (const clip of clips) {
    if (!clip.campaignId) continue;
    activeClipsByCampaign[clip.campaignId] = (activeClipsByCampaign[clip.campaignId] || 0) + 1;
  }

  const openTrackModal = () => {
    // Pre-select all campaigns
    const allIds = new Set(campaigns.map((c: any) => c.id));
    setTrackSelected(allIds);
    setShowTrackModal(true);
  };

  const toggleTrackCampaign = (id: string) => {
    setTrackSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleTrackSelected = async () => {
    if (trackSelected.size === 0) { toast.error("Select at least one campaign."); return; }
    setTrackingAll(true);
    setTrackResult(null);
    try {
      const res = await fetch("/api/admin/track-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignIds: Array.from(trackSelected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const viewChanges = (data.details || []).filter((d: string) => /→/.test(d)).length;
      const msg = `Checked ${data.checked} clips across ${data.campaignsChecked} campaigns. ${viewChanges > 0 ? `${viewChanges} had view changes.` : "No view changes."} (${data.elapsedMs}ms)`;
      if (data.campaignsBlocked > 0) {
        setTrackResult(`${msg} (${data.campaignsBlocked} campaign(s) were rate-limited)`);
      } else {
        setTrackResult(msg);
      }
      toast.success(`Tracking complete — ${data.checked} clips checked.`);
      setShowTrackModal(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Tracking failed.");
      setTrackResult(null);
    }
    setTrackingAll(false);
  };

  const rejectionExamples = ["Wrong format", "Wrong sound", "Bad quality", "Duplicate", "Suspicious", "Wrong platform"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Clip Review</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Approve, reject, or flag submitted clips.</p>
        </div>
        {isOwner && (
          <Button onClick={openTrackModal} variant="outline" icon={<RotateCcw className="h-4 w-4" />}>
            Check Clips Now
          </Button>
        )}
      </div>

      {trackResult && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5">
          <p className="text-sm text-accent">{trackResult}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {campaignOptions.length > 0 && (
          <MultiDropdown label="Campaign" options={campaignOptions} values={filterCampaigns} onChange={setFilterCampaigns} allLabel="All campaigns" />
        )}
        <MultiDropdown label="Status" options={statusOptions} values={filterStatuses} onChange={setFilterStatuses} allLabel="All statuses" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : filteredClips.length === 0 ? (
        <EmptyState icon={<Film className="h-10 w-10" />} title="No clips" description={filterStatuses.length > 0 ? "No clips matching filters." : "No clips found."} />
      ) : (
        <div className="space-y-2">
          {filteredClips.map((clip: any) => {
            const stat = clip.stats?.[0];
            const isActing = acting === clip.id;
            const fraud = getClipFraud(clip);
            const fraudStyle = fraud ? fraudColors[fraud.level] : null;
            const isSuspicious = fraud && fraud.level !== "CLEAN";
            const trustScore = clip.user?.trustScore ?? null;

            return (
              <div
                key={clip.id}
                className={`rounded-xl border p-4 transition-colors ${
                  clip.status === "FLAGGED" ? "bg-red-500/[0.04] border-red-500/20" :
                  isSuspicious ? "bg-yellow-500/[0.02] border-yellow-500/15" :
                  "border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]"
                }`}
              >
                {/* Top row: account + campaign + status + fraud */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {clip.clipAccount?.username || clip.user?.username || "Clipper"}
                        </p>
                        {isOwner && trustScore !== null && (
                          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${trustScore < 30 ? "text-red-400" : trustScore < 60 ? "text-yellow-400" : "text-emerald-400"}`}>
                            <Shield className="h-3 w-3" />{trustScore}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {clip.campaign?.name || "-"} · {formatRelative(clip.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {fraud && fraud.level !== "CLEAN" && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${fraudStyle!.bg} ${fraudStyle!.text} ${fraudStyle!.border}`}
                        title={fraud.reasons.join(", ") || "No signals"}
                      >
                        {fraud.level === "HIGH_RISK" ? <AlertTriangle className="h-3 w-3" /> : fraud.level === "FLAGGED" ? <Zap className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                        {fraud.level === "HIGH_RISK" ? "HIGH RISK" : fraud.level}
                      </span>
                    )}
                    <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                  </div>
                </div>

                {/* Middle row: link + stats */}
                <div className="flex items-center gap-4 flex-wrap">
                  <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Open clip
                  </a>
                  <div className="flex items-center gap-4 text-sm">
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.views) : "0"}</span> <span className="text-[var(--text-muted)]">views</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.likes) : "0"}</span> <span className="text-[var(--text-muted)]">likes</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.comments) : "0"}</span> <span className="text-[var(--text-muted)]">comments</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.shares) : "0"}</span> <span className="text-[var(--text-muted)]">shares</span></span>
                    {clip.earnings > 0 && (
                      <span className="font-medium text-accent tabular-nums">{formatCurrency(clip.earnings)}</span>
                    )}
                  </div>
                </div>

                {/* Fraud reasons (owner only, if suspicious) */}
                {fraud && fraud.reasons.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fraud.reasons.map((r, i) => (
                      <span key={i} className={`text-[10px] rounded-md px-1.5 py-0.5 ${fraudStyle!.bg} ${fraudStyle!.text}`}>{r}</span>
                    ))}
                  </div>
                )}

                {/* Actions row */}
                <div className="mt-3 flex items-center gap-1 flex-wrap">
                  {clip.status === "PENDING" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "APPROVED")} loading={isActing} icon={<Check className="h-3 w-3" />}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectModal(clip.id)} icon={<X className="h-3 w-3" />}>Reject</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "FLAGGED")} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                    </>
                  )}
                  {clip.status === "APPROVED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "FLAGGED")} loading={isActing} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                    </>
                  )}
                  {clip.status === "REJECTED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo</Button>
                      {isOwner && <Button size="sm" variant="ghost" onClick={() => deleteClip(clip.id)} loading={isActing} icon={<Trash2 className="h-3 w-3" />} className="text-red-400 hover:text-red-300">Del</Button>}
                    </>
                  )}
                  {clip.status === "FLAGGED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "APPROVED")} icon={<Check className="h-3 w-3" />}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "REJECTED")} icon={<X className="h-3 w-3" />}>Reject</Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setTrackingClip(clip)} icon={<Activity className="h-3 w-3" />}>Live</Button>
                  {isOwner && (
                    <Button size="sm" variant="ghost" onClick={() => openOverride(clip)} icon={<Settings2 className="h-3 w-3" />}>Override</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
            <Button variant="danger" loading={acting === rejectModal} onClick={() => rejectModal && handleReview(rejectModal, "REJECTED", rejectReason)}>Reject</Button>
          </div>
        </div>
      </Modal>

      {/* Manual override modal */}
      <Modal open={!!overrideClip} onClose={() => setOverrideClip(null)} title="Manual stat override" className="max-w-md">
        {overrideClip && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
              <p className="text-sm text-[var(--text-primary)] font-medium">{overrideClip.clipAccount?.username || "Clip"}</p>
              <p className="text-xs text-[var(--text-muted)]">{overrideClip.campaign?.name} · {formatRelative(overrideClip.createdAt)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input id="ov-views" label="Views" type="number" value={overrideForm.views} onChange={(e) => setOverrideForm({ ...overrideForm, views: e.target.value })} />
              <Input id="ov-likes" label="Likes" type="number" value={overrideForm.likes} onChange={(e) => setOverrideForm({ ...overrideForm, likes: e.target.value })} />
              <Input id="ov-comments" label="Comments" type="number" value={overrideForm.comments} onChange={(e) => setOverrideForm({ ...overrideForm, comments: e.target.value })} />
              <Input id="ov-shares" label="Shares" type="number" value={overrideForm.shares} onChange={(e) => setOverrideForm({ ...overrideForm, shares: e.target.value })} />
            </div>
            <p className="text-xs text-[var(--text-muted)]">Earnings auto-recalculate from campaign CPM. Logged to audit trail.</p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setOverrideClip(null)}>Cancel</Button>
              <Button loading={overriding} onClick={submitOverride}>Save override</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Tracking modal */}
      <TrackingModal clip={trackingClip} open={!!trackingClip} onClose={() => setTrackingClip(null)} />

      {/* Manual tracking check modal */}
      <Modal open={showTrackModal} onClose={() => setShowTrackModal(false)} title="Manual Tracking Check" className="max-w-md">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-muted)]">Select campaigns to check</p>
            <button
              onClick={() => {
                if (trackSelected.size === campaigns.length) setTrackSelected(new Set());
                else setTrackSelected(new Set(campaigns.map((c: any) => c.id)));
              }}
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              {trackSelected.size === campaigns.length ? "Deselect all" : "Select all"}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {campaigns.map((c: any) => (
              <label key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={trackSelected.has(c.id)}
                  onChange={() => toggleTrackCampaign(c.id)}
                  className="h-4 w-4 rounded border-[var(--border-color)] accent-accent"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{activeClipsByCampaign[c.id] || 0} clips · {c.status}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowTrackModal(false)}>Cancel</Button>
            <Button onClick={handleTrackSelected} loading={trackingAll} disabled={trackSelected.size === 0} icon={<RotateCcw className="h-4 w-4" />}>
              Check {trackSelected.size} campaign{trackSelected.size !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
