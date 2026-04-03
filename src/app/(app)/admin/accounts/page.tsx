"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { ClipboardList, Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/utils";

const filterOptions = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const statusBadge: Record<string, string> = {
  PENDING: "pending",
  VERIFIED: "verified",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = () => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredAccounts = filterStatuses.length > 0
    ? accounts.filter((a: any) => filterStatuses.includes(a.status))
    : accounts;

  const handleReview = async (id: string, action: string, reason?: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/accounts/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success(`Account ${action.toLowerCase()}.`);
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Action failed.");
    }
    setActing(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Account Review</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Review clipper accounts.</p>
      </div>

      <MultiDropdown label="Status" options={filterOptions} values={filterStatuses} onChange={setFilterStatuses} allLabel="All statuses" />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : filteredAccounts.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No accounts"
          description={filterStatuses.length > 0 ? "No accounts matching selected filters." : "No accounts found."}
        />
      ) : (
        <div className="space-y-2">
          {filteredAccounts.map((account: any) => (
            <div key={account.id} className="rounded-xl border border-[var(--border-color)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a href={account.profileLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline truncate">
                    {account.username} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  </a>
                  <p className="text-xs text-[var(--text-muted)] truncate">{account.user?.username || "-"}</p>
                </div>
                <Badge variant={(statusBadge[account.status] || "pending") as any}>
                  {statusLabel[account.status] || account.status}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-primary)]">{account.platform}</span>
                <span>{formatRelative(account.createdAt)}</span>
              </div>
              {(account.status === "PENDING" || account.status === "VERIFIED") && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleReview(account.id, "APPROVED")} loading={acting} icon={<Check className="h-3 w-3" />}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejectModal(account.id)} icon={<X className="h-3 w-3" />}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject account">
        <div className="space-y-4">
          <Input
            id="rejectReason"
            label="Rejection reason"
            placeholder="e.g. Fake account, unrelated content"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="danger" loading={acting} onClick={() => rejectModal && handleReview(rejectModal, "REJECTED", rejectReason)}>Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
