"use client";

import { useEffect, useState } from "react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Archive, RotateCcw, Film, Eye, Heart } from "lucide-react";
import { toast } from "sonner";

export default function ArchivePage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const getCampaignStats = (campaignId: string) => {
    const campaignClips = clips.filter((c: any) => c.campaignId === campaignId);
    const totalClips = campaignClips.length;
    const approved = campaignClips.filter((c: any) => c.status === "APPROVED").length;
    const totalViews = campaignClips.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0);
    const totalLikes = campaignClips.reduce((s: number, c: any) => s + (c.stats?.[0]?.likes || 0), 0);
    const totalEarned = campaignClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    return { totalClips, approved, totalViews, totalLikes, totalEarned };
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
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <CardTitle>{c.name}</CardTitle>
                    <CardDescription>
                      {c.platform?.replace(/,\s*/g, " · ")}
                      {c.clientName && ` · ${c.clientName}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="archived">Archived</Badge>
                    <Button size="sm" variant="outline" onClick={() => restore(c.id)} icon={<RotateCcw className="h-3 w-3" />}>
                      Restore
                    </Button>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                  {[
                    { label: "Total clips", value: stats.totalClips, icon: <Film className="h-3.5 w-3.5" /> },
                    { label: "Approved", value: stats.approved },
                    { label: "Views", value: formatNumber(stats.totalViews), icon: <Eye className="h-3.5 w-3.5" /> },
                    { label: "Likes", value: formatNumber(stats.totalLikes), icon: <Heart className="h-3.5 w-3.5" /> },
                    { label: "Budget", value: c.budget ? formatCurrency(c.budget) : "—" },
                    { label: "Total spent", value: formatCurrency(stats.totalEarned) },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                      <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-4 text-xs text-[var(--text-muted)]">
                  <span>Created: {formatDate(c.createdAt)}</span>
                  {c.archivedAt && <span>Archived: {formatDate(c.archivedAt)}</span>}
                  {c.cpmRate && <span>CPM: {formatCurrency(c.cpmRate)}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
