"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Film, Plus, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative, formatNumber, formatCurrency } from "@/lib/utils";

export default function ClipsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  // Role isolation: clips page is clipper-only
  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin");
    }
  }, [session, userRole, router]);
  const [clips, setClips] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [joinedCampaignIds, setJoinedCampaignIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    campaignId: "",
    clipAccountId: "",
    clipUrl: "",
    note: "",
  });

  const load = async () => {
    try {
      const ts = Date.now();
      const [clipsRes, campaignsRes, accountsRes, joinsRes] = await Promise.all([
        fetch(`/api/clips/mine?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/campaigns?status=ACTIVE&_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/accounts/mine?status=APPROVED&_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/campaign-accounts?_t=${ts}`, { cache: "no-store" }),
      ]);
      const [clipsData, campaignsData, accountsData, joinsData] = await Promise.all([
        clipsRes.json(),
        campaignsRes.json(),
        accountsRes.json(),
        joinsRes.json(),
      ]);
      setClips(Array.isArray(clipsData) ? clipsData : []);
      setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      const joinsArr = Array.isArray(joinsData) ? joinsData : [];
      setJoinedCampaignIds(new Set(joinsArr.map((j: any) => j.campaignId)));
    } catch (err) {
      console.error("Failed to load clips page data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Compute remaining daily submissions per campaign
  const getDailyRemaining = (campaignId: string): { remaining: number; limit: number } => {
    const campaign = campaigns.find((c: any) => c.id === campaignId);
    const limit = campaign?.maxClipsPerUserPerDay ?? 3;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayCount = clips.filter(
      (c: any) => c.campaignId === campaignId && new Date(c.createdAt) >= startOfDay && !c.isDeleted
    ).length;
    return { remaining: Math.max(0, limit - todayCount), limit };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId || !form.clipAccountId || !form.clipUrl) {
      toast.error("Please fill in all required fields.");
      return;
    }

    // Frontend platform match check
    const selectedAccount = accounts.find((a: any) => a.id === form.clipAccountId);
    if (selectedAccount) {
      const url = form.clipUrl.toLowerCase();
      const plat = selectedAccount.platform;
      const platformUrls: Record<string, string[]> = {
        TikTok: ["tiktok.com"],
        Instagram: ["instagram.com", "instagr.am"],
        YouTube: ["youtube.com", "youtu.be"],
      };
      const expected = platformUrls[plat] || [];
      if (expected.length > 0 && !expected.some((d) => url.includes(d))) {
        toast.error(`Platform mismatch: your account is ${plat} but the URL is not a ${plat} link.`);
        return;
      }
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
      setShowModal(false);
      setForm({ campaignId: "", clipAccountId: "", clipUrl: "", note: "" });
      // Await load so clips list is updated before success toast
      await load();
      toast.success("Your clip was submitted successfully.");
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
        <div className="space-y-2">
          {clips.map((clip: any) => {
            const stat = clip.stats?.[0];
            return (
              <div key={clip.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                {/* Top: account + campaign + status */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{clip.clipAccount?.username || "-"}</p>
                    <p className="text-xs text-[var(--text-muted)]">{clip.campaign?.name || "-"} · {formatRelative(clip.createdAt)}</p>
                  </div>
                  <Badge variant={clip.status.toLowerCase() as any}>{clip.status}</Badge>
                </div>
                {/* Middle: link + stats */}
                <div className="flex items-center gap-4 flex-wrap">
                  <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-accent/15 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors">
                    <ExternalLink className="h-3 w-3" /> Open clip
                  </a>
                  <div className="flex items-center gap-4 text-sm">
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.views) : "0"}</span> <span className="text-[var(--text-muted)]">views</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.likes) : "0"}</span> <span className="text-[var(--text-muted)]">likes</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.comments) : "0"}</span> <span className="text-[var(--text-muted)]">comments</span></span>
                    <span><span className="font-medium text-[var(--text-primary)] tabular-nums">{stat ? formatNumber(stat.shares) : "0"}</span> <span className="text-[var(--text-muted)]">shares</span></span>
                    {clip.status === "APPROVED" && clip.earnings > 0 && <span className="font-medium text-accent tabular-nums">{formatCurrency(clip.earnings)}</span>}
                  </div>
                </div>
                {clip.status === "REJECTED" && clip.rejectionReason && (
                  <div className="mt-2 rounded-lg bg-red-500/5 px-3 py-1.5 text-xs text-red-400">Reason: {clip.rejectionReason}</div>
                )}
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
            <Select id="campaignId" label="Campaign *" options={campaigns.filter((c: any) => joinedCampaignIds.has(c.id)).map((c: any) => ({ value: c.id, label: `${c.name} (${c.platform})` }))} placeholder={joinedCampaignIds.size === 0 ? "Join a campaign first" : "Select campaign"} value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })} />
            <Select id="clipAccountId" label="Account *" options={accounts.map((a: any) => ({ value: a.id, label: `${a.username} (${a.platform})` }))} placeholder="Select approved account" value={form.clipAccountId} onChange={(e) => setForm({ ...form, clipAccountId: e.target.value })} />
            <Input id="clipUrl" label="Clip URL *" placeholder="https://tiktok.com/@user/video/..." value={form.clipUrl} onChange={(e) => setForm({ ...form, clipUrl: e.target.value })} />
            <Textarea id="note" label="Note (optional)" placeholder="Any additional info..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            {form.campaignId && (() => {
              const { remaining, limit } = getDailyRemaining(form.campaignId);
              return (
                <div className={`rounded-lg px-3 py-2 text-xs font-medium ${remaining === 0 ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-accent/10 text-accent border border-accent/20"}`}>
                  {remaining === 0
                    ? "You reached the maximum number of uploaded clips for this campaign today."
                    : `You have ${remaining} of ${limit} submission${limit > 1 ? "s" : ""} remaining today for this campaign.`
                  }
                </div>
              );
            })()}
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5 space-y-1">
              <p className="text-xs font-medium text-yellow-400">Important rules</p>
              <p className="text-xs text-[var(--text-muted)]">• You must join a campaign before submitting clips to it</p>
              <p className="text-xs text-[var(--text-muted)]">• The clip URL must match your account platform (TikTok account → TikTok link)</p>
              <p className="text-xs text-[var(--text-muted)]">• You must submit the clip within 2 hours after posting</p>
              <p className="text-xs text-accent">• Post time is verified automatically from the platform</p>
              <p className="text-xs text-[var(--text-muted)]">• Clips are reviewed within 24–48 hours</p>
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
