"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Archive, RotateCcw, Trash2, Eye, RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";

export default function ArchivePage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [destroyTarget, setDestroyTarget] = useState<any | null>(null);
  const [destroyConfirm, setDestroyConfirm] = useState("");
  const [destroying, setDestroying] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const load = () => {
    Promise.all([
      fetch("/api/campaigns?archived=true").then((r) => r.json()),
      fetch("/api/clips?includeArchived=true").then((r) => r.json()).catch(() => []),
    ])
      .then(([c, cl]) => {
        setCampaigns(Array.isArray(c) ? c : []);
        setClips(Array.isArray(cl) ? cl : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const restore = async (id: string) => {
    try {
      const res = await fetch(`/api/campaigns/${id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Campaign restored.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to restore.");
    }
  };

  const permanentDelete = async () => {
    if (!destroyTarget) return;
    setDestroying(true);
    try {
      const res = await fetch(`/api/campaigns/${destroyTarget.id}/destroy`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Campaign permanently deleted.");
      setDestroyTarget(null);
      setDestroyConfirm("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete.");
    }
    setDestroying(false);
  };

  const checkClips = (campaignId: string) => {
    toast.success("Checking clips in the background...");
    fetch("/api/admin/track-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignIds: [campaignId], includeInactive: true }),
    })
      .then(async (res) => {
        let data: any;
        try { data = await res.json(); } catch { data = null; }
        if (!mountedRef.current) return;
        if (!res.ok) {
          toast.error(data?.error || "Check failed.");
        } else {
          toast.success(data?.partial ? "Check started, still processing..." : "Clips checked — refreshing data");
          load();
        }
      })
      .catch(() => {
        if (mountedRef.current) toast.error("Failed to check clips.");
      });
  };

  const getCampaignStats = (campaignId: string) => {
    const campaignClips = clips.filter((c: any) => c.campaignId === campaignId);
    return {
      totalClips: campaignClips.length,
      approved: campaignClips.filter((c: any) => c.status === "APPROVED").length,
      totalViews: campaignClips.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0),
      totalLikes: campaignClips.reduce((s: number, c: any) => s + (c.stats?.[0]?.likes || 0), 0),
      totalEarned: campaignClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0),
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaign Archive</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Past campaigns and historical performance.</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-10 w-10" />}
          title="No archived campaigns"
          description="Archived campaigns will appear here."
        />
      ) : (
        <div className="space-y-4">
          {campaigns.map((c: any) => {
            const stats = getCampaignStats(c.id);
            return (
              <Card key={c.id}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.platform?.replace(/,\s*/g, " · ")}
                      {c.clientName && ` · ${c.clientName}`}
                    </CardDescription>
                  </div>
                  <Badge variant="archived">Archived</Badge>
                </div>

                {/* Stats — responsive, no overflow */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Clips</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.totalClips}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Approved</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.approved}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Views</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatNumber(stats.totalViews)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Likes</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatNumber(stats.totalLikes)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Budget</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{c.budget ? formatCurrency(c.budget) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Spent</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrency(stats.totalEarned)}</p>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] mb-4">
                  <span>Created: {formatDate(c.createdAt)}</span>
                  {c.archivedAt && <span>Archived: {formatDate(c.archivedAt)}</span>}
                  {(c.clipperCpm ?? c.cpmRate) != null && <span>CPM: {formatCurrency(c.clipperCpm ?? c.cpmRate)}</span>}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/archive/${c.id}`}>
                    <Button size="sm" variant="outline" icon={<Eye className="h-3 w-3" />}>
                      View Details
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => checkClips(c.id)}
                    icon={<RefreshCw className="h-3 w-3" />}
                  >
                    Check Clips
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => restore(c.id)} icon={<RotateCcw className="h-3 w-3" />}>
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setDestroyTarget(c); setDestroyConfirm(""); }}
                    icon={<Trash2 className="h-3 w-3" />}
                    className="text-red-400 hover:text-red-300 hover:border-red-400/30"
                  >
                    Permanently delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Permanent delete confirmation */}
      <Modal open={!!destroyTarget} onClose={() => setDestroyTarget(null)} title="Permanently delete campaign">
        {destroyTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
              <p className="text-sm text-red-400 font-medium mb-1">This action is irreversible.</p>
              <p className="text-sm text-red-400/80">
                All data tied to <strong>{destroyTarget.name}</strong> will be permanently deleted: clips, stats, payouts, tracking history, and the campaign itself.
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                Type <code className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-xs font-bold text-red-400">PERMANENTLY DELETE</code> to confirm:
              </p>
              <Input
                id="destroyConfirm"
                placeholder="PERMANENTLY DELETE"
                value={destroyConfirm}
                onChange={(e) => setDestroyConfirm(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDestroyTarget(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={destroying}
                disabled={destroyConfirm !== "PERMANENTLY DELETE"}
                onClick={permanentDelete}
              >
                Delete forever
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
