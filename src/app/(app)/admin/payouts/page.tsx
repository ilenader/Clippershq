"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { MultiDropdown } from "@/components/ui/dropdown-filter";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Wallet, Check, X, Eye, Phone, Ban } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative, formatCurrency } from "@/lib/utils";

const statusFilterOptions = [
  { value: "REQUESTED", label: "Requested" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "VOIDED", label: "Voided" },
];

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);
  const [calls, setCalls] = useState<any[]>([]);

  const load = () => {
    Promise.all([
      fetch("/api/payouts").then((r) => r.json()),
      fetch("/api/calls").then((r) => r.json()).catch(() => []),
    ])
      .then(([p, c]) => { setPayouts(Array.isArray(p) ? p : []); setCalls(Array.isArray(c) ? c : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useAutoRefresh(load, 15000);

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

  const requestCall = async (payoutId: string) => {
    setActing(true);
    try {
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Call request sent! The clipper will be notified to pick a time.");
      load();
    } catch (err: any) { toast.error(err.message); }
    setActing(false);
  };

  const getCallForPayout = (payoutId: string) =>
    calls.find((c: any) => c.payoutId === payoutId && c.status !== "CANCELLED");

  const handleVoid = async (id: string) => {
    if (!confirm("Void this payout? It will no longer count toward the clipper's balance.")) return;
    setActing(true);
    try {
      const res = await fetch(`/api/payouts/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "VOIDED", rejectionReason: "Voided by owner" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Payout voided. Balance recalculated.");
      load();
    } catch { toast.error("Failed to void payout."); }
    setActing(false);
  };

  const statusMap: Record<string, string> = {
    REQUESTED: "pending", UNDER_REVIEW: "pending",
    APPROVED: "approved", PAID: "active", REJECTED: "rejected", VOIDED: "voided",
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
        <div className="overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-2"><Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Asset / Chain</TableHead>
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
                <TableCell className="font-medium text-[var(--text-primary)]">{payout.user?.username || "-"}</TableCell>
                <TableCell className="text-sm text-[var(--text-primary)]">{payout.campaign?.name || "All"}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-semibold">{payout.finalAmount != null ? formatCurrency(payout.finalAmount) : formatCurrency(payout.amount)}</p>
                    {payout.finalAmount != null && (
                      <p className="text-[11px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                        {formatCurrency(payout.amount)} req
                        {payout.feeAmount > 0 && <span className="text-red-400"> -{formatCurrency(payout.feeAmount)}</span>}
                        {payout.bonusAmount > 0 && <span className="text-emerald-400"> +{formatCurrency(payout.bonusAmount)}</span>}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-xs" title={payout.walletAddress}>{payout.walletAddress}</TableCell>
                <TableCell className="text-xs text-[var(--text-primary)]">
                  {payout.walletAsset || payout.walletChain ? (
                    <div>
                      {payout.walletAsset && <span className="block">{payout.walletAsset}</span>}
                      {payout.walletChain && <span className="block text-[var(--text-muted)]">{payout.walletChain}</span>}
                    </div>
                  ) : "-"}
                </TableCell>
                <TableCell className="text-sm text-[var(--text-primary)]">{payout.discordUsername || "-"}</TableCell>
                <TableCell className="max-w-[200px] truncate text-xs">{payout.proofNote || "-"}</TableCell>
                <TableCell>{formatRelative(payout.createdAt)}</TableCell>
                <TableCell><Badge variant={statusMap[payout.status] as any}>{payout.status.replace("_", " ")}</Badge></TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {payout.status === "REQUESTED" && (
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "UNDER_REVIEW")} loading={acting} icon={<Eye className="h-3 w-3" />}>Review</Button>
                        <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "APPROVED")} loading={acting} icon={<Check className="h-3 w-3" />}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectModal(payout.id)} icon={<X className="h-3 w-3" />}>Reject</Button>
                      </div>
                    )}
                    {payout.status === "UNDER_REVIEW" && (
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => handleReview(payout.id, "APPROVED")} loading={acting} icon={<Check className="h-3 w-3" />}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejectModal(payout.id)} icon={<X className="h-3 w-3" />}>Reject</Button>
                      </div>
                    )}
                    {payout.status === "APPROVED" && (
                      <Button size="sm" onClick={() => handleReview(payout.id, "PAID")} loading={acting}>Mark paid</Button>
                    )}
                    {(payout.status === "PAID" || payout.status === "REJECTED") && (
                      <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => handleVoid(payout.id)} loading={acting} icon={<Ban className="h-3 w-3" />}>Void</Button>
                    )}
                    {/* Call scheduling */}
                    {(() => {
                      const call = getCallForPayout(payout.id);
                      if (call) {
                        if (call.status === "PENDING") return <p className="text-xs text-yellow-400">⏳ Waiting for clipper to pick time</p>;
                        if (call.status === "CONFIRMED") {
                          const dt = call.scheduledAt ? new Date(call.scheduledAt).toLocaleString("en-US", { timeZone: "Europe/Belgrade", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
                          return <p className="text-xs text-accent">📞 Call: {dt} — {call.discordUsername}</p>;
                        }
                        if (call.status === "COMPLETED") return <p className="text-xs text-emerald-400">✅ Call completed</p>;
                        if (call.status === "MISSED") return <p className="text-xs text-red-400">❌ Clipper missed the call</p>;
                      }
                      if (payout.status === "REQUESTED" || payout.status === "UNDER_REVIEW") {
                        return (
                          <Button size="sm" variant="outline" onClick={() => requestCall(payout.id)} loading={acting} icon={<Phone className="h-3 w-3" />}>
                            Schedule Call
                          </Button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table></div>
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
