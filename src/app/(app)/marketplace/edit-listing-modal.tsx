"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const MAX_NICHE = 100;
const MAX_AUDIENCE = 2000;
const MAX_COUNTRY = 100;
const MAX_TIMEZONE = 100;

// Phase 3b-3 — edit modal for an EXISTING listing. Only the cosmetic fields
// the PATCH endpoint accepts are exposed; campaignId/clipAccountId are
// immutable post-create and shown read-only as context. Diff-only PATCH
// body keeps the audit log's fieldsChanged clean — only fields the poster
// actually touched are sent.

interface ListingForEdit {
  id: string;
  niche: string | null;
  audienceDescription: string;
  dailySlotCount: number;
  country: string | null;
  timezone: string | null;
  // Read-only context for the modal header. Optional — modal degrades
  // gracefully without it.
  clipAccountUsername?: string;
  clipAccountPlatform?: string;
  campaignName?: string;
}

interface EditListingModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  listing: ListingForEdit | null;
}

interface FormState {
  niche: string;
  audienceDescription: string;
  dailySlotCount: string;
  country: string;
  timezone: string;
}

function listingToForm(l: ListingForEdit | null): FormState {
  if (!l) {
    return {
      niche: "",
      audienceDescription: "",
      dailySlotCount: "5",
      country: "",
      timezone: "",
    };
  }
  return {
    niche: l.niche ?? "",
    audienceDescription: l.audienceDescription ?? "",
    dailySlotCount: String(l.dailySlotCount ?? 5),
    country: l.country ?? "",
    timezone: l.timezone ?? "",
  };
}

export function EditListingModal({
  open,
  onClose,
  onSuccess,
  listing,
}: EditListingModalProps) {
  const [form, setForm] = useState<FormState>(() => listingToForm(listing));
  const [submitting, setSubmitting] = useState(false);

  // Re-seed form when the modal opens with a new listing. Mirrors the
  // create modal's reset-on-open pattern, but uses the listing values
  // instead of an empty form.
  useEffect(() => {
    if (open) {
      setForm(listingToForm(listing));
      setSubmitting(false);
    }
  }, [open, listing]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getValidationError(): string | null {
    const niche = form.niche.trim();
    if (niche.length > MAX_NICHE) return `Niche must be ${MAX_NICHE} characters or fewer.`;
    const audience = form.audienceDescription.trim();
    if (audience.length === 0) return "Audience description is required.";
    if (audience.length > MAX_AUDIENCE) return `Audience description must be ${MAX_AUDIENCE} characters or fewer.`;
    const slot = Number(form.dailySlotCount);
    if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
      return "Daily slot count must be between 1 and 10.";
    }
    if (form.country && form.country.length > MAX_COUNTRY) return `Country must be ${MAX_COUNTRY} characters or fewer.`;
    if (form.timezone && form.timezone.length > MAX_TIMEZONE) return `Timezone must be ${MAX_TIMEZONE} characters or fewer.`;
    return null;
  }

  // Phase 3b-3 — diff against the original listing. PATCH body only
  // includes fields whose trimmed/cast value actually changed. This keeps
  // the audit log's fieldsChanged accurate and avoids triggering a no-op
  // 400 from the server's "No editable fields provided." gate.
  const diff = useMemo(() => {
    if (!listing) return {} as Record<string, any>;
    const out: Record<string, any> = {};
    const niche = form.niche.trim();
    if (niche !== (listing.niche ?? "")) {
      // niche has no nullable handling on PATCH — must be a non-empty
      // string when provided. If the user clears it, just don't send it.
      if (niche.length > 0) out.niche = niche;
    }
    const audience = form.audienceDescription.trim();
    if (audience !== (listing.audienceDescription ?? "")) {
      out.audienceDescription = audience;
    }
    const slot = Number(form.dailySlotCount);
    if (Number.isInteger(slot) && slot !== listing.dailySlotCount) {
      out.dailySlotCount = slot;
    }
    const country = form.country.trim();
    if (country !== (listing.country ?? "")) {
      out.country = country.length > 0 ? country : null;
    }
    const timezone = form.timezone.trim();
    if (timezone !== (listing.timezone ?? "")) {
      out.timezone = timezone.length > 0 ? timezone : null;
    }
    return out;
  }, [form, listing]);

  const validationError = getValidationError();
  const hasChanges = Object.keys(diff).length > 0;
  const canSubmit = !submitting && !validationError && hasChanges && !!listing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !listing) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(diff),
      });
      if (res.ok) {
        toast.success("Listing updated.");
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
        toast.error(serverError ?? "Could not update listing. Check the form and try again.");
      } else if (res.status === 403) {
        toast.error(serverError ?? "Not authorized to edit this listing.");
      } else if (res.status === 404) {
        toast.error(serverError ?? "Listing not found.");
      } else if (res.status === 429) {
        toast.error("Too many requests. Wait a bit and try again.");
      } else {
        toast.error(serverError ?? "Could not update listing. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const acctUsername = listing?.clipAccountUsername ?? "";
  const acctPlatform = listing?.clipAccountPlatform ?? "";
  const campaignName = listing?.campaignName ?? "";

  return (
    <Modal open={open} onClose={onClose} title="Edit listing">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Read-only context — campaign + clipAccount are immutable. */}
        {acctUsername || campaignName ? (
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-page)] p-3">
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              Editing
            </p>
            <p className="mt-1 text-sm text-[var(--text-primary)]">
              {acctUsername ? (
                <>
                  <span className="font-semibold">@{acctUsername}</span>
                  {acctPlatform ? (
                    <span className="text-[var(--text-muted)]"> ({acctPlatform})</span>
                  ) : null}
                </>
              ) : null}
            </p>
            {campaignName ? (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {campaignName}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              Campaign and account can&apos;t be changed after approval.
            </p>
          </div>
        ) : null}

        <Input
          id="mkt-edit-niche"
          label="Niche (optional)"
          placeholder="e.g. fitness motivation"
          value={form.niche}
          onChange={(e) => update("niche", e.target.value)}
          maxLength={MAX_NICHE}
        />

        <Textarea
          id="mkt-edit-audience"
          label="Audience description *"
          placeholder="Who watches your content? Demographics, geography, percentages..."
          value={form.audienceDescription}
          onChange={(e) => update("audienceDescription", e.target.value)}
          maxLength={MAX_AUDIENCE}
          rows={4}
        />

        <Input
          id="mkt-edit-slots"
          label="Daily slot count (1-10) *"
          type="number"
          min={1}
          max={10}
          step={1}
          value={form.dailySlotCount}
          onChange={(e) => update("dailySlotCount", e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="mkt-edit-country"
            label="Country (optional)"
            placeholder="e.g. United States"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            maxLength={MAX_COUNTRY}
          />
          <Input
            id="mkt-edit-timezone"
            label="Timezone (optional)"
            placeholder="e.g. America/New_York"
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            maxLength={MAX_TIMEZONE}
          />
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-[var(--border-color)] bg-[var(--bg-card)] px-6 pb-1 pt-3">
          {validationError ? (
            <p className="mb-2 text-xs text-[var(--text-muted)]">{validationError}</p>
          ) : !hasChanges ? (
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              No changes yet — edit a field to enable Save.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={!canSubmit}>
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
