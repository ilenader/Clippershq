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
import { Wallet, Check, X, Eye, Phone, Ban, ChevronDown, MessageCircle, DollarSign, Mail, Bell, Clock } from "lucide-react";
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

  // Unpaid balances section
  const [unpaidOpen, setUnpaidOpen] = useState(false);
  const [unpaidData, setUnpaidData] = useState<any>(null);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  const [unpaidCampaign, setUnpaidCampaign] = useState("");
  const [unpaidDropOpen, setUnpaidDropOpen] = useState(false);
  const [showAllClippers, setShowAllClippers] = useState(false);

  const loadUnpaid = (campaignId?: string) => {
    setUnpaidLoading(true);
    const url = campaignId ? `/api/admin/payouts/unpaid?campaignId=${campaignId}` : "/api/admin/payouts/unpaid";
    fetch(url).then((r) => r.json()).then(setUnpaidData).catch(() => {}).finally(() => setUnpaidLoading(false));
  };

  useEffect(() => {
    if (unpaidOpen && !unpaidData) loadUnpaid();
  }, [unpaidOpen]);

  const handleUnpaidCampaignChange = (cId: string) => {
    setUnpaidCampaign(cId);
    setUnpaidDropOpen(false);
    loadUnpaid(cId || undefined);
  };

  const unpaidCampaigns: any[] = unpaidData?.campaigns || [];
  const unpaidClippers: any[] = unpaidData?.clippers || [];
  const displayedClippers = showAllClippers ? unpaidClippers : unpaidClippers.filter((c: any) => c.unpaid > 0);
  const summaryTotalEarned = unpaidCampaigns.reduce((s: number, c: any) => s + c.totalEarned, 0);
  const summaryTotalPaid = unpaidCampaigns.reduce((s: number, c: any) => s + c.totalPaid, 0);
  const summaryTotalLocked = unpaidCampaigns.reduce((s: number, c: any) => s + c.totalLocked, 0);
  const summaryTotalUnpaid = unpaidCampaigns.reduce((s: number, c: any) => s + c.totalUnpaid, 0);

  const [notifying, setNotifying] = useState<string | null>(null);

  const sendReminder = async (clipper: any, action: "email" | "notification" | "dm") => {
    const key = `${clipper.userId}-${action}`;
    setNotifying(key);
    try {
      const res = await fetch("/api/admin/payouts/unpaid/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: clipper.userId,
          campaignId: clipper.campaignId,
          campaignName: clipper.campaignName,
          unpaidAmount: clipper.unpaid,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const labels: Record<string, string> = { email: "Email sent", notification: "Notification sent", dm: "Message sent" };
      toast.success(labels[action] || "Sent");
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    }
    setNotifying(null);
  };

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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed");
      }
      toast.success(`Payout ${action.toLowerCase().replace("_", " ")}.`);
      setRejectModal(null);
      setRejectReason("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to void payout");
      }
      toast.success("Payout voided. Balance recalculated.");
      load();
    } catch (err: any) { toast.error(err.message || "Failed to void payout"); }
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

      {/* ── Unpaid Balances (collapsible) ── */}
      <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
        <button
          onClick={() => setUnpaidOpen(!unpaidOpen)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-accent" />
            Unpaid Balances
          </div>
          <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${unpaidOpen ? "rotate-180" : ""}`} />
        </button>
        {unpaidOpen && (
          <div className="border-t border-[var(--border-color)] px-5 py-4 space-y-4">
            {/* Campaign filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <button
                  onClick={() => setUnpaidDropOpen(!unpaidDropOpen)}
                  className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
                >
                  <span className="text-[var(--text-muted)]">Campaign:</span>
                  {unpaidCampaign ? unpaidCampaigns.find((c: any) => c.campaignId === unpaidCampaign)?.campaignName || "Unknown" : "All Campaigns"}
                  <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${unpaidDropOpen ? "rotate-180" : ""}`} />
                </button>
                {unpaidDropOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] max-h-64 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-elevated)]">
                    <button onClick={() => handleUnpaidCampaignChange("")}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${!unpaidCampaign ? "text-accent bg-accent/5" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                      <div className={`h-3.5 w-3.5 rounded border ${!unpaidCampaign ? "border-accent bg-accent" : "border-[var(--border-color)]"}`}>
                        {!unpaidCampaign && <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}
                      </div>
                      All Campaigns
                    </button>
                    <div className="border-t border-[var(--border-subtle)] my-1" />
                    {unpaidCampaigns.map((c: any) => (
                      <button key={c.campaignId} onClick={() => handleUnpaidCampaignChange(c.campaignId)}
                        className={`flex w-full items-center gap-2 px-4 py-2 text-sm cursor-pointer transition-colors ${unpaidCampaign === c.campaignId ? "text-accent bg-accent/5" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
                        <div className={`h-3.5 w-3.5 rounded border ${unpaidCampaign === c.campaignId ? "border-accent bg-accent" : "border-[var(--border-color)]"}`}>
                          {unpaidCampaign === c.campaignId && <svg className="h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>}
                        </div>
                        {c.campaignName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAllClippers(!showAllClippers)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${showAllClippers ? "bg-accent text-white" : "border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
              >
                {showAllClippers ? "Showing all" : "Unpaid only"}
              </button>
            </div>

            {unpaidLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Earned", value: formatCurrency(summaryTotalEarned), color: "text-[var(--text-primary)]" },
                    { label: "Total Paid", value: formatCurrency(summaryTotalPaid), color: "text-emerald-400" },
                    { label: "Locked in Requests", value: formatCurrency(summaryTotalLocked), color: "text-yellow-400" },
                    { label: "Unpaid", value: formatCurrency(summaryTotalUnpaid), color: "text-accent" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color} mt-0.5`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Clipper breakdown */}
                {displayedClippers.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] text-center py-4">No clippers with unpaid balances.</p>
                ) : (
                  <div className="overflow-x-auto -mx-5 px-5">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                          <th className="text-left py-2 pr-3">Clipper</th>
                          <th className="text-left py-2 pr-3">Campaign</th>
                          <th className="text-right py-2 pr-3">Earned</th>
                          <th className="text-right py-2 pr-3">Paid</th>
                          <th className="text-right py-2 pr-3">Locked</th>
                          <th className="text-right py-2 pr-3">Unpaid</th>
                          <th className="text-right py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedClippers.map((c: any, i: number) => (
                          <tr key={`${c.userId}-${c.campaignId}-${i}`} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors">
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2">
                                {c.image ? (
                                  <img src={c.image} alt="" className="h-6 w-6 rounded-full object-cover flex-shrink-0" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 text-accent text-xs font-semibold">
                                    {(c.username || "?").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <a href={`/admin/users/${c.userId}`} className="text-sm font-medium text-accent hover:underline truncate max-w-[180px] lg:max-w-xs">{c.username}</a>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3 text-[var(--text-muted)] truncate max-w-[180px] lg:max-w-xs">{c.campaignName}</td>
                            <td className="py-2.5 pr-3 text-right text-[var(--text-primary)] tabular-nums">{formatCurrency(c.earned)}</td>
                            <td className="py-2.5 pr-3 text-right text-emerald-400 tabular-nums">{formatCurrency(c.paid)}</td>
                            <td className="py-2.5 pr-3 text-right text-yellow-400 tabular-nums">{formatCurrency(c.locked)}</td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-accent tabular-nums">{formatCurrency(c.unpaid)}</td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => sendReminder(c, "email")}
                                  disabled={notifying === `${c.userId}-email`}
                                  title="Send email reminder"
                                  className="text-[var(--text-muted)] hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {notifying === `${c.userId}-email` ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-accent border-t-transparent" /> : <Mail className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => sendReminder(c, "notification")}
                                  disabled={notifying === `${c.userId}-notification`}
                                  title="Send app notification"
                                  className="text-[var(--text-muted)] hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {notifying === `${c.userId}-notification` ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-accent border-t-transparent" /> : <Bell className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => sendReminder(c, "dm")}
                                  disabled={notifying === `${c.userId}-dm`}
                                  title="Send DM"
                                  className="text-[var(--text-muted)] hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {notifying === `${c.userId}-dm` ? <div className="h-3.5 w-3.5 animate-spin rounded-full border border-accent border-t-transparent" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
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
                    {payout.campaignAvailable != null && payout.amount > payout.campaignAvailable && payout.status !== "PAID" && payout.status !== "REJECTED" && payout.status !== "VOIDED" && (
                      <p className="text-xs text-amber-400 mt-0.5">Campaign balance may be insufficient</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-xs">{payout.walletAddress}</TableCell>
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
                        if (call.status === "PENDING") return <p className="text-xs text-yellow-400"><Clock className="h-3.5 w-3.5 text-amber-400 inline-block -mt-0.5 mr-1" />Waiting for clipper to pick time</p>;
                        if (call.status === "CONFIRMED") {
                          const dt = call.scheduledAt ? new Date(call.scheduledAt).toLocaleString("en-US", { timeZone: "Europe/Belgrade", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
                          return <p className="text-xs text-accent"><Phone className="h-3.5 w-3.5 text-accent inline-block -mt-0.5 mr-1" />Call: {dt} — {call.discordUsername}</p>;
                        }
                        if (call.status === "COMPLETED") return <p className="text-xs text-emerald-400"><Check className="h-3.5 w-3.5 text-emerald-400 inline-block -mt-0.5 mr-1" />Call completed</p>;
                        if (call.status === "MISSED") return <p className="text-xs text-red-400"><X className="h-3.5 w-3.5 text-red-400 inline-block -mt-0.5 mr-1" />Clipper missed the call</p>;
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
