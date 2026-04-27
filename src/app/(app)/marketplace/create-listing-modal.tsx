"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

const MAX_NICHE = 100;
const MAX_AUDIENCE = 2000;
const MAX_COUNTRY = 100;
const MAX_TIMEZONE = 100;
const MAX_FOLLOWERS = 1_000_000_000;

interface CampaignOption {
  id: string;
  name: string;
}
interface ClipAccountOption {
  id: string;
  username: string;
  platform: string;
}

interface CreateListingModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  campaigns: CampaignOption[];
  clipAccounts: ClipAccountOption[];
  accountCampaignAccess: Record<string, string[]>;
}

interface FormState {
  campaignId: string;
  clipAccountId: string;
  niche: string;
  audienceDescription: string;
  followerCount: string;
  dailySlotCount: string;
  country: string;
  timezone: string;
}

const EMPTY_FORM: FormState = {
  campaignId: "",
  clipAccountId: "",
  niche: "",
  audienceDescription: "",
  followerCount: "",
  dailySlotCount: "5",
  country: "",
  timezone: "",
};

export function CreateListingModal({
  open,
  onClose,
  onSuccess,
  campaigns,
  clipAccounts,
  accountCampaignAccess,
}: CreateListingModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Reset form whenever the modal is opened. Avoids stale state on re-open.
  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // When campaign changes, clear the account if it is no longer valid for the new campaign.
  function changeCampaign(campaignId: string) {
    setForm((prev) => {
      const stillValid =
        prev.clipAccountId &&
        (accountCampaignAccess[prev.clipAccountId] ?? []).includes(campaignId);
      return {
        ...prev,
        campaignId,
        clipAccountId: stillValid ? prev.clipAccountId : "",
      };
    });
  }

  // Client-side validation mirrors server caps (rate limit + 400s) so users
  // don't bounce off the API for trivially fixable issues.
  function getValidationError(): string | null {
    if (!form.campaignId) return "Campaign is required.";
    if (!form.clipAccountId) return "Clip account is required.";
    const niche = form.niche.trim();
    if (niche.length === 0) return "Niche is required.";
    if (niche.length > MAX_NICHE) return `Niche must be ${MAX_NICHE} characters or fewer.`;
    const audience = form.audienceDescription.trim();
    if (audience.length === 0) return "Audience description is required.";
    if (audience.length > MAX_AUDIENCE) return `Audience description must be ${MAX_AUDIENCE} characters or fewer.`;
    const fc = Number(form.followerCount);
    if (!Number.isInteger(fc) || fc < 0 || fc > MAX_FOLLOWERS) {
      return "Follower count must be a whole number between 0 and 1,000,000,000.";
    }
    const slot = Number(form.dailySlotCount);
    if (!Number.isInteger(slot) || slot < 1 || slot > 10) {
      return "Daily slot count must be between 1 and 10.";
    }
    if (form.country && form.country.length > MAX_COUNTRY) return `Country must be ${MAX_COUNTRY} characters or fewer.`;
    if (form.timezone && form.timezone.length > MAX_TIMEZONE) return `Timezone must be ${MAX_TIMEZONE} characters or fewer.`;
    return null;
  }

  const validationError = getValidationError();
  const canSubmit = !submitting && !validationError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/marketplace/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: form.campaignId,
          clipAccountId: form.clipAccountId,
          niche: form.niche.trim(),
          audienceDescription: form.audienceDescription.trim(),
          followerCount: Number(form.followerCount),
          dailySlotCount: Number(form.dailySlotCount),
          country: form.country.trim() || null,
          timezone: form.timezone.trim() || null,
        }),
      });
      if (res.ok) {
        toast.success("Listing created. Awaiting owner approval.");
        onSuccess();
        return;
      }
      // Friendly mapping for known status codes.
      if (res.status === 409) {
        toast.error("You already have a listing for this account on this campaign.");
        return;
      }
      if (res.status === 429) {
        toast.error("Too many requests, wait a bit.");
        return;
      }
      let serverError = "Could not create listing. Please try again.";
      try {
        const data = await res.json();
        if (data?.error && typeof data.error === "string") serverError = data.error;
      } catch {
        // ignore JSON parse errors — fall back to default message
      }
      toast.error(serverError);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name }));

  // Native select styling lifted from src/components/ui/select.tsx so the
  // cascading account dropdown is visually identical to the shared Select.
  // We need <option disabled> per-option, which the shared component does not
  // support — keeping the override scoped to this file avoids touching shared UI.
  const nativeSelectClass =
    "w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm transition-theme focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none cursor-pointer appearance-none disabled:cursor-not-allowed disabled:opacity-50";

  const accountDisabled = !form.campaignId;
  const allowedIds = form.campaignId
    ? new Set(
        clipAccounts
          .map((a) => a.id)
          .filter((id) => (accountCampaignAccess[id] ?? []).includes(form.campaignId)),
      )
    : new Set<string>();

  return (
    <Modal open={open} onClose={onClose} title="Create marketplace listing">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          id="mkt-campaign"
          label="Campaign *"
          placeholder="Choose a campaign"
          value={form.campaignId}
          onChange={(e) => changeCampaign(e.target.value)}
          options={campaignOptions}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="mkt-account"
            className="block text-sm font-medium text-[var(--text-secondary)]"
          >
            Clip account *
          </label>
          <select
            id="mkt-account"
            className={nativeSelectClass}
            value={form.clipAccountId}
            onChange={(e) => update("clipAccountId", e.target.value)}
            disabled={accountDisabled}
          >
            <option value="">Choose an account</option>
            {clipAccounts.map((a) => {
              const allowed = allowedIds.has(a.id);
              const label = allowed
                ? `@${a.username} (${a.platform})`
                : `@${a.username} (${a.platform}) — Not approved for this campaign`;
              return (
                <option key={a.id} value={a.id} disabled={!allowed}>
                  {label}
                </option>
              );
            })}
          </select>
          {accountDisabled ? (
            <p className="text-xs text-[var(--text-muted)]">Pick a campaign first.</p>
          ) : null}
        </div>

        <Input
          id="mkt-niche"
          label="Niche *"
          placeholder="e.g. gaming, beauty, finance"
          value={form.niche}
          onChange={(e) => update("niche", e.target.value)}
          maxLength={MAX_NICHE}
        />

        <Textarea
          id="mkt-audience"
          label="Audience description *"
          placeholder="Who watches your content? Demographics, geography, percentages..."
          value={form.audienceDescription}
          onChange={(e) => update("audienceDescription", e.target.value)}
          maxLength={MAX_AUDIENCE}
          rows={4}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="mkt-followers"
            label="Follower count *"
            type="number"
            min={0}
            max={MAX_FOLLOWERS}
            step={1}
            placeholder="e.g. 50000"
            value={form.followerCount}
            onChange={(e) => update("followerCount", e.target.value)}
          />
          <Input
            id="mkt-slots"
            label="Daily slot count (1-10) *"
            type="number"
            min={1}
            max={10}
            step={1}
            value={form.dailySlotCount}
            onChange={(e) => update("dailySlotCount", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="mkt-country"
            label="Country (optional)"
            placeholder="e.g. United States"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            maxLength={MAX_COUNTRY}
          />
          <Input
            id="mkt-timezone"
            label="Timezone (optional)"
            placeholder="e.g. America/New_York"
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            maxLength={MAX_TIMEZONE}
          />
        </div>

        {validationError ? (
          <p className="text-xs text-[var(--text-muted)]">{validationError}</p>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!canSubmit}>
            Create listing
          </Button>
        </div>
      </form>
    </Modal>
  );
}
