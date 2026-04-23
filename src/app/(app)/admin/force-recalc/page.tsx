"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth-types";
import { Calculator, Film, Megaphone, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface RecalcResult {
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  details?: string[];
}

export default function ForceRecalcPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as SessionUser | undefined)?.role;

  const [clipId, setClipId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [allConfirm, setAllConfirm] = useState("");
  const [runningMode, setRunningMode] = useState<null | "clip" | "campaign" | "all">(null);
  const [lastResult, setLastResult] = useState<RecalcResult | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || role !== "OWNER") {
      router.push("/");
      return;
    }
    // Load campaigns for the dropdown.
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => setCampaigns(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [session, status, role, router]);

  const run = useCallback(async (mode: "clip" | "campaign" | "all") => {
    const body: any = {};
    if (mode === "clip") {
      if (!clipId.trim()) return toast.error("Paste a clip ID first");
      body.clipId = clipId.trim();
    } else if (mode === "campaign") {
      if (!campaignId) return toast.error("Pick a campaign first");
      body.campaignId = campaignId;
    } else {
      body.all = true;
    }

    setRunningMode(mode);
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/force-recalc-earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Recalc failed");
      setLastResult(json);
      toast.success(
        `Processed ${json.processed}, updated ${json.updated}, skipped ${json.skipped}, errors ${json.errors}.`,
      );
      if (mode === "all") setAllConfirm("");
    } catch (e: any) {
      toast.error(e?.message || "Recalc failed");
    } finally {
      setRunningMode(null);
    }
  }, [clipId, campaignId]);

  if (status === "loading" || !session?.user || role !== "OWNER") {
    return (
      <div className="p-6 flex items-center gap-2 text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  const canRunAll = allConfirm.trim() === "RECALC ALL" && runningMode === null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Calculator className="h-5 w-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Force recalc earnings</h1>
      </div>
      <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-5">
        OWNER only · bypasses tracking-cron skip paths
      </p>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-5 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[var(--text-secondary)]">
          Uses the latest ClipStat row per clip and rewrites earnings via the same function tracking uses.
          Does not enforce the campaign-wide budget cap — the next tracking cycle handles that. Use when
          an individual clip's earnings are stuck behind its real view count.
        </p>
      </div>

      {/* Single clip */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Film className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recalc single clip</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">Paste the clip id (e.g. <code className="text-[11px]">cmoback38005c0pqvodsscva2</code>).</p>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={clipId}
            onChange={(e) => setClipId(e.target.value)}
            placeholder="Clip id"
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-accent focus:outline-none"
          />
          <button
            onClick={() => run("clip")}
            disabled={runningMode !== null || !clipId.trim()}
            className="rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {runningMode === "clip" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recalc"}
          </button>
        </div>
      </div>

      {/* Single campaign */}
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recalc whole campaign</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">Runs against every APPROVED clip in the selected campaign.</p>
        <div className="flex items-stretch gap-2">
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-accent focus:outline-none"
          >
            <option value="">Select a campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>
          <button
            onClick={() => run("campaign")}
            disabled={runningMode !== null || !campaignId}
            className="rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {runningMode === "campaign" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recalc"}
          </button>
        </div>
      </div>

      {/* Nuclear: all clips sitewide */}
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recalc all approved clips sitewide</h2>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          Scans up to 5,000 clips. Cap is high; run during low-traffic times. Type <code className="text-red-400">RECALC ALL</code> to enable.
        </p>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={allConfirm}
            onChange={(e) => setAllConfirm(e.target.value)}
            placeholder="RECALC ALL"
            className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] focus:border-red-400 focus:outline-none"
          />
          <button
            onClick={() => run("all")}
            disabled={!canRunAll}
            className="rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-500/85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {runningMode === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Recalc all"}
          </button>
        </div>
      </div>

      {/* Result */}
      {lastResult && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Last run</h3>
          <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
            <Stat label="Processed" value={lastResult.processed} />
            <Stat label="Updated" value={lastResult.updated} tone="emerald" />
            <Stat label="Skipped" value={lastResult.skipped} />
            <Stat label="Errors" value={lastResult.errors} tone={lastResult.errors > 0 ? "red" : undefined} />
          </div>
          {lastResult.details && lastResult.details.length > 0 && (
            <details>
              <summary className="text-xs text-[var(--text-muted)] cursor-pointer">Show first 50 per-clip lines</summary>
              <pre className="mt-2 text-[11px] text-[var(--text-muted)] whitespace-pre-wrap font-mono max-h-80 overflow-auto">
                {lastResult.details.join("\n")}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "red" }) {
  const color =
    tone === "emerald" ? "text-emerald-400" : tone === "red" ? "text-red-400" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
    </div>
  );
}
