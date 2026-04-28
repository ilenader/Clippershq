"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, ExternalLink, Check, X as XIcon, Filter } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative } from "@/lib/utils";
// Phase: re-use the existing Mark-as-posted modal from the creator-side
// my-submissions page rather than duplicating it. The modal is identical
// from the poster's POV: same submissionId-keyed POST to
// /api/marketplace/submissions/[id]/post, same listingDisplay shape.
import { PostClipModal } from "../my-submissions/post-clip-modal";
import { RejectSubmissionModal } from "./reject-modal";

interface PostingTarget {
  submissionId: string;
  listingDisplay: {
    posterUsername: string;
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
    postDeadline: string | null;
  };
}

interface RejectingTarget {
  submissionId: string;
  submissionDisplay: {
    creatorUsername: string;
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
  };
}

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "POSTED", label: "Posted" },
  { value: "EXPIRED", label: "Expired" },
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

const STATUS_BADGE: Record<string, { variant: StatusVariant; label: string }> = {
  PENDING: { variant: "pending", label: "Pending review" },
  APPROVED: { variant: "active", label: "Approved" },
  REJECTED: { variant: "rejected", label: "Rejected" },
  EXPIRED: { variant: "archived", label: "Expired" },
  POSTED: { variant: "approved", label: "Posted" },
  POST_EXPIRED: { variant: "flagged", label: "Post expired" },
};

