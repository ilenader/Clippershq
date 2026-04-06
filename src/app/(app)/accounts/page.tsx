"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { UserCircle, Plus, Copy, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { validateAccountLink } from "@/lib/account-validation";

const platformOptions = [
  { value: "TikTok", label: "TikTok" },
  { value: "Instagram", label: "Instagram" },
  { value: "YouTube", label: "YouTube" },
];

const statusDisplay: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const statusBadge: Record<string, string> = {
  PENDING: "pending",
  VERIFIED: "verified",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const healthColors: Record<string, { bg: string; text: string; border: string }> = {
  GOOD: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  NORMAL: { bg: "bg-accent/10", text: "text-accent", border: "border-accent/20" },
  SUSPICIOUS: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" },
};

export default function AccountsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin");
    }
  }, [session, userRole, router]);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingVerify, setPendingVerify] = useState<{ accountId: string; code: string; username: string; platform: string } | null>(null);
  const [form, setForm] = useState({ platform: "", username: "", profileLink: "", contentNiche: "", country: "" });
  const [clips, setClips] = useState<any[]>([]);
  const [checking, setChecking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      fetch("/api/accounts/mine").then((r) => r.json()),
      fetch("/api/clips/mine").then((r) => r.json()),
    ])
      .then(([accts, clipsData]) => {
        setAccounts(Array.isArray(accts) ? accts : []);
        setClips(Array.isArray(clipsData) ? clipsData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  function getAccountStats(accountId: string) {
    const accountClips = clips.filter((c: any) => c.clipAccountId === accountId);
    let totalViews = 0, totalLikes = 0, totalComments = 0;
    for (const c of accountClips) {
      const stat = c.stats?.[0];
      if (stat) { totalViews += stat.views || 0; totalLikes += stat.likes || 0; totalComments += stat.comments || 0; }
    }
    const likeRate = totalViews > 0 ? ((totalLikes / totalViews) * 100) : 0;
    const commentRate = totalViews > 0 ? ((totalComments / totalViews) * 100) : 0;
    let health: "GOOD" | "NORMAL" | "SUSPICIOUS" = "NORMAL";
    if (totalViews > 100) {
      if (likeRate >= 5 && commentRate >= 0.5) health = "GOOD";
      else if (likeRate < 1 || commentRate < 0.1) health = "SUSPICIOUS";
    }
    return { totalViews, totalLikes, totalComments, likeRate, commentRate, health, clipCount: accountClips.length };
  }

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.platform || !form.username || !form.profileLink) {
      toast.error("Please fill in all required fields.");
      return;
    }
    // Client-side platform/URL validation
    if (form.platform && form.profileLink) {
      const validation = validateAccountLink(form.platform, form.profileLink);
      if (!validation.valid) {
        setLinkError(validation.error);
        return;
      }
    }
    setLinkError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      toast.success("Account submitted!");
      setPendingVerify({ accountId: data.id, code: data.verificationCode, username: form.username, platform: form.platform });
      setForm({ platform: "", username: "", profileLink: "", contentNiche: "", country: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    }
    setSubmitting(false);
  };

  const cancelAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to cancel this submission?")) return;
    setDeleting(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to cancel"); }
      toast.success("Account submission cancelled.");
      load();
    } catch (err: any) { toast.error(err.message || "Failed to cancel."); }
    setDeleting(null);
  };

  const checkVerification = async (accountId: string) => {
    setChecking(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}/verify`, { method: "POST" });
      const data = await res.json();
      if (data.verified) {
        toast.success(data.message || "Account verified and approved!");
        setPendingVerify(null);
        setShowModal(false);
        load();
      } else {
        toast.error(data.message || "Code not found in bio yet. Update your bio and try again in a few seconds.");
      }
    } catch { toast.error("Verification check failed. Try again."); }
    setChecking(null);
  };

  const copyCode = (code: string) => { navigator.clipboard.writeText(code); toast.success("Code copied!"); };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Accounts</h1>
          <p className="text-base text-[var(--text-secondary)]">Submit and manage your social media accounts.</p>
        </div>
        <Button onClick={() => { setShowModal(true); setPendingVerify(null); }} icon={<Plus className="h-4 w-4" />}>
          Add Account
        </Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<UserCircle className="h-10 w-10" />}
          title="No accounts submitted"
          description="Add a social media account to start submitting clips."
          action={<Button onClick={() => { setShowModal(true); setPendingVerify(null); }} icon={<Plus className="h-4 w-4" />}>Add Account</Button>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {accounts.map((account: any) => {
            const stats = account.status === "APPROVED" ? getAccountStats(account.id) : null;
            const hc = stats ? healthColors[stats.health] : null;
            return (
              <Card key={account.id} className="p-3.5">
                {/* Header: username + platform + status */}
                <div className="flex items-start justify-between mb-2.5">
                  <div>
                    <p className="text-base font-semibold text-[var(--text-primary)]">{account.username}</p>
                    <Badge variant={(statusBadge[account.status] || "pending") as any} className="mt-0.5">
                      {account.platform} · {statusDisplay[account.status] || account.status}
                    </Badge>
                  </div>
                  {stats && hc && stats.health === "GOOD" && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${hc.bg} ${hc.text} ${hc.border}`}>
                      {stats.health}
                    </span>
                  )}
                </div>

                {/* Niche + country — OWNER only */}
                {userRole === "OWNER" && (account.contentNiche || account.country) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[var(--text-muted)] mt-1">
                    {account.contentNiche && <span>Niche: {account.contentNiche}</span>}
                    {account.country && <span>Country: {account.country}</span>}
                  </div>
                )}

                {/* Stats grid for APPROVED accounts */}
                {stats && stats.clipCount > 0 && (
                  <div className="grid grid-cols-4 gap-2 pt-2.5 border-t border-[var(--border-subtle)]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.totalViews.toLocaleString()}</p>
                      <p className="text-xs text-[var(--text-muted)]">Views</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.totalLikes.toLocaleString()}</p>
                      <p className="text-xs text-[var(--text-muted)]">Likes</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.totalComments.toLocaleString()}</p>
                      <p className="text-xs text-[var(--text-muted)]">Comments</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{stats.clipCount}</p>
                      <p className="text-xs text-[var(--text-muted)]">Clips</p>
                    </div>
                  </div>
                )}

                {/* Verification for PENDING */}
                {account.verificationCode && account.status === "PENDING" && (
                  <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
                    <p className="text-sm font-medium text-accent mb-2">Verification code</p>
                    <div className="flex items-center gap-2 mb-3">
                      <code className="text-xl font-bold text-accent tracking-[0.2em]">{account.verificationCode}</code>
                      <button onClick={() => copyCode(account.verificationCode)} className="rounded-md p-1.5 text-accent hover:bg-accent/10 transition-colors cursor-pointer">
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mb-3">Add this code to your {account.platform} bio, wait a few seconds, then click verify.</p>
                    <Button size="sm" className="w-full" loading={checking === account.id} onClick={() => checkVerification(account.id)} icon={<CheckCircle className="h-4 w-4" />}>
                      Verify now
                    </Button>
                  </div>
                )}

                {/* Remove button for non-APPROVED */}
                {account.status !== "APPROVED" && (
                  <div className="mt-3">
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/5" loading={deleting === account.id} onClick={() => cancelAccount(account.id)} icon={<Trash2 className="h-3.5 w-3.5" />}>
                      Remove
                    </Button>
                  </div>
                )}

                {/* Approved indicator */}
                {account.status === "APPROVED" && (
                  <div className="mt-4 flex items-center gap-1.5 text-base text-accent">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Verified and approved</span>
                  </div>
                )}

                {/* Rejection reason */}
                {account.status === "REJECTED" && account.rejectionReason && (
                  <div className="mt-3 rounded-xl bg-red-500/5 border border-red-500/10 px-4 py-3 text-sm text-red-400">
                    Reason: {account.rejectionReason}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Submit / Verify Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setPendingVerify(null); }} title={pendingVerify ? "Verify your account" : "Add account"}>
        {pendingVerify ? (
          <div className="space-y-5 py-2">
            <div className="text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-3">
                <UserCircle className="h-6 w-6 text-accent" />
              </div>
              <p className="text-base font-medium text-[var(--text-primary)]">{pendingVerify.username} on {pendingVerify.platform}</p>
            </div>
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 text-center">
              <p className="text-sm text-[var(--text-muted)] mb-2">Your verification code</p>
              <div className="flex items-center justify-center gap-3">
                <code className="text-3xl font-bold text-accent tracking-[0.3em]">{pendingVerify.code}</code>
                <button onClick={() => copyCode(pendingVerify.code)} className="rounded-lg p-2 text-accent hover:bg-accent/10 transition-colors cursor-pointer">
                  <Copy className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-base text-[var(--text-primary)] font-medium mb-1">How to verify</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--text-secondary)]">
                <li>Copy the code above</li>
                <li>Go to your {pendingVerify.platform} profile</li>
                <li>Paste the code anywhere in your bio</li>
                <li>Wait a few seconds, then click "Verify now" below</li>
              </ol>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => { setPendingVerify(null); setShowModal(false); }}>Later</Button>
              <Button className="flex-1" loading={checking === pendingVerify.accountId} onClick={() => checkVerification(pendingVerify.accountId)} icon={<CheckCircle className="h-4 w-4" />}>Verify now</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select id="platform" label="Platform *" options={platformOptions} placeholder="Select platform" value={form.platform} onChange={(e) => { setForm({ ...form, platform: e.target.value }); setLinkError(null); }} />
            <Input id="username" label="Username *" placeholder="your_username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <div>
              <Input id="profileLink" label="Profile link *" placeholder="https://tiktok.com/@your_username" value={form.profileLink} onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, profileLink: val });
                if (form.platform && val.length > 10) {
                  const v = validateAccountLink(form.platform, val);
                  setLinkError(v.valid ? null : v.error);
                } else {
                  setLinkError(null);
                }
              }} />
              {linkError && <p className="mt-1.5 text-xs text-red-400">{linkError}</p>}
            </div>
            <Input id="contentNiche" label="Content niche" placeholder="e.g. Comedy, Gaming, Fashion" value={form.contentNiche} onChange={(e) => setForm({ ...form, contentNiche: e.target.value })} />
            <Input id="country" label="Country" placeholder="Optional" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2.5">
              <p className="text-sm text-[var(--text-muted)]">After submitting, you&apos;ll get a short verification code to place in your bio. This proves account ownership.</p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" required className="mt-1 h-4 w-4 rounded border-[var(--border-color)] accent-accent" />
              <span className="text-sm text-[var(--text-primary)]">I agree to the Terms of Service and confirm this is my real account with genuine content.</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Submit account</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
