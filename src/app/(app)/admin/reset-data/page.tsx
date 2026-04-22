"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import { AlertTriangle, ShieldCheck, Megaphone, Film, Users, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface PreviewData {
  preview: { campaigns: number; clips: number; users: number };
  protections: {
    realEarningsThresholdUSD: number;
    userInactivityDays: number;
    note: string;
  };
}

export default function ResetDataPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser | undefined)?.role;

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteCampaigns, setDeleteCampaigns] = useState(false);
  const [deleteClips, setDeleteClips] = useState(false);
  const [deleteUsers, setDeleteUsers] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [executing, setExecuting] = useState(false);

  const loadPreview = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reset-data");
      if (!res.ok) throw new Error("Failed to load preview");
      const json: PreviewData = await res.json();
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Failed to load preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || role !== "OWNER") {
      router.push("/");
      return;
    }
    loadPreview();
  }, [session, status, role, router, loadPreview]);

  const anySelected = deleteCampaigns || deleteClips || deleteUsers;
  const canExecute = anySelected && confirmText.trim() === "RESET" && !executing;

  const execute = async () => {
    if (!canExecute) return;
    const confirmation = window.confirm(
      "This will soft-delete the selected data. Are you sure? " +
      "It can be restored within 24 hours via scripts/restore-deleted.ts.",
    );
    if (!confirmation) return;

    setExecuting(true);
    try {
      const qs =
        process.env.NODE_ENV === "production" ? "?confirm=RESET_PRODUCTION_DATA" : "";
      const res = await fetch(`/api/admin/reset-data${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteCampaigns, deleteClips, deleteUsers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Reset failed");
      toast.success(
        `Deleted ${json.deleted.campaigns} campaigns, ${json.deleted.clips} clips, ${json.deleted.users} users.`,
      );
      setConfirmText("");
      setDeleteCampaigns(false);
      setDeleteClips(false);
      setDeleteUsers(false);
      await loadPreview();
    } catch (e: any) {
      toast.error(e?.message || "Reset failed");
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading preview…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">{error || "No preview data."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Trash2 className="h-5 w-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Pre-launch data reset</h1>
      </div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-6">
        OWNER only · soft-delete (isDeleted=true) · reversible
      </p>

      {/* Preview */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 mb-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">What would be deleted right now</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatRow icon={<Megaphone className="h-4 w-4 text-accent" />} label="Campaigns" value={data.preview.campaigns} />
          <StatRow icon={<Film className="h-4 w-4 text-accent" />} label="Clips" value={data.preview.clips} />
          <StatRow icon={<Users className="h-4 w-4 text-accent" />} label="Users" value={data.preview.users} />
        </div>
      </div>

      {/* Protections */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 mb-5 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[var(--text-secondary)]">{data.protections.note}</p>
      </div>

      {/* Checkboxes */}
      <div className="space-y-3 mb-5">
        <Checkbox
          checked={deleteCampaigns}
          onChange={setDeleteCampaigns}
          label="Delete all test campaigns"
          sub={`${data.preview.campaigns} campaigns will be archived (isArchived=true). Reversible.`}
        />
        <Checkbox
          checked={deleteClips}
          onChange={setDeleteClips}
          label="Delete all test clips"
          sub={`${data.preview.clips} clips will be soft-deleted (isDeleted=true). Tracking jobs disabled.`}
        />
        <Checkbox
          checked={deleteUsers}
          onChange={setDeleteUsers}
          label="Delete all test users"
          sub={`${data.preview.users} CLIPPER accounts will be soft-deleted. Forces logout on next request.`}
        />
      </div>

      {/* Confirmation + execute */}
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <label className="block text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1.5">
          Type RESET to enable the button
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="RESET"
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-red-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={execute}
          disabled={!canExecute}
          className="mt-3 w-full rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {executing ? "Running reset…" : "Reset selected (soft-delete)"}
        </button>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Rows stay in the database; run scripts/restore-deleted.ts within 24 h to reverse.
        </p>
      </div>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{value.toLocaleString()}</p>
    </div>
  );
}

function Checkbox({
  checked, onChange, label, sub,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3 cursor-pointer hover:border-accent/40 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-accent flex-shrink-0"
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{sub}</p>
      </div>
    </label>
  );
}
