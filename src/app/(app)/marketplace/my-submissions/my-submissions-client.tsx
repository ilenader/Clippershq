"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { Inbox, ExternalLink, Star, Ban } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative } from "@/lib/utils";
import { PostClipModal } from "./post-clip-modal";
// Phase 7a — bidirectional rating modal, shared with /incoming.
import { RateUserModal } from "../_shared/rate-user-modal";
// Phase 10 — skeleton card grid replaces plain "Loading..." text.
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";

// Phase 6f — payload passed from a SubmissionCard up to the parent so the
// modal opens with the right submission + display context. Privacy contract:
// only username-shaped data, never email/role/id.
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

// Phase 7a — rating-target payload for the creator-side rate modal.
// Direction here is always CREATOR_RATES_POSTER.
interface RatingTarget {
  submissionId: string;
  ratedDisplay: {
    username: string;
    role: "poster";
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
  };
}

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
  // Phase 6f — null means modal closed. When set, the modal opens for that
  // specific submission. Refetching after success flips its status to POSTED
  // in the list.
  const [postingTarget, setPostingTarget] = useState<PostingTarget | null>(null);
  // Phase 7a — open-state for the rate-poster modal. Direction on this page
  // is always CREATOR_RATES_POSTER (page is creator-side).
  const [ratingTarget, setRatingTarget] = useState<RatingTarget | null>(null);
  // Phase 10 — track whether the user has EVER seen any submissions in this
  // session, so the empty-state copy can differentiate "never submitted" from
  // "this filter has zero hits."
  const [seenAnyEver, setSeenAnyEver] = useState(false);
  // Phase 10 cleanup — banned banner mirrors browse-client for UX consistency.
  const [bannedUntil, setBannedUntil] = useState<string | null>(null);

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
        // Phase 10 cleanup — surface 403+bannedUntil as inline banner instead
        // of a fire-and-forget toast. Mirrors browse-client banned banner.
        if (res.status === 403) {
          try {
            const data = await res.json();
            if (data?.bannedUntil && typeof data.bannedUntil === "string") {
              setBannedUntil(data.bannedUntil);
              setSubmissions([]);
              setNextCursor(null);
              return;
            }
          } catch {
            // fall through to generic error
          }
        }
        toast.error("Could not load submissions.");
        setSubmissions([]);
        setNextCursor(null);
        return;
      }
      const data = await res.json();
      const fetched = Array.isArray(data?.submissions) ? data.submissions : [];
      setSubmissions(fetched);
      setNextCursor(data?.nextCursor ?? null);
      setBannedUntil(null);
      // Phase 10 — flip seenAnyEver once any fetch returns at least one row.
      if (fetched.length > 0 && !seenAnyEver) setSeenAnyEver(true);
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

      {/* Phase 10 cleanup — banned banner. Same pattern as browse-client.
          Existing POSTED submissions remain visible below (read-only via
          server-side rules), so the banner sits ABOVE the filter pills
          rather than replacing the list. */}
      {bannedUntil ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/15">
              <Ban className="h-5 w-5 text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                You&apos;re banned from the marketplace until {formatRelative(bannedUntil)}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                You can submit clips again on {new Date(bannedUntil).toLocaleString()}. Until then your existing submissions are read-only.
              </p>
            </div>
          </div>
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
        // Phase 10 — skeleton grid replaces plain "Loading..." text.
        <SkeletonCardGrid count={6} />
      ) : submissions.length === 0 ? (
        // Phase 10 — filter-aware empty state. seenAnyEver differentiates
        // "you've never submitted" from "this filter has zero hits."
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-[var(--text-muted)]" />
          {seenAnyEver || activeFilter !== "PENDING" ? (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                Nothing in {FILTERS.find((f) => f.value === activeFilter)?.label.toLowerCase() ?? activeFilter}.
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter("ALL")}
                className="mt-2 text-xs font-semibold uppercase tracking-widest text-accent hover:underline"
              >
                Show all
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                You haven&apos;t submitted any clips yet.
              </p>
              <Link
                href="/marketplace/browse"
                className="mt-2 text-xs font-semibold uppercase tracking-widest text-accent hover:underline"
              >
                Browse listings →
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {submissions.map((s) => (
            <SubmissionCard
              key={s.id}
              submission={s}
              onMarkAsPosted={setPostingTarget}
              onRate={setRatingTarget}
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

      {/* Phase 6f — Mark-as-posted modal. Mounted once at the page level so
          opening for a different card doesn't unmount/remount its state. */}
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
      {/* Phase 7a — Rate-poster modal. Same parent-level mounting pattern. */}
      <RateUserModal
        open={ratingTarget !== null}
        onClose={() => setRatingTarget(null)}
        onSuccess={() => {
          setRatingTarget(null);
          load();
        }}
        submissionId={ratingTarget?.submissionId ?? ""}
        ratedDisplay={ratingTarget?.ratedDisplay ?? null}
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

function SubmissionCard({
  submission,
  onMarkAsPosted,
  onRate,
}: {
  submission: any;
  onMarkAsPosted?: (target: PostingTarget) => void;
  onRate?: (target: RatingTarget) => void;
}) {
  const status: string = submission.status;
  const badge =
    STATUS_BADGE[status] ?? { variant: "archived" as StatusVariant, label: status };

  // Privacy contract: surface poster username only — never email/role/id.
  const posterUsername: string = submission.listing?.user?.username ?? "(unknown)";
  // Phase 7a — poster's as-poster rep, surfaced under "Posted by" so the
  // creator sees who they submitted to. Hidden when count === 0 (Q13).
  const posterAvg: number | null = submission.listing?.user?.marketplaceAvgAsPoster ?? null;
  const posterCount: number = submission.listing?.user?.marketplaceCountAsPoster ?? 0;
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
  // Phase 6f — when the submission is POSTED, the API returns the live clip
  // URL via the `posts` relation (MarketplaceClipPost). At most one entry.
  const postedClipUrl: string | null =
    submission.posts?.[0]?.clip?.clipUrl ?? null;
  // Phase 7a — find any creator→poster rating on this submission. The page
  // is creator-side, so any CREATOR_RATES_POSTER row means the current
  // creator has already rated. Composite unique guarantees at most one.
  const ratings: any[] = Array.isArray(submission.ratings) ? submission.ratings : [];
  const myRating = ratings.find((r) => r.direction === "CREATOR_RATES_POSTER");

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
      <p className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span>@{posterUsername}</span>
        {/* Phase 7a — poster rep badge. Hidden when no ratings (Q13). */}
        {posterCount > 0 && posterAvg !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-page)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
            <Star className="h-2.5 w-2.5 fill-current text-accent" />
            <span>
              {posterAvg.toFixed(1)} ({posterCount})
            </span>
          </span>
        ) : null}
      </p>

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
          // Phase 6f — disable the Mark-as-posted button when the deadline
          // has passed. Server will reject anyway; failing fast in the UI
          // saves a round-trip.
          const deadlinePassed = h <= 0;
          return (
            <div className="mb-3 space-y-2">
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-2 text-center">
                <p className="text-[11px] uppercase tracking-widest text-accent">Post deadline</p>
                <p className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">
                  {formatHoursLeft(h)}
                </p>
              </div>
              {onMarkAsPosted ? (
                <Button
                  className="w-full"
                  disabled={deadlinePassed}
                  onClick={() =>
                    onMarkAsPosted({
                      submissionId: submission.id,
                      listingDisplay: {
                        posterUsername,
                        accountUsername: acctUsername,
                        accountPlatform: acctPlatform,
                        campaignName,
                        postDeadline,
                      },
                    })
                  }
                >
                  Mark as posted
                </Button>
              ) : null}
            </div>
          );
        })()
      ) : null}

      {/* Phase 6f — POSTED submissions get a verification link to the live
          clip. Server-side, MarketplaceClipPost is created in the same TX
          that flips status → POSTED, so this link is always present here. */}
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

      {/* Phase 7a — POSTED card rating affordance for creator-side. Replaced
          by a read-only readout once the creator has rated. */}
      {status === "POSTED" ? (
        myRating ? (
          <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 p-3">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-accent">
              You rated this poster
            </p>
            <div className="flex items-center gap-2">
              <StarRating value={myRating.score} size="md" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {myRating.score}/5
              </span>
            </div>
            {myRating.note ? (
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--text-secondary)]">
                {myRating.note}
              </p>
            ) : null}
          </div>
        ) : onRate ? (
          <Button
            size="sm"
            variant="secondary"
            className="mb-3 w-full"
            onClick={() =>
              onRate({
                submissionId: submission.id,
                ratedDisplay: {
                  username: posterUsername,
                  role: "poster",
                  accountUsername: acctUsername,
                  accountPlatform: acctPlatform,
                  campaignName,
                },
              })
            }
            icon={<Star className="h-3.5 w-3.5" />}
          >
            Rate poster
          </Button>
        ) : null
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
