"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ShoppingBag, Plus, Pause, Play, Pencil, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { CreateListingModal } from "./create-listing-modal";

interface MarketplaceClientProps {
  listings: any[];
  currentUser: { id: string; role: string };
  hiddenMode: boolean;
  campaigns: { id: string; name: string }[];
  clipAccounts: { id: string; username: string; platform: string }[];
  accountCampaignAccess: Record<string, string[]>;
}

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

function comingSoon() {
  toast.info("Coming in next phase.");
}

export function MarketplaceClient({
  listings,
  currentUser,
  hiddenMode,
  campaigns,
  clipAccounts,
  accountCampaignAccess,
}: MarketplaceClientProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  function openCreate() {
    setCreateOpen(true);
  }

  function handleCreateSuccess() {
    setCreateOpen(false);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ShoppingBag className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {hiddenMode ? "Marketplace (Owner Preview)" : "Marketplace"}
            </h1>
            {hiddenMode ? (
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Hidden from clippers — visible only to OWNER until launch.
              </p>
            ) : null}
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              List your verified accounts to receive clip submissions from creators.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
          Create new listing
        </Button>
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-10 w-10" />}
          title="You haven't listed any accounts yet"
          description="Create your first listing to get started."
          action={
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              Create new listing
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}

      <CreateListingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreateSuccess}
        campaigns={campaigns}
        clipAccounts={clipAccounts}
        accountCampaignAccess={accountCampaignAccess}
        role={currentUser.role}
      />
    </div>
  );
}

function ListingCard({ listing }: { listing: any }) {
  const status: string = listing.status;
  const badge = STATUS_BADGE[status] ?? { variant: "archived" as StatusVariant, label: status };
  const muted = status === "DELETED" || status === "BANNED";

  const username: string = listing.clipAccount?.username ?? "(unknown)";
  const platform: string = listing.clipAccount?.platform ?? "";
  const campaignName: string = listing.campaign?.name ?? "(unknown campaign)";
  const niche: string = listing.niche ?? "";
  const slotCount: number = listing.dailySlotCount ?? 0;
  const totalSubmissions: number = listing.totalSubmissions ?? 0;
  const totalApproved: number = listing.totalApproved ?? 0;
  const totalPosted: number = listing.totalPosted ?? 0;
  const rejectionReason: string | null = listing.rejectionReason ?? null;

  return (
    <Card className={muted ? "opacity-60" : undefined}>
      {/* Top row: account + status */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
            @{username}
          </p>
          {platform ? (
            <p className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              {platform}
            </p>
          ) : null}
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

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

      {/* Slot count */}
      <p className="mb-3 text-sm text-[var(--text-secondary)]">
        <span className="font-bold text-accent">{slotCount}</span>
        <span className="text-[var(--text-muted)]"> / 10 slots per day</span>
      </p>

      {/* Stats footer */}
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-page)] p-2 text-center">
        <Stat label="Submitted" value={totalSubmissions} />
        <Stat label="Approved" value={totalApproved} />
        <Stat label="Posted" value={totalPosted} />
      </div>

      {/* Rejection reason inline */}
      {status === "REJECTED" && rejectionReason ? (
        <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-[11px] uppercase tracking-widest text-red-400">
            Rejection reason
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{rejectionReason}</p>
        </div>
      ) : null}

      {/* Actions row by status */}
      <Actions status={status} />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function Actions({ status }: { status: string }) {
  if (status === "PENDING_APPROVAL") {
    return (
      <p className="text-xs italic text-[var(--text-muted)]">
        Pending owner review.
      </p>
    );
  }
  if (status === "ACTIVE") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={comingSoon} icon={<Pause className="h-3.5 w-3.5" />}>
          Pause
        </Button>
        <Button variant="secondary" onClick={comingSoon} icon={<Pencil className="h-3.5 w-3.5" />}>
          Edit
        </Button>
        <Button variant="secondary" onClick={comingSoon} icon={<Trash2 className="h-3.5 w-3.5" />}>
          Request delete
        </Button>
      </div>
    );
  }
  if (status === "PAUSED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={comingSoon} icon={<Play className="h-3.5 w-3.5" />}>
          Unpause
        </Button>
        <Button variant="secondary" onClick={comingSoon} icon={<Pencil className="h-3.5 w-3.5" />}>
          Edit
        </Button>
        <Button variant="secondary" onClick={comingSoon} icon={<Trash2 className="h-3.5 w-3.5" />}>
          Request delete
        </Button>
      </div>
    );
  }
  if (status === "REJECTED") {
    return null;
  }
  if (status === "DELETION_REQUESTED") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs italic text-[var(--text-muted)]">
          Awaiting owner approval to delete.
        </p>
        <Button variant="secondary" onClick={comingSoon}>
          Cancel deletion request
        </Button>
      </div>
    );
  }
  // DELETED / BANNED — no actions
  return null;
}
