"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter, useParams } from "next/navigation";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Film, Heart, MessageCircle, Share2, TrendingUp, ArrowLeft, ExternalLink, Download, BarChart3 } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";
import { TrackingModal } from "@/components/tracking-modal";

export default function ClientCampaignDetail() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const [exporting, setExporting] = useState(false);
  const campaignId = params.id as string;
  const userRole = (session?.user as SessionUser)?.role;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [trackingClip, setTrackingClip] = useState<any>(null);

  useEffect(() => {
    if (session && userRole && userRole !== "CLIENT" && userRole !== "OWNER") {
      router.replace("/dashboard");
    }
  }, [session, userRole, router]);

  const loadData = useCallback(() => {
    if (!campaignId) return;
    fetch(`/api/client/campaigns/${campaignId}?_t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);
  useAutoRefresh(loadData, 30000);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-[var(--text-secondary)]">Campaign not found or access denied.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/client")}>Back to dashboard</Button>
      </div>
    );
  }

  const { campaign, clips, summary, dailyBreakdown } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/client")} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{campaign.name}</h1>
            <p className="text-[15px] text-[var(--text-secondary)]">{campaign.platform} <Badge variant={campaign.status.toLowerCase() as any} className="ml-2">{campaign.status}</Badge></p>
          </div>
        </div>
        <Button
          variant="outline"
          loading={exporting}
          icon={<Download className="h-4 w-4" />}
          onClick={async () => {
            setExporting(true);
            try {
              const res = await fetch(`/api/client/export?campaignId=${campaignId}`);
              if (!res.ok) throw new Error("Export failed");
              const blob = await res.blob();
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `campaign-report-${new Date().toISOString().split("T")[0]}.xlsx`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(a.href);
              toast.success("Report downloaded!");
            } catch { toast.error("Export failed"); }
            setExporting(false);
          }}
        >
          Export
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Views", value: formatNumber(summary.totalViews), icon: <Eye className="h-5 w-5" /> },
          { label: "Approved Clips", value: summary.approvedClips, icon: <Film className="h-5 w-5" /> },
          { label: "Total Likes", value: formatNumber(summary.totalLikes), icon: <Heart className="h-5 w-5" /> },
          { label: "Avg Views/Clip", value: formatNumber(summary.avgViewsPerClip), icon: <TrendingUp className="h-5 w-5" /> },
          { label: "Total Comments", value: formatNumber(summary.totalComments), icon: <MessageCircle className="h-5 w-5" /> },
          { label: "Total Shares", value: formatNumber(summary.totalShares), icon: <Share2 className="h-5 w-5" /> },
          { label: "Pending Clips", value: summary.pendingClips, icon: <Film className="h-5 w-5" /> },
          { label: "Top Clip Views", value: formatNumber(summary.topViews), icon: <TrendingUp className="h-5 w-5" /> },
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

      {/* Budget bar */}
      {campaign.budget != null && campaign.budget > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Budget</h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-[var(--text-muted)]">Spent</span>
            <span className="font-bold text-accent">{formatCurrency(data.summary.totalSpent || 0)} / {formatCurrency(campaign.budget)}</span>
          </div>
          <div className="h-3 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.min(((data.summary.totalSpent || 0) / campaign.budget) * 100, 100)}%` }} />
          </div>
        </Card>
      )}

      {/* Clip performance table */}
      <Card>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Clip Performance</h3>
        {clips.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No clips submitted yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">#</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Platform</th>
                  <th className="text-left px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Status</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Likes</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Comments</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Shares</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clip</th>
                  <th className="text-center px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Track</th>
                </tr>
              </thead>
              <tbody>
                {clips.map((clip: any, i: number) => (
                  <tr key={i} className={`border-b border-[var(--border-subtle)] ${i % 2 === 1 ? "bg-[var(--bg-secondary)]" : ""}`}>
                    <td className="px-4 py-2.5 text-[var(--text-muted)] tabular-nums">{clip.num}</td>
                    <td className="px-3 py-2.5 text-[var(--text-secondary)]">{clip.platform}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-[var(--text-primary)] tabular-nums">{formatNumber(clip.views)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.likes)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.comments)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatNumber(clip.shares)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <a href={clip.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline text-xs">
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => setTrackingClip({ id: clip.id, clipUrl: clip.url, campaign: { name: campaign.name }, createdAt: clip.submitted })}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-input)] transition-colors"
                        title="View tracking"
                      >
                        <BarChart3 className="h-4 w-4 text-accent" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Daily breakdown */}
      {dailyBreakdown.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Daily Breakdown</h3>
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)]">
                  <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Date</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clips</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Views</th>
                  <th className="text-right px-3 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Likes</th>
                  <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Comments</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.map((day: any, i: number) => (
                  <tr key={day.date} className={`border-b border-[var(--border-subtle)] ${i % 2 === 1 ? "bg-[var(--bg-secondary)]" : ""}`}>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{day.date}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-primary)] tabular-nums">{day.clips}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-primary)] tabular-nums">{formatNumber(day.views)}</td>
                    <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatNumber(day.likes)}</td>
                    <td className="px-4 py-2.5 text-right text-[var(--text-secondary)] tabular-nums">{formatNumber(day.comments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TrackingModal clip={trackingClip} open={!!trackingClip} onClose={() => setTrackingClip(null)} />
    </div>
  );
}
