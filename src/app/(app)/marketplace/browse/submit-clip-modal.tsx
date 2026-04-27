"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const MAX_NOTES = 2000;

const PLATFORM_OPTIONS = [
  { value: "TIKTOK", label: "TikTok" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "YOUTUBE", label: "YouTube" },
] as const;

interface ListingDisplay {
  posterUsername: string;
  accountUsername: string;
  accountPlatform: string;
  campaignName: string;
}

interface SubmitClipModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  listingId: string;
  listingDisplay: ListingDisplay | null;
}

interface FormState {
  driveUrl: string;
  platforms: string[];
  notes: string;
}

const EMPTY_FORM: FormState = {
  driveUrl: "",
  platforms: [],
  notes: "",
};

// Mirrors server-side validation in src/app/api/marketplace/submissions/route.ts.
function isValidDriveUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "drive.google.com" ||
      host.endsWith(".drive.google.com") ||
      host === "docs.google.com" ||
      host.endsWith(".docs.google.com")
    );
  } catch {
    return false;
  }
}

export function SubmitClipModal({
  open,
  onClose,
  onSuccess,
  listingId,
  listingDisplay,
}: SubmitClipModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Reset form on open. Avoids stale state on re-open after a previous submit.
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(value: string) {
    setForm((prev) => {
      const has = prev.platforms.includes(value);
      return {
        ...prev,
        platforms: has ? prev.platforms.filter((p) => p !== value) : [...prev.platforms, value],
      };
    });
  }

  function getValidationError(): string | null {
    const url = form.driveUrl.trim();
    if (url.length === 0) return "Drive URL is required.";
    if (!isValidDriveUrl(url)) return "Drive URL must be a valid Google Drive or Docs link.";
    if (form.platforms.length === 0) return "Pick at least one platform.";
    if (form.notes.length > MAX_NOTES) return `Notes must be ${MAX_NOTES} characters or fewer.`;
    return null;
  }

  const validationError = getValidationError();
  const canSubmit = !submitting && !validationError && listingId.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/marketplace/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId,
          driveUrl: form.driveUrl.trim(),
          platforms: form.platforms,
          notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
        }),
      });
      if (res.status === 201) {
        toast.success("Clip submitted. Awaiting review.");
        onSuccess();
        return;
      }
      if (res.status === 409) {
        toast.error("You already have a pending submission with this Drive link.");
        return;
      }
      if (res.status === 429) {
        toast.error("Too many requests, wait a bit.");
        return;
      }
      let serverError = "Could not submit clip. Please try again.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") serverError = data.error;
      } catch {
        // ignore
      }
      toast.error(serverError);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit a clip">
      <form onSubmit={handleSubmit} className="space-y-4">
        {listingDisplay ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Submitting to
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
          </div>
        ) : null}

        <Input
          id="mkt-submit-drive"
          label="Google Drive URL *"
          placeholder="https://drive.google.com/file/d/..."
          value={form.driveUrl}
          onChange={(e) => update("driveUrl", e.target.value)}
        />

        <div className="space-y-1.5">
          <p className="block text-sm font-medium text-[var(--text-secondary)]">
            Platforms *
          </p>
          <div className="flex flex-wrap gap-3">
            {PLATFORM_OPTIONS.map((opt) => {
              const checked = form.platforms.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] transition-theme hover:bg-[var(--bg-card-hover)]"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[var(--border-color)] accent-accent"
                    checked={checked}
                    onChange={() => togglePlatform(opt.value)}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>

        <Textarea
          id="mkt-submit-notes"
          label="Notes (optional)"
          placeholder="Anything the poster should know about this clip"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          maxLength={MAX_NOTES}
          rows={3}
        />
        <p className="text-xs text-[var(--text-muted)]">
          {form.notes.length}/{MAX_NOTES}
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
              Submit clip
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
