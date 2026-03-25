"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Wallet, Check, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatRelative, formatCurrency } from "@/lib/utils";

const statusFilterOptions = [
  { value: "REQUESTED", label: "Requested" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
];

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = () => {
    fetch("/api/payouts")
      .then((r) => r.json())
      .then(setPayouts)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredPayouts = filterStatuses.length > 0
    ? payouts.filter((p: any) => filterStatuses.includes(p.status))
    : payouts;

  const handleReview = async (id: string, action: string, reason?: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/payouts/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason: reason }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Payout ${action.toLowerCase().replace("_", " ")}.`);
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch {
      toast.error("Action failed.");
    }
    setActing(false);
  };

  const statusMap: Record<string, string> = {
    REQUESTED: "pending", UNDER_REVIEW: "pending",
    APPROVED: "approved", PAID: "active", REJECTED: "rejected",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Payout Review</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Review and process payout requests.</p>
      </div>

      <MultiDropdown label="Status" options={statusFilterOptions} values={filterStatuses} onChange={setFilterStatuses} allLabel="All statuses" />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
        </div>
      ) : filteredPayouts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="No payouts"
          description={filterStatuses.length > 0 ? "No payouts matching selected filters." : "No payouts found."}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Discord</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPayouts.map((payout: any) => (
              <TableRow key={payout.id}>
                <TableCell className="font-medium text-[var(--text-primary)]">{payout.user?.username || "—"}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(payout.amount)}</TableCell>
                <TableCell className="max-w-[150px] truncate text-xs">{payout.walletAddress}</TableCell>
                <TableCell className="text-sm text-[var(--text-primary)]">{payout.discordUsername || "—"}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">{payout.proofNote || "—"}</TableCell>
                <TableCell>{formatRelative(payout.createdAt)}</TableCell>
                <TableCell><Badge variant={statusMap[payout.status] as any}>{payout.status.replace("_", " ")}</Badge></TableCell>
                <TableCell>
                  {payout.status === "REQUESTED" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "UNDER_REVIEW")} loading={acting} icon={<Eye className="h-3 w-3" />}>
                        Review
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "APPROVED")} loading={acting} icon={<Check className="h-3 w-3" />}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectModal(payout.id)} icon={<X className="h-3 w-3" />}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {payout.status === "UNDER_REVIEW" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "APPROVED")} loading={acting} icon={<Check className="h-3 w-3" />}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectModal(payout.id)} icon={<X className="h-3 w-3" />}>
                        Reject
                      </Button>
                    </div>
                  )}
                  {payout.status === "APPROVED" && (
                    <Button size="sm" onClick={() => handleReview(payout.id, "PAID")} loading={acting}>
                      Mark paid
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject payout">
        <div className="space-y-4">
          <Input
            id="rejectReason"
            label="Rejection reason"
            placeholder="e.g. Missing proof, suspicious activity"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="danger" loading={acting} onClick={() => rejectModal && handleReview(rejectModal, "REJECTED", rejectReason)}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
