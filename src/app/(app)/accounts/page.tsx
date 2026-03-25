"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { UserCircle, Plus, Copy, CheckCircle, RefreshCw, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

const platformOptions = [
  { value: "TikTok", label: "TikTok" },
  { value: "Instagram", label: "Instagram" },
  { value: "YouTube", label: "YouTube" },
  { value: "Twitter", label: "Twitter / X" },
  { value: "Snapchat", label: "Snapchat" },
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

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // After submission, store the account ID + code for verify flow
  const [pendingVerify, setPendingVerify] = useState<{ accountId: string; code: string; username: string; platform: string } | null>(null);
  const [form, setForm] = useState({
    platform: "",
    username: "",
    profileLink: "",
    contentNiche: "",
    country: "",
  });

  const load = () => {
    fetch("/api/accounts/mine")
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.platform || !form.username || !form.profileLink) {
      toast.error("Please fill in all required fields.");
      return;
    }
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
      setPendingVerify({
        accountId: data.id,
        code: data.verificationCode,
        username: form.username,
        platform: form.platform,
      });
      setForm({ platform: "", username: "", profileLink: "", contentNiche: "", country: "" });
      load();
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    }
    setSubmitting(false);
  };

  const [checking, setChecking] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const cancelAccount = async (accountId: string) => {
    if (!confirm("Are you sure you want to cancel this submission?")) return;
    setDeleting(accountId);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel");
      }
      toast.success("Account submission cancelled.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel.");
    }
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
    } catch {
      toast.error("Verification check failed. Try again.");
    }
    setChecking(null);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
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
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Accounts</h1>
          <p className="text-[15px] text-[var(--text-secondary)]">Submit and manage your social media accounts.</p>
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
          action={
            <Button onClick={() => { setShowModal(true); setPendingVerify(null); }} icon={<Plus className="h-4 w-4" />}>
              Add Account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account: any) => (
            <Card key={account.id}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">{account.username}</p>
                  <p className="text-[15px] text-[var(--text-secondary)]">{account.platform}</p>
                </div>
                <Badge variant={(statusBadge[account.status] || "pending") as any}>
                  {statusDisplay[account.status] || account.status}
                </Badge>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-[var(--text-secondary)]">
                {account.contentNiche && (
                  <p><span className="text-[var(--text-muted)]">Niche:</span> {account.contentNiche}</p>
                )}
                {account.country && (
                  <p><span className="text-[var(--text-muted)]">Country:</span> {account.country}</p>
                )}
                <p className="text-sm text-[var(--text-muted)]">Submitted {formatRelative(account.createdAt)}</p>
              </div>

              {/* Verification flow for pending accounts */}
              {account.verificationCode && account.status === "PENDING" && (
                <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
                  <p className="text-xs font-medium text-accent mb-1.5">Verification code</p>
                  <div className="flex items-center gap-2 mb-2">
                    <code className="text-lg font-bold text-accent tracking-[0.2em]">{account.verificationCode}</code>
                    <button
                      onClick={() => copyCode(account.verificationCode)}
                      className="rounded-md p-1 text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Add this code to your {account.platform} bio, wait a few seconds, then click verify.
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    loading={checking === account.id}
                    onClick={() => checkVerification(account.id)}
                    icon={<CheckCircle className="h-3.5 w-3.5" />}
                  >
                    Verify now
                  </Button>
                </div>
              )}

              {/* Cancel for non-approved accounts */}
              {account.status !== "APPROVED" && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/5"
                    loading={deleting === account.id}
                    onClick={() => cancelAccount(account.id)}
                    icon={<Trash2 className="h-3 w-3" />}
                  >
                    Remove
                  </Button>
                </div>
              )}

              {account.status === "APPROVED" && (
                <div className="mt-3 flex items-center gap-1.5 text-sm text-accent">
                  <CheckCircle className="h-4 w-4" />
                  <span>Verified and approved</span>
                </div>
              )}

              {account.status === "REJECTED" && account.rejectionReason && (
                <div className="mt-3 rounded-xl bg-red-500/5 border border-red-500/10 px-3 py-2 text-xs text-red-400">
                  Reason: {account.rejectionReason}
                </div>
              )}
            </Card>
          ))}
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
              <p className="text-[15px] font-medium text-[var(--text-primary)]">
                {pendingVerify.username} on {pendingVerify.platform}
              </p>
            </div>

            <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 text-center">
              <p className="text-xs text-[var(--text-muted)] mb-2">Your verification code</p>
              <div className="flex items-center justify-center gap-3">
                <code className="text-3xl font-bold text-accent tracking-[0.3em]">{pendingVerify.code}</code>
                <button
                  onClick={() => copyCode(pendingVerify.code)}
                  className="rounded-lg p-2 text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
              <p className="text-sm text-[var(--text-primary)] font-medium mb-1">How to verify</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--text-secondary)]">
                <li>Copy the code above</li>
                <li>Go to your {pendingVerify.platform} profile</li>
                <li>Paste the code anywhere in your bio</li>
                <li>Wait a few seconds, then click "Verify now" below</li>
              </ol>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => { setPendingVerify(null); setShowModal(false); }}>
                Later
              </Button>
              <Button
                className="flex-1"
                loading={checking === pendingVerify.accountId}
                onClick={() => checkVerification(pendingVerify.accountId)}
                icon={<CheckCircle className="h-4 w-4" />}
              >
                Verify now
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              id="platform"
              label="Platform *"
              options={platformOptions}
              placeholder="Select platform"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
            />
            <Input
              id="username"
              label="Username *"
              placeholder="your_username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <Input
              id="profileLink"
              label="Profile link *"
              placeholder="https://tiktok.com/@your_username"
              value={form.profileLink}
              onChange={(e) => setForm({ ...form, profileLink: e.target.value })}
            />
            <Input
              id="contentNiche"
              label="Content niche"
              placeholder="e.g. Comedy, Gaming, Fashion"
              value={form.contentNiche}
              onChange={(e) => setForm({ ...form, contentNiche: e.target.value })}
            />
            <Input
              id="country"
              label="Country"
              placeholder="Optional"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2.5">
              <p className="text-xs text-[var(--text-muted)]">
                After submitting, you&apos;ll get a short verification code to place in your bio. This proves account ownership.
              </p>
            </div>
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
