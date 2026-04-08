"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Film, TrendingUp } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function AgencyEarningsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState("");

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

  const allCampaigns: any[] = data?.allCampaigns || [];
  const campaigns: any[] = data?.campaigns || [];
  const filtered = selectedCampaign ? campaigns.filter((c: any) => c.id === selectedCampaign) : campaigns;

  const totalEarnings = filtered.reduce((s: number, c: any) => s + (c.displayEarnings || 0), 0);
  const totalCpmEarnings = filtered.filter((c: any) => c.pricingModel === "CPM_SPLIT").reduce((s: number, c: any) => s + c.totalOwnerEarnings, 0);
  const totalAgencyFees = filtered.filter((c: any) => c.pricingModel !== "CPM_SPLIT").reduce((s: number, c: any) => s + (c.agencyFee || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agency Earnings</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Owner/agency earnings across all campaigns.</p>
        </div>
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none cursor-pointer"
        >
          <option value="">All Campaigns</option>
          {allCampaigns.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-accent/20 bg-accent/5">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-accent" /><span className="text-xs text-[var(--text-muted)]">Total Earnings</span></div>
          <p className="text-2xl font-bold text-accent">{formatCurrency(totalEarnings)}</p>
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
          <p className="text-2xl font-bold text-[var(--text-primary)]">{filtered.length}</p>
        </Card>
      </div>

      {/* Campaign list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((c: any) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.name}</p>
                    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.pricingModel === "CPM_SPLIT" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                      {c.pricingModel === "CPM_SPLIT" ? "CPM Split" : "Agency Fee"}
                    </span>
                    <Badge variant={c.status.toLowerCase() as any}>{c.status}</Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.platform}
                    {c.pricingModel === "CPM_SPLIT" && c.ownerCpm ? ` · Owner CPM: ${formatCurrency(c.ownerCpm)} · ${c.clipCount} clips · ${formatNumber(c.totalViews)} views` : ""}
                    {c.budget ? ` · Budget: ${formatCurrency(c.budget)}` : ""}
                  </p>
                </div>
                <p className={`text-lg font-bold flex-shrink-0 ${c.pricingModel === "CPM_SPLIT" ? "text-emerald-400" : "text-amber-400"}`}>
                  {formatCurrency(c.displayEarnings)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {campaigns.length === 0
              ? "No agency earnings yet. Set an Agency Fee or Owner CPM on your campaigns."
              : "No campaigns match your filter."}
          </p>
        </Card>
      )}
    </div>
  );
}
