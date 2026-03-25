"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Flag, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatRelative, formatNumber } from "@/lib/utils";

export default function AdminFlagsPage() {
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    // Fetch ALL clips and filter client-side for FLAGGED
    // This avoids any server-side query param issue
    fetch("/api/clips")
      .then((r) => r.json())
      .then((data) => {
        const all = Array.isArray(data) ? data : [];
        setClips(all.filter((c: any) => c.status === "FLAGGED"));
      })
      .catch(() => setClips([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleReview = async (id: string, action: string) => {
    setActing(id);
    try {
      const res = await fetch(`/api/clips/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      setClips((prev) => prev.filter((c) => c.id !== id));
      toast.success(`Clip ${action.toLowerCase()}.`);
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    }
    setActing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Flagged Clips</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Review clips flagged for suspicious activity.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : clips.length === 0 ? (
        <EmptyState
          icon={<Flag className="h-10 w-10" />}
          title="No flagged clips"
          description="All clear! No suspicious clips at the moment."
        />
      ) : (
        <div className="space-y-2">
          {clips.map((clip: any) => {
            const stat = clip.stats?.[0];
            return (
              <Card key={clip.id} className="bg-red-500/[0.03] border-red-500/15 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)]">
                        {clip.campaign?.name || "Unknown campaign"}
                      </p>
                      <Badge variant="flagged">Flagged</Badge>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {clip.clipAccount?.username || clip.user?.username || "Clipper"} · {formatRelative(clip.createdAt)}
                    </p>
                    <div className="mt-2 flex items-center gap-4">
                      <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                        <ExternalLink className="h-3.5 w-3.5" /> View clip
                      </a>
                      {stat && (
                        <div className="flex gap-4 text-sm">
                          <span><span className="font-medium text-[var(--text-primary)]">{formatNumber(stat.views)}</span> <span className="text-[var(--text-muted)]">views</span></span>
                          <span><span className="font-medium text-[var(--text-primary)]">{formatNumber(stat.likes)}</span> <span className="text-[var(--text-muted)]">likes</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "APPROVED")} loading={acting === clip.id} icon={<Check className="h-3 w-3" />}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleReview(clip.id, "REJECTED")} loading={acting === clip.id} icon={<X className="h-3 w-3" />}>
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
