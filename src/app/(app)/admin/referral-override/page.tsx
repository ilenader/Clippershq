"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Handshake, Search, UserPlus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * OWNER-only referral override manager.
 *
 * Lets the owner retroactively set a referrer on any clipper when the
 * referral happened off-platform (Discord DM, word of mouth) and the
 * link-based flow never ran. Natural referrals remain read-only here; only
 * manual overrides show a Remove button.
 *
 * Clipper-side UI is intentionally identical for natural and overridden
 * referrals — they just see "4% fee" as their normal fee, no "override"
 * indicator.
 */

type Clipper = {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
  totalEarnings: number;
  referredById: string | null;
  referrerOverriddenBy: string | null;
  referrerOverriddenAt: string | null;
  referredBy: { id: string; username: string | null; name: string | null; email: string | null } | null;
  createdAt: string;
};

export default function AdminReferralOverridePage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser)?.role;

  useEffect(() => {
    if (session && role && role !== "OWNER") router.replace("/admin");
  }, [session, role, router]);

  const [rows, setRows] = useState<Clipper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pickerFor, setPickerFor] = useState<Clipper | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerChoice, setPickerChoice] = useState<Clipper | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Clipper | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = () => {
    fetch("/api/admin/referral-override")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filter = (list: Clipper[], q: string) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => {
      return (
        (c.username || "").toLowerCase().includes(needle) ||
        (c.name || "").toLowerCase().includes(needle) ||
        (c.email || "").toLowerCase().includes(needle)
      );
    });
  };

  const visibleRows = useMemo(() => filter(rows, search), [rows, search]);

  const pickerCandidates = useMemo(() => {
    if (!pickerFor) return [];
    // Exclude self + banned; include everyone else. The backend enforces the
    // same rules plus the cycle check, so this is just a UX pre-filter.
    return filter(rows, pickerSearch).filter((c) => {
      if (c.id === pickerFor.id) return false;
      if ((c.status || "").toUpperCase() === "BANNED") return false;
      return true;
    });
  }, [rows, pickerSearch, pickerFor]);

  const openPicker = (target: Clipper) => {
    setPickerFor(target);
    setPickerSearch("");
    setPickerChoice(null);
  };

  const submitOverride = async () => {
    if (!pickerFor || !pickerChoice) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/referral-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pickerFor.id, referrerId: pickerChoice.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(
        data.clipsUpdated
          ? `Referrer set. ${data.clipsUpdated} clip${data.clipsUpdated === 1 ? "" : "s"} recalculated.`
          : "Referrer set.",
      );
      setPickerFor(null);
      setPickerChoice(null);
      setPickerSearch("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to set referrer.");
    }
    setSubmitting(false);
  };

  const submitRemove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/referral-override?userId=${encodeURIComponent(confirmRemove.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(
        data.clipsUpdated
          ? `Override removed. ${data.clipsUpdated} clip${data.clipsUpdated === 1 ? "" : "s"} recalculated.`
          : "Override removed.",
      );
      setConfirmRemove(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove override.");
    }
    setRemoving(false);
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
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Referral Override</h1>
        <p className="text-[15px] text-[var(--text-secondary)]">
          Set a referrer for any clipper. They&apos;ll get a 4% fee and the referrer earns 5% on all their clips (lifetime, including past clips).
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Search clippers by username, name, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors"
        />
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState
          icon={<Handshake className="h-10 w-10" />}
          title={search ? "No matches" : "No clippers yet"}
          description={search ? "Try a different search." : "Once clippers sign up they'll appear here."}
        />
      ) : (
        <div className="space-y-2">
          {visibleRows.map((c) => {
            const hasReferrer = !!c.referredById;
            const isOverride = !!c.referrerOverriddenBy;
            const isNatural = hasReferrer && !isOverride;
            return (
              <Card key={c.id}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {c.username || c.name || c.email || "clipper"}
                      </p>
                      {(c.status || "").toUpperCase() === "BANNED" && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5">Banned</span>
                      )}
                      {isOverride && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5">Override</span>
                      )}
                      {isNatural && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">Natural</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                      {c.email || "—"} · ${Math.round((c.totalEarnings || 0) * 100) / 100} lifetime
                    </p>
                    {c.referredBy && (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 flex items-center gap-1.5 flex-wrap">
                        <ArrowRight className="h-3 w-3 text-accent flex-shrink-0" />
                        referred by <span className="font-semibold">{c.referredBy.username || c.referredBy.name || c.referredBy.email}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {!hasReferrer && (
                      <Button size="sm" variant="outline" onClick={() => openPicker(c)} icon={<UserPlus className="h-3 w-3" />}>
                        Set Referrer
                      </Button>
                    )}
                    {isOverride && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmRemove(c)}
                        icon={<Trash2 className="h-3 w-3" />}
                        className="text-red-400 hover:text-red-300 hover:border-red-400/30"
                      >
                        Remove
                      </Button>
                    )}
                    {isNatural && (
                      <span className="text-[11px] text-[var(--text-muted)] italic self-center">
                        Natural — not removable here
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Picker modal */}
      {pickerFor && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-elevated)] max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-shrink-0">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Pick a referrer</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Choose who referred <span className="font-semibold">{pickerFor.username || pickerFor.name || pickerFor.email}</span>. The referrer will earn 5% of their lifetime earnings.
              </p>
            </div>
            <div className="relative mt-3 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                autoFocus
                placeholder="Search by username, name, or email…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors"
              />
            </div>
            <div className="mt-3 flex-1 overflow-y-auto space-y-1 min-h-0">
              {pickerCandidates.slice(0, 100).map((c) => {
                const isSelected = pickerChoice?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setPickerChoice(c)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-transparent hover:bg-[var(--bg-card-hover)]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {c.username || c.name || c.email || "clipper"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{c.email || "—"}</p>
                  </button>
                );
              })}
              {pickerCandidates.length === 0 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-4">No matching clippers.</p>
              )}
              {pickerCandidates.length > 100 && (
                <p className="text-xs text-[var(--text-muted)] px-3 py-2 text-center">
                  Showing 100 of {pickerCandidates.length}. Refine your search to see more.
                </p>
              )}
            </div>
            {pickerChoice && (
              <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 p-3 flex-shrink-0">
                <p className="text-sm text-[var(--text-primary)]">
                  Set <span className="font-semibold">{pickerChoice.username || pickerChoice.name || pickerChoice.email}</span> as referrer for <span className="font-semibold">{pickerFor.username || pickerFor.name || pickerFor.email}</span>?
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  This applies to all past and future earnings. {pickerFor.username || "They"} pay 4% fee, {pickerChoice.username || "referrer"} earns 5% of their lifetime earnings.
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2 flex-shrink-0">
              <Button variant="ghost" onClick={() => setPickerFor(null)}>Cancel</Button>
              <Button disabled={!pickerChoice} loading={submitting} onClick={submitOverride}>
                Set Referrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirm */}
      {confirmRemove && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-elevated)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Remove referrer override?</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              <span className="font-semibold">{confirmRemove.username || confirmRemove.name || confirmRemove.email}</span> will go back to the 9% platform fee. Their previous referrer will lose future 5% credit on this user&apos;s earnings.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmRemove(null)}>Cancel</Button>
              <Button variant="danger" loading={removing} onClick={submitRemove} icon={<Trash2 className="h-3 w-3" />}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
