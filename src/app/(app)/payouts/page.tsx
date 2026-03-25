"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatRelative } from "@/lib/utils";

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    campaignId: "",
    amount: "",
    walletAddress: "",
    discordUsername: "",
    proofNote: "",
  });

  // Returns a promise that resolves when both fetches complete and state is set
  const load = useCallback(async () => {
    const ts = Date.now();
    try {
      const [payoutsRes, earningsRes, clipsRes] = await Promise.all([
        fetch(`/api/payouts/mine?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/earnings?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/clips/mine?_t=${ts}`, { cache: "no-store" }),
      ]);
      const [payoutsData, earningsData, clipsData] = await Promise.all([
        payoutsRes.json(), earningsRes.json(), clipsRes.json(),
      ]);
      setPayouts(Array.isArray(payoutsData) ? payoutsData : []);
      setEarnings(earningsData);
      setClips(Array.isArray(clipsData) ? clipsData : []);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (amount < 10) {
      toast.error("Minimum payout is $10.");
      return;
    }
    if (!form.walletAddress.trim()) {
      toast.error("Please enter a wallet address.");
      return;
    }
    if (!form.discordUsername.trim()) {
      toast.error("Discord username is required.");
      return;
    }
    if (earnings && amount > (earnings.available || 0)) {
      toast.error(`Amount exceeds available balance (${formatCurrency(earnings.available || 0)}).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount }),
      });
      const respData = await res.json();
      if (!res.ok) {
        throw new Error(respData.error || "Failed to submit");
      }
      // Close modal and reset form first
      setShowModal(false);
      setForm({ campaignId: "", amount: "", walletAddress: "", discordUsername: "", proofNote: "" });
      // AWAIT the refetch — list and balance update BEFORE success toast
      await load();
      toast.success("Payout request submitted.");
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const statusMap: Record<string, string> = {
    REQUESTED: "pending",
    UNDER_REVIEW: "pending",
    APPROVED: "approved",
    PAID: "active",
    REJECTED: "rejected",
  };

  // Earnings per campaign
  const campaignEarnings: Record<string, { name: string; earned: number }> = {};
  for (const clip of clips) {
    if (clip.earnings > 0 && clip.campaignId) {
      if (!campaignEarnings[clip.campaignId]) {
        campaignEarnings[clip.campaignId] = { name: clip.campaign?.name || "Unknown", earned: 0 };
      }
      campaignEarnings[clip.campaignId].earned += clip.earnings;
    }
  }
  const campaignList = Object.entries(campaignEarnings).map(([id, data]) => ({ id, ...data }));

  const statusLabel: Record<string, string> = {
    REQUESTED: "Requested",
    UNDER_REVIEW: "Under review",
    APPROVED: "Approved",
    PAID: "Paid",
    REJECTED: "Rejected",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Payout Requests</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Available balance: <span className="font-semibold text-accent">{formatCurrency(earnings?.available || 0)}</span>
            {earnings?.lockedInPayouts > 0 && (
              <span className="text-[var(--text-muted)]"> · {formatCurrency(earnings.lockedInPayouts)} in queue</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          icon={<Plus className="h-4 w-4" />}
          disabled={(earnings?.available || 0) <= 0}
        >
          Request Payout
        </Button>
      </div>

      {/* Earnings by campaign */}
      {campaignList.length > 0 && (
        <Card>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-3">Earnings by campaign</h3>
          <div className="space-y-2">
            {campaignList.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-[var(--text-primary)]">{c.name}</span>
                <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatCurrency(c.earned)}</span>
              </div>
            ))}
            <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-muted)]">Total</span>
              <span className="text-sm font-bold text-accent tabular-nums">{formatCurrency(earnings?.totalEarned || 0)}</span>
            </div>
          </div>
        </Card>
      )}

      {payouts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="No payout requests"
          description="Request a payout when you have available earnings."
        />
      ) : (
        <div className="space-y-3">
          {payouts.map((payout: any) => (
            <Card key={payout.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-[var(--text-primary)]">{formatCurrency(payout.amount)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {formatRelative(payout.createdAt)} · {payout.walletAddress}
                  </p>
                </div>
                <Badge variant={statusMap[payout.status] as any}>
                  {statusLabel[payout.status] || payout.status}
                </Badge>
              </div>
              {payout.status === "REJECTED" && payout.rejectionReason && (
                <div className="mt-3 rounded-lg bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  Reason: {payout.rejectionReason}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Request Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Request Payout">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 mb-2">
            <p className="text-xs text-[var(--text-muted)]">Available balance</p>
            <p className="text-xl font-bold text-accent">{formatCurrency(earnings?.available || 0)}</p>
          </div>
          {campaignList.length > 1 && (
            <Select
              id="campaignId"
              label="Campaign (optional)"
              options={campaignList.map((c) => ({ value: c.id, label: `${c.name} — ${formatCurrency(c.earned)}` }))}
              placeholder="All campaigns"
              value={form.campaignId}
              onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
            />
          )}
          <Input
            id="amount"
            label="Amount *"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <Input
            id="walletAddress"
            label="Wallet address *"
            placeholder="Your wallet address"
            value={form.walletAddress}
            onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
          />
          <Input
            id="discordUsername"
            label="Discord username *"
            placeholder="your_discord_name"
            value={form.discordUsername}
            onChange={(e) => setForm({ ...form, discordUsername: e.target.value })}
          />
          <Textarea
            id="proofNote"
            label="Proof note"
            placeholder="Include any relevant notes or proof description"
            value={form.proofNote}
            onChange={(e) => setForm({ ...form, proofNote: e.target.value })}
          />
          <p className="text-xs text-[var(--text-muted)]">
            Minimum payout is $10. A screen recording of your analytics may be required for verification.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={submitting}>Submit Request</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
