"use client";

import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Phone, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatRelative } from "@/lib/utils";

const FILTERS = ["all", "today", "week", "past"] as const;
type Filter = (typeof FILTERS)[number];

export default function AdminCallsPage() {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [acting, setActing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then((data) => setCalls(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);
  useAutoRefresh(load, 30000);

  const updateCall = async (callId: string, status: string) => {
    setActing(callId);
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Call marked as ${status.toLowerCase()}.`);
      load();
    } catch { toast.error("Failed to update call."); }
    setActing(null);
  };

  const copyDiscord = (username: string, callId: string) => {
    navigator.clipboard.writeText(username);
    setCopied(callId);
    toast.success("Discord username copied!");
    setTimeout(() => setCopied(null), 2000);
  };

  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now + 7 * 24 * 60 * 60 * 1000);

  const filtered = calls.filter((c: any) => {
    const t = c.scheduledAt ? new Date(c.scheduledAt).getTime() : 0;
    if (filter === "today") return t >= todayStart.getTime() && t < todayStart.getTime() + 86400000;
    if (filter === "week") return t >= now && t < weekEnd.getTime();
    if (filter === "past") return t < now && t > 0;
    return true;
  });

  const statusColors: Record<string, string> = {
    PENDING: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    CONFIRMED: "text-accent bg-accent/10 border-accent/20",
    COMPLETED: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    MISSED: "text-red-400 bg-red-500/10 border-red-500/20",
    CANCELLED: "text-[var(--text-muted)] bg-[var(--bg-input)] border-[var(--border-color)]",
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Scheduled Calls</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">Manage verification calls with clippers.</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1 rounded-xl border border-[var(--border-color)] p-0.5 w-fit">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer capitalize ${filter === f ? "bg-accent text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"}`}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Phone className="h-10 w-10" />} title="No calls" description={filter === "all" ? "No verification calls scheduled yet." : `No calls matching "${filter}".`} />
      ) : (
        <div className="space-y-3">
          {filtered.map((call: any) => {
            const dt = call.scheduledAt
              ? new Date(call.scheduledAt).toLocaleString("en-US", { timeZone: "Europe/Belgrade", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Not yet scheduled";
            const sc = statusColors[call.status] || statusColors.PENDING;
            return (
              <Card key={call.id} className={call.status === "MISSED" ? "border-red-500/20" : ""}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {call.user?.image ? (
                      <img src={call.user.image} alt="" className="h-10 w-10 rounded-full" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                        {(call.user?.username || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {call.user?.username || "User"}
                        {call.clipperTimezone && <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">({call.clipperTimezone})</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{call.payout?.campaign?.name || "—"} · {formatCurrency(call.payout?.finalAmount ?? call.payout?.amount ?? 0)}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${sc}`}>
                    {call.status}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4 flex-wrap">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Team time</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{dt}</p>
                    {call.clipperTimezone && call.scheduledAt && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">Clipper&apos;s time: {(() => {
                        // Extract offset from timezone label like "US Eastern (UTC-5)"
                        const match = call.clipperTimezone.match(/UTC([+-]?\d+(?::\d+)?)/);
                        if (!match) return "—";
                        const offsetStr = match[1];
                        const offsetH = offsetStr.includes(":") ? parseFloat(offsetStr.replace(":", ".5").replace(".50", ".5")) : parseInt(offsetStr);
                        const utc = new Date(call.scheduledAt);
                        const localMs = utc.getTime() + offsetH * 3600000;
                        const localDate = new Date(localMs);
                        return localDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
                      })()}</p>
                    )}
                  </div>
                  {call.discordUsername && (
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">Discord</p>
                      <button onClick={() => copyDiscord(call.discordUsername, call.id)} className="flex items-center gap-1 text-sm font-semibold text-accent hover:underline cursor-pointer">
                        {call.discordUsername}
                        {copied === call.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                </div>

                {(call.status === "CONFIRMED" || call.status === "PENDING") && (
                  <div className="mt-3 flex gap-2">
                    {call.status === "CONFIRMED" && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => updateCall(call.id, "COMPLETED")} loading={acting === call.id} icon={<Check className="h-3 w-3" />}>Completed</Button>
                        <Button size="sm" variant="ghost" onClick={() => updateCall(call.id, "MISSED")} loading={acting === call.id} className="text-red-400">Missed</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => updateCall(call.id, "CANCELLED")} loading={acting === call.id} icon={<X className="h-3 w-3" />} className="text-[var(--text-muted)]">Cancel</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
