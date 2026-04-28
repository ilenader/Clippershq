"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

// Phase 3b-3 — confirmation modal for the "Request delete" action. Uses a
// modal (not window.confirm) because the in-flight guard from the API needs
// somewhere to render its specific count + reason inline. window.confirm
// can't display server-side error text and would force the user to dismiss
// twice (once for confirm, once for the toast).

interface RequestDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  listingId: string;
  listingDisplay: {
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
  } | null;
}

export function RequestDeleteModal({
  open,
  onClose,
  onSuccess,
  listingId,
  listingDisplay,
}: RequestDeleteModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Reset on open. Clears any prior in-flight error so re-opening for a
  // different listing doesn't show stale state.
  useEffect(() => {
    if (open) {
      setSubmitting(false);
      setInlineError(null);
    }
  }, [open, listingId]);

  async function handleConfirm() {
    if (submitting || !listingId) return;
    setSubmitting(true);
    setInlineError(null);
    try {
      const res = await fetch(`/api/marketplace/listings/${listingId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Deletion requested. The owner will review shortly.");
        onSuccess();
        return;
      }
      let serverError: string | null = null;
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") serverError = data.error;
      } catch {
        // ignore parse error
      }
      if (res.status === 400) {
        // Phase 3b-3 — in-flight guard hits 400. Render inline (NOT toast)
        // so the user can read the message in context without dismissing
        // the modal first.
        setInlineError(serverError ?? "Cannot request deletion right now.");
        setSubmitting(false);
        return;
      }
      if (res.status === 403) {
        toast.error(serverError ?? "Not authorized to delete this listing.");
      } else if (res.status === 404) {
        toast.error(serverError ?? "Listing not found.");
      } else if (res.status === 429) {
        toast.error("Too many requests. Wait a bit and try again.");
      } else {
        toast.error(serverError ?? "Could not request deletion. Please try again.");
      }
      setSubmitting(false);
    } catch {
      toast.error("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request listing deletion">
      <div className="space-y-4">
        {listingDisplay ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Listing
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              <span className="font-semibold">@{listingDisplay.accountUsername}</span>
              {listingDisplay.accountPlatform ? (
                <span className="text-[var(--text-muted)]"> ({listingDisplay.accountPlatform})</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {listingDisplay.campaignName}
            </p>
          </div>
        ) : null}

        <p className="text-sm text-[var(--text-secondary)]">
          This will request deletion of your listing. The owner must approve before
          it&apos;s permanently removed. You can cancel the request anytime before
          approval.
        </p>

        {inlineError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-[11px] uppercase tracking-widest text-red-400">
              Cannot request deletion
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{inlineError}</p>
          </div>
        ) : null}

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 pb-1 pt-3">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirm}
              loading={submitting}
              disabled={submitting || !listingId}
            >
              Request deletion
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
