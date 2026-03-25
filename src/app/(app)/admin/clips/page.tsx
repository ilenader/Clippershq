"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { Film, Check, X, Flag, ExternalLink, RotateCcw, Activity, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { formatRelative, formatNumber, formatCurrency } from "@/lib/utils";

const statusOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FLAGGED", label: "Flagged" },
];

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

  const load = () => {
    Promise.all([
      fetch("/api/clips").then((r) => r.json()),
      fetch("/api/campaigns?scope=manage").then((r) => r.json()),
    ])
      .then(([clipsData, campaignData]) => {
        setClips(Array.isArray(clipsData) ? clipsData : []);
        setCampaigns(Array.isArray(campaignData) ? campaignData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!data.success) throw new Error("Update failed");
      setClips((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, status: action, rejectionReason: action === "REJECTED" ? reason || null : null } : c
        )
      );
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
    if (!confirm("Permanently delete this clip? This cannot be undone.")) return;
    setActing(id);
    try {
      const res = await fetch(`/api/clips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setClips((prev) => prev.filter((c) => c.id !== id));
      toast.success("Clip deleted.");
    } catch {
      toast.error("Failed to delete clip.");
    }
    setActing(null);
  };

  const rejectionExamples = [
    "Wrong format", "Wrong sound", "Bad quality", "Duplicate",
    "Suspicious", "Wrong platform", "Bad account",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Clip Review</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Approve, reject, or flag submitted clips.</p>
      </div>

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
        <EmptyState
          icon={<Film className="h-10 w-10" />}
          title="No clips"
          description={filterStatuses.length > 0 ? "No clips matching selected filters." : "No clips found."}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
          <div className="grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px_auto] gap-2 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            <span>Account</span>
            <span>Campaign</span>
            <span>Clip</span>
            <span className="text-right">Views</span>
            <span className="text-right">Likes</span>
            <span className="text-right">Comments</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Earned</span>
            <span>Status</span>
            <span></span>
          </div>
          {filteredClips.map((clip: any) => {
            const stat = clip.stats?.[0];
            const isActing = acting === clip.id;
            return (
              <div key={clip.id} className={`grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px_auto] gap-2 items-center px-4 py-2.5 border-b last:border-b-0 transition-colors ${clip.status === "FLAGGED" ? "bg-red-500/[0.04] border-red-500/15 hover:bg-red-500/[0.07]" : "border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{clip.clipAccount?.username || clip.user?.username || "Clipper"}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{formatRelative(clip.createdAt)}</p>
                </div>
                <p className="text-sm text-[var(--text-secondary)] truncate">{clip.campaign?.name || "—"}</p>
                <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors truncate">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" /> Open
                </a>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.views) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.likes) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.comments) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.shares) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{clip.earnings > 0 ? formatCurrency(clip.earnings) : "—"}</span>
                <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                <div className="flex items-center gap-1">
                  {clip.status === "PENDING" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "APPROVED")} loading={isActing} icon={<Check className="h-3 w-3" />}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectModal(clip.id)} icon={<X className="h-3 w-3" />}>Reject</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "FLAGGED")} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                    </>
                  )}
                  {clip.status === "APPROVED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo approval</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "FLAGGED")} loading={isActing} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                    </>
                  )}
                  {clip.status === "REJECTED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "PENDING")} loading={isActing} icon={<RotateCcw className="h-3 w-3" />}>Undo rejection</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "FLAGGED")} loading={isActing} icon={<Flag className="h-3 w-3" />}>Flag</Button>
                      {isOwner && (
                        <Button size="sm" variant="ghost" onClick={() => deleteClip(clip.id)} loading={isActing} icon={<Trash2 className="h-3 w-3" />} className="text-red-400 hover:text-red-300">Delete</Button>
                      )}
                    </>
                  )}
                  {clip.status === "FLAGGED" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "APPROVED")} icon={<Check className="h-3 w-3" />}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "REJECTED")} icon={<X className="h-3 w-3" />}>Reject</Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
