"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EarningsChart } from "@/components/earnings/EarningsChart";
import { EarningsFilters } from "@/components/earnings/EarningsFilters";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { type EarningsFilterKey } from "@/lib/earnings";
import { Film, DollarSign, TrendingUp } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState({
    myClips: 0,
    totalEarnings: 0,
    pendingClips: 0,
  });
  const [allClips, setAllClips] = useState<any[]>([]);
  const [recentClips, setRecentClips] = useState<any[]>([]);
  const [earningsFilters, setEarningsFilters] = useState<EarningsFilterKey[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [clipsRes, earningsRes] = await Promise.all([
          fetch("/api/clips/mine"),
          fetch("/api/earnings"),
        ]);
        const clipsData = await clipsRes.json();
        const earningsData = await earningsRes.json();

        setAllClips(Array.isArray(clipsData) ? clipsData : []);
        setRecentClips(Array.isArray(clipsData) ? clipsData.slice(0, 5) : []);
        setStats({
          myClips: clipsData.length,
          totalEarnings: earningsData.totalEarned || 0,
          pendingClips: clipsData.filter((c: any) => c.status === "PENDING").length,
        });
      } catch {
        // Will show empty states
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Welcome back, {session?.user?.name?.split(" ")[0] || "Clipper"}
        </h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          Here&apos;s what&apos;s happening with your clips.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "My clips", value: stats.myClips, icon: <Film className="h-4 w-4" />, color: "text-accent" },
          { label: "Pending clips", value: stats.pendingClips, icon: <TrendingUp className="h-4 w-4" />, color: "text-accent" },
          { label: "Total earnings", value: formatCurrency(stats.totalEarnings), icon: <DollarSign className="h-4 w-4" />, color: "text-accent" },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</p>
              <span className={stat.color}>{stat.icon}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Earnings Chart */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Earnings over time</h2>
          <EarningsFilters values={earningsFilters} onChange={setEarningsFilters} />
        </div>
        <EarningsChart clips={allClips} filters={earningsFilters} />
      </div>

      {/* Recent Clips */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent clips</h2>
          <Link href="/clips" className="text-sm text-accent hover:underline">View all</Link>
        </div>
        {recentClips.length === 0 ? (
          <EmptyState
            icon={<Film className="h-10 w-10" />}
            title="No clips yet"
            description="Submit your first clip to get started."
          />
        ) : (
          <div className="space-y-2">
            {recentClips.map((clip: any) => (
              <Card key={clip.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-[15px] font-medium text-[var(--text-primary)]">{clip.campaign?.name}</p>
                  <p className="text-sm text-[var(--text-muted)]">{clip.clipAccount?.username} · {formatRelative(clip.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {clip.earnings > 0 && (
                    <span className="text-sm font-medium text-[var(--text-primary)]">{formatCurrency(clip.earnings)}</span>
                  )}
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
