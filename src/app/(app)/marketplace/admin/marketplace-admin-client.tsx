"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, Check, X, Inbox, Trash2, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatRelative } from "@/lib/utils";

const MAX_REASON = 1000;

const FILTERS = [
  { value: "PENDING_APPROVAL", label: "Pending review" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DELETION_REQUESTED", label: "Deletion requested" },
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
  PENDING_APPROVAL: { variant: "pending", label: "Pending review" },
  ACTIVE: { variant: "active", label: "Active" },
  PAUSED: { variant: "paused", label: "Paused" },
  REJECTED: { variant: "rejected", label: "Rejected" },
  DELETION_REQUESTED: { variant: "flagged", label: "Deletion requested" },
  DELETED: { variant: "archived", label: "Deleted" },
  BANNED: { variant: "rejected", label: "Banned" },
};

export function MarketplaceAdminClient() {
  const [activeFilter, setActiveFilter] = useState<FilterValue>("PENDING_APPROVAL");
  const [listings, setListings] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);

  // Reject modal state
  const [rejectListing, setRejectListing] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Build the GET URL with filter, limit, optional cursor, and cache-bust.
  function buildUrl(cursor?: string | null): string {
    const params = new URLSearchParams();
    if (activeFilter !== "ALL") params.set("status", activeFilter);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    params.set("_t", String(Date.now()));
    return `/api/marketplace/admin/listings?${params.toString()}`;
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (!res.ok) {
        toast.error("Could not load listings.");
        setListings([]);
        setNextCursor(null);
        return;
      }
      const data = await res.json();
      setListings(Array.isArray(data?.listings) ? data.listings : []);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      toast.error("Network error loading listings.");
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
        toast.error("Could not load more listings.");
        return;
      }
      const data = await res.json();
      setListings((prev) => [...prev, ...(Array.isArray(data?.listings) ? data.listings : [])]);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      toast.error("Network error loading more.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Refetch whenever the filter changes (or on mount).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  async function handleApprove(id: string) {
    setActioning(id);
    try {
      const res = await fetch(`/api/marketplace/admin/listings/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Listing approved.");
        await load();
        return;
      }
      let msg = "Could not approve listing.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") msg = data.error;
      } catch {
        // ignore
      }
      toast.error(msg);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActioning(null);
    }
  }

  // Phase 3b-3 — approve a poster's pending deletion. Calls the existing
  // override endpoint with status: DELETED rather than introducing a
  // dedicated finalize-delete route. Audit-logged as
  // MARKETPLACE_LISTING_OVERRIDE by the override route already.
  async function handleApproveDeletion(id: string) {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Permanently delete this listing? In-flight submissions will be left as-is — they're already past the in-flight guard.",
      );
      if (!ok) return;
    }
    setActioning(id);
    try {
      const res = await fetch(`/api/marketplace/admin/listings/${id}/override`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DELETED" }),
      });
      if (res.ok) {
        toast.success("Listing deleted.");
        await load();
        return;
      }
      let msg = "Could not delete listing.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") msg = data.error;
      } catch {
        // ignore
      }
      toast.error(msg);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActioning(null);
    }
  }

  // Phase 3b-3 — OWNER-side cancel of a pending deletion (mirrors the
  // poster-side flow). Same /cancel-delete endpoint accepts OWNER role.
  async function handleAdminCancelDeletion(id: string) {
    if (typeof window !== "undefined") {
      const ok = window.confirm("Cancel this deletion request and reactivate the listing?");
      if (!ok) return;
    }
    setActioning(id);
    try {
      const res = await fetch(`/api/marketplace/listings/${id}/cancel-delete`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Deletion request cancelled. Listing is active again.");
        await load();
        return;
      }
      let msg = "Could not cancel deletion.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") msg = data.error;
      } catch {
        // ignore
      }
      toast.error(msg);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setActioning(null);
    }
  }

  function openReject(listing: any) {
    setRejectListing(listing);
    setRejectReason("");
  }

  function closeReject() {
    setRejectListing(null);
    setRejectReason("");
    setRejectSubmitting(false);
  }

  const rejectReasonTrim = rejectReason.trim();
  const rejectValid =
    rejectReasonTrim.length > 0 && rejectReasonTrim.length <= MAX_REASON;

  async function submitReject() {
    if (!rejectListing || !rejectValid || rejectSubmitting) return;
    setRejectSubmitting(true);
    try {
      const res = await fetch(
        `/api/marketplace/admin/listings/${rejectListing.id}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: rejectReasonTrim }),
        },
      );
      if (res.ok) {
        toast.success("Listing rejected.");
        closeReject();
        await load();
        return;
      }
      let msg = "Could not reject listing.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") msg = data.error;
      } catch {
        // ignore
      }
      toast.error(msg);
      setRejectSubmitting(false);
    } catch {
      toast.error("Network error. Please try again.");
      setRejectSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <ShieldCheck className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Marketplace Admin
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Approve, reject, or override marketplace listings.
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
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">Loading listings...</p>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Inbox className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No listings in this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <AdminListingCard
              key={l.id}
              listing={l}
              actioning={actioning === l.id}
              onApprove={() => handleApprove(l.id)}
              onReject={() => openReject(l)}
              onApproveDeletion={() => handleApproveDeletion(l.id)}
              onCancelDeletion={() => handleAdminCancelDeletion(l.id)}
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

      {/* Reject modal */}
      <Modal
        open={!!rejectListing}
        onClose={closeReject}
        title="Reject listing"
      >
        <div className="space-y-4">
          {rejectListing ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Rejecting{" "}
              <span className="font-medium text-[var(--text-primary)]">
                @{rejectListing.clipAccount?.username ?? "(unknown)"}
              </span>{" "}
              on{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {rejectListing.campaign?.name ?? "(unknown campaign)"}
              </span>
              .
            </p>
          ) : null}

          <Textarea
            id="mkt-reject-reason"
            label="Rejection reason *"
            placeholder="Explain why this listing is being rejected. The poster will see this."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            maxLength={MAX_REASON}
            rows={4}
          />
          <p className="text-xs text-[var(--text-muted)]">
            {rejectReasonTrim.length}/{MAX_REASON}
          </p>

          <div className="sticky bottom-0 bg-[var(--bg-card)] pt-3 pb-1 border-t border-[var(--border-color)] -mx-6 px-6 -mb-6">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeReject}
                disabled={rejectSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={submitReject}
                loading={rejectSubmitting}
                disabled={!rejectValid || rejectSubmitting}
              >
                Reject listing
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AdminListingCard({
  listing,
  actioning,
  onApprove,
  onReject,
  onApproveDeletion,
  onCancelDeletion,
}: {
  listing: any;
  actioning: boolean;
  onApprove: () => void;
  onReject: () => void;
  onApproveDeletion: () => void;
  onCancelDeletion: () => void;
}) {
  const status: string = listing.status;
  const badge =
    STATUS_BADGE[status] ?? { variant: "archived" as StatusVariant, label: status };
  const isPending = status === "PENDING_APPROVAL";
  // Phase 3b-3 — OWNER finalize/cancel for posters' deletion requests.
  const isDeletionRequested = status === "DELETION_REQUESTED";

  const posterUsername: string = listing.user?.username ?? "(unknown user)";
  const posterEmail: string = listing.user?.email ?? "";

  const acctUsername: string = listing.clipAccount?.username ?? "(unknown)";
  const acctPlatform: string = listing.clipAccount?.platform ?? "";
  const profileLink: string | null = listing.clipAccount?.profileLink ?? null;

  const campaignName: string = listing.campaign?.name ?? "(unknown campaign)";

  const niche: string = listing.niche ?? "";
  const audience: string = listing.audienceDescription ?? "";
  const followers: number = listing.followerCount ?? 0;
  const slots: number = listing.dailySlotCount ?? 0;
  const country: string | null = listing.country ?? null;
  const timezone: string | null = listing.timezone ?? null;
  const rejectionReason: string | null = listing.rejectionReason ?? null;
  const createdAt: string | null = listing.createdAt ?? null;

  return (
    <Card>
      {/* Top row: account + status */}
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

      {/* Poster */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Posted by
      </p>
      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
        {posterUsername}
      </p>
      {posterEmail ? (
        <p className="mb-3 truncate text-xs text-[var(--text-muted)]">{posterEmail}</p>
      ) : (
        <div className="mb-3" />
      )}

      {/* Campaign */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Campaign
      </p>
      <p className="mb-3 truncate text-sm font-medium text-[var(--text-primary)]">
        {campaignName}
      </p>

      {/* Niche */}
      {niche ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Niche
          </p>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">{niche}</p>
        </>
      ) : null}

      {/* Audience */}
      {audience ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Audience
          </p>
          <p className="mb-3 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {audience}
          </p>
        </>
      ) : null}

      {/* Followers + slots */}
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-page)] p-2 text-center">
        <div>
          <p className="text-base font-bold text-accent">
            {followers.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Followers
          </p>
        </div>
        <div>
          <p className="text-base font-bold text-accent">
            {slots}
            <span className="text-xs text-[var(--text-muted)]"> / 10</span>
          </p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
            Daily slots
          </p>
        </div>
      </div>

      {/* Country/timezone (optional) */}
      {country || timezone ? (
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {country ?? ""}
          {country && timezone ? " · " : ""}
          {timezone ?? ""}
        </p>
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

      {/* Rejection reason inline */}
      {status === "REJECTED" && rejectionReason ? (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-red-400">
            Rejection reason
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{rejectionReason}</p>
        </div>
      ) : null}

      {/* Created at */}
      {createdAt ? (
        <p className="mb-3 text-[11px] text-[var(--text-muted)]">
          Submitted {formatRelative(createdAt)}
        </p>
      ) : null}

      {/* Actions */}
      {isPending ? (
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
            icon={<X className="h-3.5 w-3.5" />}
          >
            Reject
          </Button>
        </div>
      ) : isDeletionRequested ? (
        // Phase 3b-3 — OWNER actions on a pending deletion request:
        // finalize (status: DELETED via override) or cancel (restore ACTIVE).
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="danger"
            onClick={onApproveDeletion}
            loading={actioning}
            disabled={actioning}
            icon={<Trash2 className="h-3.5 w-3.5" />}
          >
            Approve deletion
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onCancelDeletion}
            disabled={actioning}
            icon={<RotateCcw className="h-3.5 w-3.5" />}
          >
            Cancel deletion request
          </Button>
        </div>
      ) : (
        <p className="text-xs italic text-[var(--text-muted)]">Read-only.</p>
      )}
    </Card>
  );
}
