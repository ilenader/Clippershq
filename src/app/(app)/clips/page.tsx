"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Film, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatRelative, formatNumber, formatCurrency } from "@/lib/utils";

export default function ClipsPage() {
  const [clips, setClips] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    campaignId: "",
    clipAccountId: "",
    clipUrl: "",
    note: "",
  });

  const load = () => {
    Promise.all([
      fetch("/api/clips/mine").then((r) => r.json()),
      fetch("/api/campaigns?status=ACTIVE").then((r) => r.json()),
      fetch("/api/accounts/mine?status=APPROVED").then((r) => r.json()),
    ])
      .then(([clipsData, campaignsData, accountsData]) => {
        setClips(clipsData);
        setCampaigns(campaignsData);
        setAccounts(accountsData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId || !form.clipAccountId || !form.clipUrl) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      toast.success("Your clip was submitted successfully.");
      setShowModal(false);
      setForm({ campaignId: "", clipAccountId: "", clipUrl: "", note: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Submission failed. Please try again or contact support.");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Clips</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Submit and track your clips.</p>
        </div>
        <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
          Submit Clip
        </Button>
      </div>

      {clips.length === 0 ? (
        <EmptyState
          icon={<Film className="h-10 w-10" />}
          title="No clips submitted"
          description="Submit your first clip for an active campaign."
          action={
            <Button onClick={() => setShowModal(true)} icon={<Plus className="h-4 w-4" />}>
              Submit Clip
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
          {/* Header */}
          <div className="grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px] gap-2 px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            <span>Account</span>
            <span>Campaign</span>
            <span>Clip</span>
            <span className="text-right">Views</span>
            <span className="text-right">Likes</span>
            <span className="text-right">Comments</span>
            <span className="text-right">Shares</span>
            <span className="text-right">Earned</span>
            <span>Status</span>
          </div>
          {/* Rows */}
          {clips.map((clip: any) => {
            const stat = clip.stats?.[0];
            return (
              <div key={clip.id} className="grid grid-cols-[160px_140px_80px_72px_72px_72px_72px_80px_72px] gap-2 items-center px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors">
                {/* Account */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {clip.clipAccount?.username || "—"}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">{formatRelative(clip.createdAt)}</p>
                </div>
                {/* Campaign */}
                <p className="text-sm text-[var(--text-secondary)] truncate">{clip.campaign?.name || "—"}</p>
                {/* Clip link */}
                <a
                  href={clip.clipUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10 transition-colors truncate"
                >
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  Open
                </a>
                {/* Metrics */}
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.views) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.likes) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.comments) : "0"}</span>
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{stat ? formatNumber(stat.shares) : "0"}</span>
                {/* Earnings */}
                <span className="text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{clip.earnings > 0 ? formatCurrency(clip.earnings) : "—"}</span>
                {/* Status */}
                <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Submit Clip">
        {accounts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">You need an approved account before submitting clips.</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Go to Accounts and submit one first.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select id="campaignId" label="Campaign *" options={campaigns.map((c: any) => ({ value: c.id, label: `${c.name} (${c.platform})` }))} placeholder="Select campaign" value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} />
            <Select id="clipAccountId" label="Account *" options={accounts.map((a: any) => ({ value: a.id, label: `${a.username} (${a.platform})` }))} placeholder="Select approved account" value={form.clipAccountId} onChange={(e) => setForm({ ...form, clipAccountId: e.target.value })} />
            <Input id="clipUrl" label="Clip URL *" placeholder="https://tiktok.com/..." value={form.clipUrl} onChange={(e) => setForm({ ...form, clipUrl: e.target.value })} />
            <Textarea id="note" label="Note (optional)" placeholder="Any additional info..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2.5">
              <p className="text-xs text-[var(--text-muted)]">Submitted clips are reviewed within 24–48 hours.</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Submit Clip</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
