"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignImage } from "@/components/ui/campaign-image";
import { Megaphone, Eye, Film, Heart, MessageCircle, TrendingUp } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";

export default function ClientDashboard() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role;
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session && userRole && userRole !== "CLIENT" && userRole !== "OWNER") {
      router.replace("/dashboard");
    }
  }, [session, userRole, router]);

  useEffect(() => {
    fetch("/api/client/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, []);

  // Aggregate stats across all campaigns
  const totalViews = campaigns.reduce((s, c) => s + (c.totalViews || 0), 0);
  const totalClips = campaigns.reduce((s, c) => s + (c.totalClips || 0), 0);
  const approvedClips = campaigns.reduce((s, c) => s + (c.approvedClips || 0), 0);
  const totalLikes = campaigns.reduce((s, c) => s + (c.totalLikes || 0), 0);

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
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Campaign Dashboard</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Overview of your campaign performance.</p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Views", value: formatNumber(totalViews), icon: <Eye className="h-5 w-5" /> },
          { label: "Total Clips", value: totalClips, icon: <Film className="h-5 w-5" /> },
          { label: "Approved Clips", value: approvedClips, icon: <TrendingUp className="h-5 w-5" /> },
          { label: "Total Likes", value: formatNumber(totalLikes), icon: <Heart className="h-5 w-5" /> },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</p>
              <span className="text-accent">{stat.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Campaign cards */}
      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns assigned"
          description="You don't have any campaigns assigned yet. Contact the team for access."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c: any) => (
            <Card
              key={c.id}
              className="cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
              onClick={() => router.push(`/client/campaigns/${c.id}`)}
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
                  <CampaignImage src={c.imageUrl} name={c.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{c.platform}</p>
                    </div>
                    <Badge variant={c.status.toLowerCase() as any} className="flex-shrink-0">{c.status}</Badge>
                  </div>
                </div>
              </div>

              {c.budget != null && c.budget > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium text-[var(--text-primary)]">{formatCurrency(c.totalSpent || 0)} spent of {formatCurrency(c.budget)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.min(((c.totalSpent || 0) / c.budget) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatNumber(c.totalViews || 0)}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Views</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{c.approvedClips || 0}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Approved</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{c.pendingClips || 0}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Pending</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{formatNumber(c.totalLikes || 0)}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">Likes</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
