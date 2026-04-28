"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const MAX_REASON = 1000;
const MAX_NOTE = 1000;

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  submissionId: string;
  // Display-only context shown in the modal header so the poster knows
  // exactly which submission they're rejecting. Privacy contract: only
  // username-shaped data, never email/role/id.
  submissionDisplay: {
    creatorUsername: string;
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
  } | null;
}

// Phase: poster-side reject modal. Mirrors the listing-reject modal pattern
// in src/app/(app)/marketplace/admin/marketplace-admin-client.tsx but adds
// an optional improvementNote field (constructive feedback for the creator)
// because the submission-reject API supports it. POST /api/marketplace/
// submissions/[id]/reject returns 400 on validation, 404 on missing/not
// owned, 403 on non-OWNER (during hidden phase), 500 on unexpected.
export function RejectSubmissionModal({
  open,
  onClose,
  onSuccess,
  submissionId,
  submissionDisplay,
}: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [improvementNote, setImprovementNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setImprovementNote("");
      setSubmitting(false);
    }
  }, [open]);

  const reasonTrim = reason.trim();
  const noteTrim = improvementNote.trim();
  const reasonValid = reasonTrim.length > 0 && reasonTrim.length <= MAX_REASON;
  const noteValid = noteTrim.length <= MAX_NOTE;
  const canSubmit = !submitting && reasonValid && noteValid && submissionId.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/submissions/${submissionId}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: reasonTrim,
          improvementNote: noteTrim.length > 0 ? noteTrim : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Submission rejected.");
        onSuccess();
        return;
      }
      let serverError: string | null = null;
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") serverError = data.error;
      } catch {
        // ignore parse errors
      }
      if (res.status === 400) {
        toast.error(serverError ?? "Could not reject. Check the form and try again.");
      } else if (res.status === 403) {
        toast.error(serverError ?? "Only the listing owner can reject.");
      } else if (res.status === 404) {
        toast.error(serverError ?? "Submission not found.");
      } else if (res.status === 429) {
        toast.error("Too many requests. Wait a bit and try again.");
      } else {
        toast.error(serverError ?? "Could not reject submission. Please try again.");
      }
      setSubmitting(false);
    } catch {
      toast.error("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Reject submission">
      <div className="space-y-4">
        {submissionDisplay ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Rejecting clip from
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              <span className="font-semibold">@{submissionDisplay.creatorUsername}</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              For @{submissionDisplay.accountUsername}
              {submissionDisplay.accountPlatform ? (
                <span className="text-[var(--text-muted)]"> ({submissionDisplay.accountPlatform})</span>
              ) : null}
              {" · "}
              {submissionDisplay.campaignName}
            </p>
          </div>
        ) : null}

        <Textarea
          id="mkt-incoming-reject-reason"
          label="Rejection reason *"
          placeholder="Explain why this clip is being rejected. The creator will see this."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON}
          rows={4}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {reasonTrim.length}/{MAX_REASON}
        </p>

        <Textarea
          id="mkt-incoming-reject-note"
          label="Improvement note (optional)"
          placeholder="Constructive feedback so the creator can do better next time."
          value={improvementNote}
          onChange={(e) => setImprovementNote(e.target.value)}
          maxLength={MAX_NOTE}
          rows={3}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {noteTrim.length}/{MAX_NOTE}
        </p>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 pb-1 pt-3">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
            >
              Reject submission
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
