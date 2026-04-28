"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/star-rating";
import { toast } from "@/lib/toast";

const MAX_NOTE = 1000;

// Phase 7a — shared rate modal used from both /incoming (poster rating
// creator) and /my-submissions (creator rating poster). Direction is derived
// server-side from the caller's identity vs the submission's role columns,
// so this modal does NOT need to send `direction` — only score and note.
interface RateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  submissionId: string;
  // Display-only context. Privacy contract: only username-shaped fields, no
  // email/role/id of the rated party.
  ratedDisplay: {
    /** Username of the person being rated. */
    username: string;
    /** Whether the person being rated is the poster or the creator. */
    role: "poster" | "creator";
    /** Listing's account username (the target account on a listing). */
    accountUsername: string;
    accountPlatform: string;
    campaignName: string;
  } | null;
}

export function RateUserModal({
  open,
  onClose,
  onSuccess,
  submissionId,
  ratedDisplay,
}: RateUserModalProps) {
  const [score, setScore] = useState<number>(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setScore(0);
      setNote("");
      setSubmitting(false);
    }
  }, [open]);

  const noteTrim = note.trim();
  const scoreValid = Number.isInteger(score) && score >= 1 && score <= 5;
  const noteValid = noteTrim.length <= MAX_NOTE;
  const canSubmit = !submitting && scoreValid && noteValid && submissionId.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/submissions/${submissionId}/rate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          score,
          note: noteTrim.length > 0 ? noteTrim : undefined,
        }),
      });
      if (res.status === 201) {
        toast.success("Rating submitted.");
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
        toast.error(serverError ?? "Could not submit rating. Check the form and try again.");
      } else if (res.status === 403) {
        toast.error(serverError ?? "Not authorized to rate this submission.");
      } else if (res.status === 404) {
        toast.error(serverError ?? "Submission not found.");
      } else if (res.status === 409) {
        toast.error(serverError ?? "You have already rated this submission.");
      } else if (res.status === 429) {
        toast.error("Too many requests. Wait a bit and try again.");
      } else {
        toast.error(serverError ?? "Could not submit rating. Please try again.");
      }
      setSubmitting(false);
    } catch {
      toast.error("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const title =
    ratedDisplay?.role === "poster" ? "Rate the poster" : "Rate the creator";

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {ratedDisplay ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Rating
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              <span className="font-semibold">@{ratedDisplay.username}</span>
              <span className="text-[var(--text-muted)]"> ({ratedDisplay.role})</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              For clip on @{ratedDisplay.accountUsername}
              {ratedDisplay.accountPlatform ? (
                <span className="text-[var(--text-muted)]"> ({ratedDisplay.accountPlatform})</span>
              ) : null}
              {" · "}
              {ratedDisplay.campaignName}
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Your rating *
          </p>
          <StarRating
            value={score}
            interactive
            size="lg"
            onChange={(n) => setScore(n)}
            ariaLabel="Choose rating from 1 to 5 stars"
          />
          {score === 0 ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Select 1 to 5 stars.
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {score} {score === 1 ? "star" : "stars"} selected.
            </p>
          )}
        </div>

        <Textarea
          id="mkt-rate-note"
          label="Comment (optional)"
          placeholder="Share what went well or what could be better. Visible publicly."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE}
          rows={4}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {noteTrim.length}/{MAX_NOTE} · Comments are public — they help other users
          decide who to work with.
        </p>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 pb-1 pt-3">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
            >
              Submit rating
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
