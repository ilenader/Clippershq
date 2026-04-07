"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TimeframeSelect, filterByTimeframe } from "@/components/ui/timeframe-select";
import { DollarSign, Eye, Film, TrendingUp } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function AgencyEarningsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeframeDays, setTimeframeDays] = useState(30);

  useEffect(() => {
    fetch("/api/admin/agency-earnings")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  const campaigns = data?.campaigns || [];
  const cpmSplitCampaigns = campaigns.filter((c: any) => c.pricingModel === "CPM_SPLIT" && c.totalOwnerEarnings > 0);
  const agencyFeeCampaigns = campaigns.filter((c: any) => c.pricingModel === "AGENCY_FEE" && c.agencyFee);
  const totalCpmEarnings = cpmSplitCampaigns.reduce((s: number, c: any) => s + c.totalOwnerEarnings, 0);
  const totalAgencyFees = agencyFeeCampaigns.reduce((s: number, c: any) => s + (c.agencyFee || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agency Earnings</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Owner/agency earnings across all campaigns.</p>
        </div>
        <TimeframeSelect value={timeframeDays} onChange={setTimeframeDays} />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-accent/20 bg-accent/5">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-accent" /><span className="text-xs text-[var(--text-muted)]">Total Earnings</span></div>
          <p className="text-2xl font-bold text-accent">{formatCurrency(data?.total || 0)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /><span className="text-xs text-[var(--text-muted)]">CPM Split Earnings</span></div>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalCpmEarnings)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs text-[var(--text-muted)]">Agency Fees</span></div>
          <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalAgencyFees)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 mb-1"><Film className="h-3.5 w-3.5 text-[var(--text-muted)]" /><span className="text-xs text-[var(--text-muted)]">Campaigns</span></div>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{cpmSplitCampaigns.length + agencyFeeCampaigns.length}</p>
        </Card>
      </div>

      {/* CPM Split campaigns */}
      {cpmSplitCampaigns.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">CPM Split Campaigns</h2>
          <div className="space-y-2">
            {cpmSplitCampaigns.map((c: any) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{c.platform} · Owner CPM: {formatCurrency(c.ownerCpm || 0)} · {c.clipCount} clips</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-accent">{formatCurrency(c.totalOwnerEarnings)}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatNumber(c.totalViews)} views</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Agency Fee campaigns */}
      {agencyFeeCampaigns.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Agency Fee Campaigns</h2>
          <div className="space-y-2">
            {agencyFeeCampaigns.map((c: any) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{c.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{c.platform} · <Badge variant={c.status.toLowerCase() as any}>{c.status}</Badge></p>
                  </div>
                  <p className="text-lg font-bold text-amber-400">{formatCurrency(c.agencyFee)}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {campaigns.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">No agency earnings yet. Create a campaign with Agency Fee or CPM Split pricing.</p>
        </Card>
      )}
    </div>
  );
}
