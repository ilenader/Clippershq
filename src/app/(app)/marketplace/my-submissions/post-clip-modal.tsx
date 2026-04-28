"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const MAX_URL_LEN = 500;

interface ListingDisplay {
  posterUsername: string;
  accountUsername: string;
  accountPlatform: string;
  campaignName: string;
  /** ISO string for post deadline. May be null if missing. */
  postDeadline: string | null;
}

interface PostClipModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  submissionId: string;
  listingDisplay: ListingDisplay | null;
}

interface FormState {
  clipUrl: string;
}

const EMPTY_FORM: FormState = { clipUrl: "" };

// Mirrors server-side validation in /api/marketplace/submissions/[id]/post.
function isValidClipUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Soft client-side platform detection. Mirrors src/lib/apify.ts detectPlatform
// shape but inlined to keep the modal a pure client component (the server
// helper imports apify config). Used only for a soft warning — server makes
// the final call.
function detectPlatformClient(url: string): "TIKTOK" | "INSTAGRAM" | "YOUTUBE" | null {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "TIKTOK";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "INSTAGRAM";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YOUTUBE";
  return null;
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

export function PostClipModal({
  open,
  onClose,
  onSuccess,
  submissionId,
  listingDisplay,
}: PostClipModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open. Avoids stale state on re-open after a previous submit.
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  function getValidationError(): string | null {
    const url = form.clipUrl.trim();
    if (url.length === 0) return "Clip URL is required.";
    if (url.length > MAX_URL_LEN) return `Clip URL must be ${MAX_URL_LEN} characters or fewer.`;
    if (!isValidClipUrl(url)) return "Clip URL must be a valid http(s) link.";
    return null;
  }

  const validationError = getValidationError();
  const canSubmit = !submitting && !validationError && submissionId.length > 0;

  // Soft platform-mismatch warning. Compares detected platform against the
  // listing's clipAccount platform. Server still validates — this is a
  // pre-flight nudge so the user doesn't waste a request.
  const expectedPlatform = (listingDisplay?.accountPlatform ?? "").toUpperCase();
  const detected = form.clipUrl.trim().length > 0 ? detectPlatformClient(form.clipUrl.trim()) : null;
  const platformWarning =
    detected && expectedPlatform && detected !== expectedPlatform
      ? `Heads up — this looks like a ${detected} link, but the listing is for ${expectedPlatform}.`
      : null;

  // Live deadline countdown — recomputes per render, accurate enough for a
  // modal that's open for seconds.
  const deadlineHours = hoursLeftUntil(listingDisplay?.postDeadline ?? null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/submissions/${submissionId}/post`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clipUrl: form.clipUrl.trim() }),
      });
      if (res.status === 201) {
        toast.success("Clip posted! Tracking begins now.");
        onSuccess();
        return;
      }
      // Try to parse server error message — falls through to status-based default.
      let serverError: string | null = null;
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") serverError = data.error;
      } catch {
        // ignore parse errors
      }
      if (res.status === 400) {
        toast.error(serverError ?? "Could not post clip. Check the URL and try again.");
        return;
      }
      if (res.status === 403) {
        toast.error(serverError ?? "Only the poster can mark this as posted.");
        return;
      }
      if (res.status === 404) {
        toast.error(serverError ?? "Submission not found.");
        return;
      }
      if (res.status === 409) {
        toast.error(serverError ?? "This clip URL has already been submitted to this campaign.");
        return;
      }
      if (res.status === 429) {
        toast.error("Too many requests. Wait a bit and try again.");
        return;
      }
      // 500 / unexpected
      toast.error(serverError ?? "Could not post clip. Please try again.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mark as posted">
      <form onSubmit={handleSubmit} className="space-y-4">
        {listingDisplay ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Posting to
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              <span className="font-semibold">@{listingDisplay.accountUsername}</span>
              {listingDisplay.accountPlatform ? (
                <span className="text-[var(--text-muted)]"> ({listingDisplay.accountPlatform})</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Posted by @{listingDisplay.posterUsername} · {listingDisplay.campaignName}
            </p>
            {deadlineHours !== null ? (
              <p className="mt-2 text-[11px] uppercase tracking-widest text-accent">
                Deadline · <span className="font-semibold">{formatHoursLeft(deadlineHours)}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <Input
          id="mkt-post-clip-url"
          label="Live clip URL *"
          placeholder="https://www.tiktok.com/@user/video/..."
          value={form.clipUrl}
          onChange={(e) => setForm({ clipUrl: e.target.value })}
        />
        {platformWarning ? (
          <p className="text-xs text-amber-400">{platformWarning}</p>
        ) : null}
        <p className="text-xs text-[var(--text-muted)]">
          Paste the public link to the live clip you posted on the listing's account. Tracking starts the moment you confirm.
        </p>

        <div className="sticky bottom-0 bg-[var(--bg-card)] pt-3 pb-1 border-t border-[var(--border-color)] -mx-6 px-6 -mb-6">
          {validationError ? (
            <p className="mb-2 text-xs text-[var(--text-muted)]">{validationError}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              Mark as posted
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
