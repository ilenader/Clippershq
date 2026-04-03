"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { formatCurrency } from "@/lib/utils";
import {
  Megaphone, Film, UserCircle, Wallet, AlertTriangle,
  ClipboardList, Users, Activity, Flame, TrendingUp, Clock,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboardPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    try {
      const ts = Date.now();
      const [cRes, clRes, aRes, pRes] = await Promise.all([
        fetch(`/api/campaigns?scope=manage&_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/clips?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/accounts?_t=${ts}`, { cache: "no-store" }).catch(() => null),
        fetch(`/api/payouts?_t=${ts}`, { cache: "no-store" }).catch(() => null),
      ]);
      const [c, cl] = await Promise.all([cRes.json(), clRes.json()]);
      const a = aRes ? await aRes.json().catch(() => []) : [];
      const p = pRes ? await pRes.json().catch(() => []) : [];
      setCampaigns(Array.isArray(c) ? c : []);
      setClips(Array.isArray(cl) ? cl : []);
      setAccounts(Array.isArray(a) ? a : []);
      setPayouts(Array.isArray(p) ? p : []);
    } catch (err) {
      console.error("Dashboard load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useAutoRefresh(loadAll, 15000);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const filteredClips = selectedCampaigns.length > 0
    ? clips.filter((c: any) => selectedCampaigns.includes(c.campaignId))
    : clips;

  const activeCampaigns = (selectedCampaigns.length > 0
    ? campaigns.filter((c: any) => c.status === "ACTIVE" && selectedCampaigns.includes(c.id))
    : campaigns.filter((c: any) => c.status === "ACTIVE"))
    .length;
  const totalCampaigns = selectedCampaigns.length > 0 ? selectedCampaigns.length : campaigns.length;
  const uniqueClippers = new Set(filteredClips.map((c: any) => c.userId).filter(Boolean));
  const pendingClips = filteredClips.filter((c: any) => c.status === "PENDING").length;
  const approvedClips = filteredClips.filter((c: any) => c.status === "APPROVED").length;
  const flaggedClips = filteredClips.filter((c: any) => c.status === "FLAGGED").length;

  const filteredAccounts = selectedCampaigns.length > 0
    ? accounts.filter((a: any) => a.campaignAccounts?.some((ca: any) => selectedCampaigns.includes(ca.campaignId)))
    : accounts;
  const pendingAccounts = filteredAccounts.filter((a: any) => a.status === "PENDING").length;
  const approvedAccounts = filteredAccounts.filter((a: any) => a.status === "APPROVED").length;

  const filteredPayouts = selectedCampaigns.length > 0
    ? payouts.filter((p: any) => selectedCampaigns.includes(p.campaignId))
    : payouts;
  const pendingPayouts = filteredPayouts.filter((p: any) => p.status === "REQUESTED" || p.status === "UNDER_REVIEW");
  const pendingPayoutAmount = pendingPayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

  const campaignOptions = campaigns.map((c: any) => ({ value: c.id, label: c.name }));

  // Money overview
  const totalEarned = filteredClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const approvedEarnings = filteredClips.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const pendingEarnings = filteredClips.filter((c: any) => c.status === "PENDING").reduce((s: number, c: any) => s + (c.earnings || 0), 0);
  const paidOut = filteredPayouts.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + (p.amount || 0), 0);
  const remaining = approvedEarnings - paidOut;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            {selectedCampaigns.length > 0
              ? `Showing ${selectedCampaigns.length} campaign${selectedCampaigns.length > 1 ? "s" : ""}`
              : "Control center"}
          </p>
        </div>
        {campaignOptions.length > 0 && (
          <MultiDropdown label="Campaign" options={campaignOptions} values={selectedCampaigns} onChange={setSelectedCampaigns} allLabel="All campaigns" />
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/campaigns"><Card hover>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Active campaigns</p>
            <Megaphone className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{activeCampaigns}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{totalCampaigns} total</p>
        </Card></Link>
        <Link href="/admin/clips"><Card hover>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clips</p>
            <Film className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{filteredClips.length}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{pendingClips} pending · {approvedClips} approved</p>
        </Card></Link>
        <Link href="/admin/accounts"><Card hover>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Accounts</p>
            <UserCircle className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{filteredAccounts.length}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{approvedAccounts} approved · {pendingAccounts} pending</p>
        </Card></Link>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Clippers</p>
            <Users className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{uniqueClippers.size}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">unique submitters</p>
        </Card>
      </div>

      {/* Action cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Link href="/admin/payouts"><Card hover className={pendingPayouts.length > 0 ? "border-accent/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Payout queue</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{formatCurrency(pendingPayoutAmount)}</p>
            </div>
            <Wallet className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{pendingPayouts.length} pending</p>
        </Card></Link>
        <Card className={flaggedClips > 0 ? "border-orange-500/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Flagged</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{flaggedClips}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Requires review</p>
        </Card>
        <Card className={pendingAccounts > 0 ? "border-accent/20" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Pending accounts</p>
              <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{pendingAccounts}</p>
            </div>
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Awaiting verification</p>
        </Card>
      </div>

      {/* Campaign Health */}
      {(() => {
        const activeCampaignList = campaigns.filter((c: any) => c.status === "ACTIVE");
        if (activeCampaignList.length === 0) return null;
        const now = Date.now();
        const h24 = 24 * 60 * 60 * 1000;
        const d7 = 7 * 24 * 60 * 60 * 1000;
        const healthData = activeCampaignList.map((camp: any) => {
          const campClips = filteredClips.filter((c: any) => c.campaignId === camp.id);
          const clips24h = campClips.filter((c: any) => now - new Date(c.createdAt).getTime() < h24).length;
          const clips7d = campClips.filter((c: any) => now - new Date(c.createdAt).getTime() < d7).length;
          const clippers = new Set(campClips.filter((c: any) => now - new Date(c.createdAt).getTime() < d7).map((c: any) => c.userId)).size;
          let health: "Hot" | "Active" | "Slow" | "Dead";
          if (clips24h >= 5) health = "Hot";
          else if (clips24h >= 1) health = "Active";
          else if (clips7d > 0) health = "Slow";
          else health = "Dead";
          return { id: camp.id, name: camp.name, platform: camp.platform, health, clips24h, clips7d, clippers };
        });
        const order = { Hot: 0, Active: 1, Slow: 2, Dead: 3 };
        healthData.sort((a: any, b: any) => order[a.health as keyof typeof order] - order[b.health as keyof typeof order]);
        const healthStyle: Record<string, { icon: React.ReactNode; color: string; border: string }> = {
          Hot: { icon: <Flame className="h-3.5 w-3.5" />, color: "text-accent bg-accent/10 border-accent/20", border: "" },
          Active: { icon: <TrendingUp className="h-3.5 w-3.5" />, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", border: "" },
          Slow: { icon: <Clock className="h-3.5 w-3.5" />, color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", border: "" },
          Dead: { icon: <AlertTriangle className="h-3.5 w-3.5" />, color: "text-red-400 bg-red-500/10 border-red-500/20", border: "border-red-500/20" },
        };
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Campaign Health</h2>
            </div>
            <div className="space-y-2">
              {healthData.map((camp: any) => {
                const hs = healthStyle[camp.health];
                return (
                  <div key={camp.id} className={`rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 flex items-center justify-between gap-3 ${hs.border}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{camp.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{camp.clips24h} today · {camp.clips7d} this week · {camp.clippers} clipper{camp.clippers !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${hs.color}`}>
                      {hs.icon} {camp.health}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Total Money Overview */}
      <Card>
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-3">Total money overview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Total earned", value: formatCurrency(totalEarned) },
            { label: "Approved", value: formatCurrency(approvedEarnings) },
            { label: "Pending", value: formatCurrency(pendingEarnings) },
            { label: "Paid out", value: formatCurrency(paidOut) },
            { label: "Remaining", value: formatCurrency(remaining) },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-xs text-[var(--text-muted)]">{item.label}</p>
              <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
