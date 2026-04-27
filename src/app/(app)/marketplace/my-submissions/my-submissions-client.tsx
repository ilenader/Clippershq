"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, ExternalLink } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative } from "@/lib/utils";

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "POSTED", label: "Posted" },
  { value: "ALL", label: "All" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

type StatusVariant =
  | "pending"
  | "approved"
  | "rejected"
  | "flagged"
  | "archived"
  | "active"
  | "paused";

// Submission status → badge mapping. Distinct from the listing STATUS_BADGE
// in marketplace-client.tsx; submission enum is PENDING/APPROVED/REJECTED/
// EXPIRED/POSTED/POST_EXPIRED.
const STATUS_BADGE: Record<string, { variant: StatusVariant; label: string }> = {
  PENDING: { variant: "pending", label: "Pending review" },
  APPROVED: { variant: "active", label: "Approved" },
  REJECTED: { variant: "rejected", label: "Rejected" },
  EXPIRED: { variant: "archived", label: "Expired" },
  POSTED: { variant: "approved", label: "Posted" },
  POST_EXPIRED: { variant: "flagged", label: "Post expired" },
};

export function MySubmissionsClient() {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("PENDING");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  function buildUrl(cursor?: string | null): string {
    const params = new URLSearchParams();
    if (activeFilter !== "ALL") params.set("status", activeFilter);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    params.set("_t", String(Date.now()));
    return `/api/marketplace/submissions?${params.toString()}`;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (!res.ok) {
        toast.error("Could not load submissions.");
        setSubmissions([]);
        setNextCursor(null);
        return;
      }
      const data = await res.json();
      setSubmissions(Array.isArray(data?.submissions) ? data.submissions : []);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      toast.error("Network error loading submissions.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor), { cache: "no-store" });
      if (!res.ok) {
        toast.error("Could not load more submissions.");
        return;
      }
      const data = await res.json();
      setSubmissions((prev) => [
        ...prev,
        ...(Array.isArray(data?.submissions) ? data.submissions : []),
      ]);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      toast.error("Network error loading more.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <Inbox className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Submissions</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Clips you've sent to marketplace listings.
          </p>
        </div>
      </div>

      {/* Filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
              className={
                isActive
                  ? "rounded-full border border-accent bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent"
                  : "rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">Loading submissions...</p>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No submissions in this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {submissions.map((s) => (
            <SubmissionCard key={s.id} submission={s} />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function hoursLeftUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return ms / (60 * 60 * 1000);
}

function formatHoursLeft(hours: number): string {
  if (hours <= 0) return "Past deadline";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min remaining`;
  return `${Math.round(hours)}h remaining`;
}

function SubmissionCard({ submission }: { submission: any }) {
  const status: string = submission.status;
  const badge =
    STATUS_BADGE[status] ?? { variant: "archived" as StatusVariant, label: status };

  // Privacy contract: surface poster username only — never email/role/id.
  const posterUsername: string = submission.listing?.user?.username ?? "(unknown)";
  const acctUsername: string = submission.listing?.clipAccount?.username ?? "(unknown)";
  const acctPlatform: string = submission.listing?.clipAccount?.platform ?? "";
  const profileLink: string | null = submission.listing?.clipAccount?.profileLink ?? null;
  const campaignName: string = submission.listing?.campaign?.name ?? "(unknown campaign)";

  const driveUrl: string = submission.driveUrl ?? "";
  const platforms: string[] = Array.isArray(submission.platforms) ? submission.platforms : [];
  const notes: string = submission.notes ?? "";
  const createdAt: string | null = submission.createdAt ?? null;
  const expiresAt: string | null = submission.expiresAt ?? null;
  const postDeadline: string | null = submission.postDeadline ?? null;
  const rejectionReason: string | null = submission.rejectionReason ?? null;
  const improvementNote: string | null = submission.improvementNote ?? null;

  return (
    <Card>
      {/* Header: account + status */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
            @{acctUsername}
          </p>
          {acctPlatform ? (
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              {acctPlatform}
            </p>
          ) : null}
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {/* Listing context */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Posted by
      </p>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">@{posterUsername}</p>

      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Campaign
      </p>
      <p className="mb-3 truncate text-sm font-medium text-[var(--text-primary)]">
        {campaignName}
      </p>

      {/* Drive URL */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Drive link
      </p>
      <a
        href={driveUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex items-center gap-1 truncate text-xs text-accent hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        Open clip
      </a>

      {/* Platforms */}
      {platforms.length > 0 ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Platforms
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {platforms.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[var(--border-color)] bg-[var(--bg-page)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]"
              >
                {p}
              </span>
            ))}
          </div>
        </>
      ) : null}

      {/* Profile link */}
      {profileLink ? (
        <a
          href={profileLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          View profile ↗
        </a>
      ) : null}

      {/* Status-specific blocks */}
      {status === "APPROVED" && postDeadline ? (
        (() => {
          const h = hoursLeftUntil(postDeadline);
          if (h === null) return null;
          return (
            <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-2 text-center">
              <p className="text-[11px] uppercase tracking-widest text-accent">Post deadline</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                {formatHoursLeft(h)}
              </p>
            </div>
          );
        })()
      ) : null}

      {status === "REJECTED" && rejectionReason ? (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-red-400">
            Rejection reason
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{rejectionReason}</p>
          {improvementNote ? (
            <>
              <p className="mt-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                Improvement note
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{improvementNote}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Notes (collapsed style) */}
      {notes ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Your notes
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">{notes}</p>
        </details>
      ) : null}

      {/* Footer timestamps */}
      <div className="flex flex-wrap gap-x-3 text-[11px] text-[var(--text-muted)]">
        {createdAt ? <span>Submitted {formatRelative(createdAt)}</span> : null}
        {status === "PENDING" && expiresAt ? (
          (() => {
            const h = hoursLeftUntil(expiresAt);
            if (h === null) return null;
            return <span>· Review {formatHoursLeft(h)}</span>;
          })()
        ) : null}
      </div>
    </Card>
  );
}
