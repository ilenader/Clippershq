"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignImage } from "@/components/ui/campaign-image";
import { Megaphone, Eye } from "lucide-react";
import { formatNumber, formatCurrency } from "@/lib/utils";

export default function ClientCampaignsPage() {
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
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Campaigns</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">View performance for your assigned campaigns.</p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-10 w-10" />}
          title="No campaigns"
          description="You don't have any campaigns assigned yet."
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
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{c.platform}</p>
                </div>
                <Badge variant={c.status.toLowerCase() as any}>{c.status}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-accent" /> {formatNumber(c.totalViews || 0)} views</span>
                <span>{c.approvedClips || 0} approved</span>
                <span>{c.pendingClips || 0} pending</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
