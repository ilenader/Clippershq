"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatRelative } from "@/lib/utils";
import { ExternalLink, Clock, Activity, Loader2 } from "lucide-react";

interface TrackingModalProps {
  clip: any | null;
  open: boolean;
  onClose: () => void;
}

interface Snapshot {
  id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  isManual: boolean;
  checkedAt: string;
}

interface TrackingJobInfo {
  isActive: boolean;
  nextCheckAt: string;
  checkIntervalMin: number;
  lastCheckedAt: string | null;
  consecutiveFlats: number;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(dateStr)}`;
}

function intervalLabel(min: number): string {
  if (min <= 60) return "Every 1h";
  if (min <= 180) return "Every 3h";
  if (min <= 720) return "Every 12h";
  if (min <= 1440) return "Every 24h";
  return "Every 48h";
}

export function TrackingModal({ clip, open, onClose }: TrackingModalProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [jobInfo, setJobInfo] = useState<TrackingJobInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !clip) return;
    setLoading(true);
    fetch(`/api/clips/${clip.id}/tracking`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setSnapshots(data.snapshots || []);
        setJobInfo(data.trackingJob || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, clip?.id]);

  if (!clip) return null;

  return (
    <Modal open={open} onClose={onClose} title="Clip tracking" className="max-w-lg">
      <div className="space-y-4">
        {/* Clip info */}
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{clip.clipAccount?.username || "Clip"}</p>
            <p className="text-xs text-[var(--text-muted)]">{clip.campaign?.name} · {formatRelative(clip.createdAt)}</p>
          </div>
          <a href={clip.clipUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
            <ExternalLink className="h-3 w-3" /> Open clip
          </a>
        </div>

        {/* Tracking job status */}
        {jobInfo && (
          <div className="flex items-center gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3">
            <Activity className="h-4 w-4 text-accent" />
            <div className="text-xs">
              <p className="text-accent font-medium">
                {jobInfo.isActive ? "Tracking active" : "Tracking paused"}
                <span className="text-[var(--text-muted)] ml-2">· {intervalLabel(jobInfo.checkIntervalMin)}</span>
              </p>
              <p className="text-[var(--text-muted)]">
                Next check: {formatDateTime(jobInfo.nextCheckAt)}
                {jobInfo.lastCheckedAt && ` · Last: ${formatDateTime(jobInfo.lastCheckedAt)}`}
              </p>
            </div>
          </div>
        )}
        {!jobInfo && !loading && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">No tracking job found for this clip.</p>
          </div>
        )}

        {/* Snapshots table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          </div>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">No snapshots yet.</p>
        ) : (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden overflow-x-auto">
            <div className="grid grid-cols-[1fr_64px_56px_56px_56px] gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b border-[var(--border-color)] text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] min-w-[400px]">
              <span>Time</span>
              <span className="text-right">Views</span>
              <span className="text-right">Likes</span>
              <span className="text-right">Cmts</span>
              <span className="text-right">Shares</span>
            </div>
            {snapshots.map((snap, i) => {
              const prevViews = i > 0 ? snapshots[i - 1].views : 0;
              const growth = snap.views - prevViews;
              const isFirst = i === 0;
              return (
                <div key={snap.id} className="grid grid-cols-[1fr_64px_56px_56px_56px] gap-1 sm:gap-2 items-center px-2 sm:px-4 py-1.5 sm:py-2 border-b border-[var(--border-subtle)] last:border-b-0 min-w-[400px]">
                  <span className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-[var(--text-secondary)]">
                    <Clock className="h-3 w-3 text-[var(--text-muted)] flex-shrink-0" />
                    {formatDateTime(snap.checkedAt)}
                    {isFirst && <Badge variant="active" className="text-[9px] px-1 sm:px-1.5 py-0">submit</Badge>}
                    {snap.isManual && <Badge variant="pending" className="text-[9px] px-1 sm:px-1.5 py-0">manual</Badge>}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">
                    {formatNumber(snap.views)}
                    {!isFirst && growth > 0 && (
                      <span className="text-[10px] text-emerald-400 ml-0.5">+{formatNumber(growth)}</span>
                    )}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(snap.likes)}</span>
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(snap.comments)}</span>
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-primary)] text-right tabular-nums">{formatNumber(snap.shares)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            Tracking runs automatically. Phase 1: every hour for 24h. Slows down if growth is weak. You can also trigger a manual check from the cron endpoint.
          </p>
        </div>
      </div>
    </Modal>
  );
}