export function IncomingSubmissionsClient() {
  const searchParams = useSearchParams();
  // Phase: ?listingId= drives a per-listing filter. Read once on mount;
  // managed in state from there so a Clear button can drop it without
  // having to mutate the URL.
  const initialListingId = searchParams?.get("listingId") ?? null;

  const [activeFilter, setActiveFilter] = useState<FilterValue>("PENDING");
  const [listingIdFilter, setListingIdFilter] = useState<string | null>(initialListingId);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  const [postingTarget, setPostingTarget] = useState<PostingTarget | null>(null);
  const [rejectingTarget, setRejectingTarget] = useState<RejectingTarget | null>(null);

  // Out-of-order fetch protection — same pattern used in browse-client.
  const fetchSeqRef = useRef(0);

  function buildUrl(cursor?: string | null): string {
    const params = new URLSearchParams();
    if (activeFilter !== "ALL") params.set("status", activeFilter);
    if (listingIdFilter) params.set("listingId", listingIdFilter);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    params.set("_t", String(Date.now()));
    return `/api/marketplace/submissions/incoming?${params.toString()}`;
  }

  async function load() {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (seq !== fetchSeqRef.current) return;
      if (!res.ok) {
        toast.error("Could not load submissions.");
        setSubmissions([]);
        setNextCursor(null);
        return;
      }
      const data = await res.json();
      if (seq !== fetchSeqRef.current) return;
      setSubmissions(Array.isArray(data?.submissions) ? data.submissions : []);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      toast.error("Network error loading submissions.");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
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
  }, [activeFilter, listingIdFilter]);

  async function handleApprove(submissionId: string) {
    setActioning(submissionId);
    try {
      const res = await fetch(`/api/marketplace/submissions/${submissionId}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Submission approved. Creator can now post within 24h.");
        await load();
        return;
      }
      let msg = "Could not approve submission.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") msg = data.error;
      } catch {
        // ignore parse errors
      }
      toast.error(msg);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActioning(null);
    }
  }

  function openReject(submission: any) {
    setRejectingTarget({
      submissionId: submission.id,
      submissionDisplay: {
        creatorUsername: submission.creator?.username ?? "(unknown)",
        accountUsername: submission.listing?.clipAccount?.username ?? "(unknown)",
        accountPlatform: submission.listing?.clipAccount?.platform ?? "",
        campaignName: submission.listing?.campaign?.name ?? "(unknown campaign)",
      },
    });
  }

  function openMarkAsPosted(submission: any) {
    setPostingTarget({
      submissionId: submission.id,
      listingDisplay: {
        // Posters of their own listings — the "posterUsername" shown in the
        // post-clip modal is themselves. Empty fallback keeps the modal happy.
        posterUsername: submission.listing?.user?.username ?? "",
        accountUsername: submission.listing?.clipAccount?.username ?? "(unknown)",
        accountPlatform: submission.listing?.clipAccount?.platform ?? "",
        campaignName: submission.listing?.campaign?.name ?? "(unknown campaign)",
        postDeadline: submission.postDeadline ?? null,
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <Inbox className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Review Submissions</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Clips creators have submitted to your active listings.
          </p>
        </div>
      </div>

      {/* Per-listing filter badge — only when ?listingId= scoped the view */}
      {listingIdFilter ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2">
          <Filter className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs text-[var(--text-secondary)]">
            Filtered to listing{" "}
            <span className="font-mono text-[11px] text-[var(--text-primary)]">
              {listingIdFilter.slice(0, 8)}…
            </span>
          </span>
          <button
            type="button"
            onClick={() => setListingIdFilter(null)}
            className="ml-auto text-xs font-semibold uppercase tracking-widest text-accent hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

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
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">
          Loading submissions...
        </p>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">
            No submissions yet. They&apos;ll appear here when creators submit clips to your active listings.
          </p>
          <Link
            href="/marketplace"
            className="mt-2 text-xs font-semibold uppercase tracking-widest text-accent hover:underline"
          >
            Back to my listings
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {submissions.map((s) => (
            <IncomingSubmissionCard
              key={s.id}
              submission={s}
              actioning={actioning === s.id}
              onApprove={() => handleApprove(s.id)}
              onReject={() => openReject(s)}
              onMarkAsPosted={() => openMarkAsPosted(s)}
            />
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

      {/* Modals — mounted once at page level so opening for different cards
          doesn't unmount/remount their state. */}
      <PostClipModal
        open={postingTarget !== null}
        onClose={() => setPostingTarget(null)}
        onSuccess={() => {
          setPostingTarget(null);
          load();
        }}
        submissionId={postingTarget?.submissionId ?? ""}
        listingDisplay={postingTarget?.listingDisplay ?? null}
      />
      <RejectSubmissionModal
        open={rejectingTarget !== null}
        onClose={() => setRejectingTarget(null)}
        onSuccess={() => {
          setRejectingTarget(null);
          load();
        }}
        submissionId={rejectingTarget?.submissionId ?? ""}
        submissionDisplay={rejectingTarget?.submissionDisplay ?? null}
      />
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

function IncomingSubmissionCard({
  submission,
  actioning,
  onApprove,
  onReject,
  onMarkAsPosted,
}: {
  submission: any;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
  onMarkAsPosted: () => void;
}) {
  const status: string = submission.status;
  const badge =
    STATUS_BADGE[status] ?? { variant: "archived" as StatusVariant, label: status };

  // Privacy contract: surface creator username only — incoming endpoint
  // already strips email per the Phase 7 audit.
  const creatorUsername: string = submission.creator?.username ?? "(unknown)";
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
  const postedAt: string | null = submission.postedAt ?? null;
  const rejectionReason: string | null = submission.rejectionReason ?? null;
  const improvementNote: string | null = submission.improvementNote ?? null;
  const postedClipUrl: string | null = submission.posts?.[0]?.clip?.clipUrl ?? null;

  const reviewHoursLeft =
    status === "PENDING" && expiresAt ? hoursLeftUntil(expiresAt) : null;
  const postHoursLeft =
    status === "APPROVED" && postDeadline ? hoursLeftUntil(postDeadline) : null;
  const postDeadlinePassed = postHoursLeft !== null && postHoursLeft <= 0;

  return (
    <Card>
      {/* Header: target account + status */}
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

      {/* Creator (the submitter) */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Submitted by
      </p>
      <p className="mb-3 text-sm text-[var(--text-secondary)]">@{creatorUsername}</p>

      {/* Campaign */}
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

      {/* Profile link to target account */}
      {profileLink ? (
        <a
          href={profileLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          View target profile ↗
        </a>
      ) : null}

      {/* Status-specific content */}
      {status === "PENDING" && reviewHoursLeft !== null ? (
        <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-2 text-center">
          <p className="text-[11px] uppercase tracking-widest text-accent">Review window</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
            {formatHoursLeft(reviewHoursLeft)}
          </p>
        </div>
      ) : null}

      {status === "APPROVED" && postHoursLeft !== null ? (
        <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-2 text-center">
          <p className="text-[11px] uppercase tracking-widest text-accent">Post deadline</p>
          <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
            {formatHoursLeft(postHoursLeft)}
          </p>
        </div>
      ) : null}

      {status === "POSTED" && postedClipUrl ? (
        <a
          href={postedClipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex items-center gap-1 truncate text-xs text-accent hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          View posted clip
        </a>
      ) : null}
      {status === "POSTED" && postedAt ? (
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Posted {formatRelative(postedAt)}
        </p>
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

      {/* Notes */}
      {notes ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Creator notes
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
            {notes}
          </p>
        </details>
      ) : null}

      {/* Submitted-at */}
      {createdAt ? (
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">
          Submitted {formatRelative(createdAt)}
        </p>
      ) : null}

      {/* Actions by status */}
      {status === "PENDING" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={onApprove}
            loading={actioning}
            disabled={actioning}
            icon={<Check className="h-3.5 w-3.5" />}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onReject}
            disabled={actioning}
            icon={<XIcon className="h-3.5 w-3.5" />}
          >
            Reject
          </Button>
        </div>
      ) : null}
      {status === "APPROVED" ? (
        <Button
          size="sm"
          className="w-full"
          onClick={onMarkAsPosted}
          disabled={postDeadlinePassed}
        >
          {postDeadlinePassed ? "Deadline passed" : "Mark as posted"}
        </Button>
      ) : null}
    </Card>
  );
}
