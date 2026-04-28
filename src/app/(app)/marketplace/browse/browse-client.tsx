"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Compass, Star, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { SubmitClipModal } from "./submit-clip-modal";

interface SubmitTarget {
  id: string;
  posterUsername: string;
  accountUsername: string;
  accountPlatform: string;
  campaignName: string;
}

interface BrowseClientProps {
  campaigns: { id: string; name: string }[];
  currentUserId: string;
}

export function BrowseClient({ campaigns, currentUserId: _currentUserId }: BrowseClientProps) {
  const [campaignFilter, setCampaignFilter] = useState<string>("");

  const [listings, setListings] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<SubmitTarget | null>(null);

  // Track the latest fetch so out-of-order responses don't clobber state.
  const fetchSeqRef = useRef(0);

  function buildUrl(cursor?: string | null): string {
    const params = new URLSearchParams();
    if (campaignFilter) params.set("campaignId", campaignFilter);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    params.set("_t", String(Date.now()));
    return `/api/marketplace/browse?${params.toString()}`;
  }

  async function load() {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { cache: "no-store" });
      if (seq !== fetchSeqRef.current) return; // stale response
      if (!res.ok) {
        toast.error("Could not load listings.");
        setListings([]);
        setNextCursor(null);
        return;
      }
      const data = await res.json();
      if (seq !== fetchSeqRef.current) return;
      setListings(Array.isArray(data?.listings) ? data.listings : []);
      setNextCursor(data?.nextCursor ?? null);
    } catch {
      if (seq !== fetchSeqRef.current) return;
      toast.error("Network error loading listings.");
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
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

  // Refetch on filter change.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignFilter]);

  const filtersActive = campaignFilter !== "";

  function clearFilters() {
    setCampaignFilter("");
  }

  function onSubmitClip(listing: any) {
    setSubmitTarget({
      id: listing.id,
      posterUsername: listing.user?.username ?? "(unknown)",
      accountUsername: listing.clipAccount?.username ?? "(unknown)",
      accountPlatform: listing.clipAccount?.platform ?? "",
      campaignName: listing.campaign?.name ?? "(unknown campaign)",
    });
  }

  const campaignOptions = campaigns.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <Compass className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Browse Marketplace</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Find a poster for your clip.</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <Select
            id="browse-campaign"
            placeholder="All campaigns"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            options={campaignOptions}
          />
        </div>
        {filtersActive ? (
          <Button
            variant="secondary"
            onClick={clearFilters}
            icon={<X className="h-4 w-4" />}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {/* Body */}
      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">Loading listings...</p>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Compass className="h-10 w-10 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)]">No active listings match your filters.</p>
          {filtersActive ? (
            <Button variant="secondary" onClick={clearFilters}>
              Reset filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <BrowseListingCard key={l.id} listing={l} onSubmit={() => onSubmitClip(l)} />
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

      <SubmitClipModal
        open={!!submitTarget}
        onClose={() => setSubmitTarget(null)}
        onSuccess={() => setSubmitTarget(null)}
        listingId={submitTarget?.id ?? ""}
        listingDisplay={
          submitTarget
            ? {
                posterUsername: submitTarget.posterUsername,
                accountUsername: submitTarget.accountUsername,
                accountPlatform: submitTarget.accountPlatform,
                campaignName: submitTarget.campaignName,
              }
            : null
        }
      />
    </div>
  );
}

function BrowseListingCard({
  listing,
  onSubmit,
}: {
  listing: any;
  onSubmit: () => void;
}) {
  // Privacy: poster object is { username } + cached rep only — never email/
  // role/id. Phase 7a widened the user select to include the as-poster
  // rating fields, which are public-by-design (Q6).
  const posterUsername: string = listing.user?.username ?? "(unknown)";
  // Phase 7a — poster's as-poster rep, surfaced under "Posted by".
  const posterAvg: number | null = listing.user?.marketplaceAvgAsPoster ?? null;
  const posterCount: number = listing.user?.marketplaceCountAsPoster ?? 0;
  const acctUsername: string = listing.clipAccount?.username ?? "(unknown)";
  const acctPlatform: string = listing.clipAccount?.platform ?? "";
  const profileLink: string | null = listing.clipAccount?.profileLink ?? null;
  const campaignName: string = listing.campaign?.name ?? "(unknown campaign)";

  const niche: string = listing.niche ?? "";
  const audience: string = listing.audienceDescription ?? "";
  const slots: number = listing.dailySlotCount ?? 0;
  // Phase: virtual usedToday from /api/marketplace/browse GET. Drives the
  // "X / Y today" scarcity copy below.
  const usedToday: number = listing.usedToday ?? 0;
  const totalSubmissions: number = listing.totalSubmissions ?? 0;
  const totalApproved: number = listing.totalApproved ?? 0;
  const totalPosted: number = listing.totalPosted ?? 0;
  const averageRating: number | null = listing.averageRating ?? null;
  // Phase 7a — count paired with averageRating for "★ 4.7 (12)" display.
  const ratingCount: number = listing.ratingCount ?? 0;
  const country: string | null = listing.country ?? null;
  const timezone: string | null = listing.timezone ?? null;

  return (
    <Card>
      {/* Poster row */}
      <p className="mb-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        <span>
          Posted by{" "}
          <span className="text-[var(--text-secondary)] normal-case tracking-normal">
            @{posterUsername}
          </span>
        </span>
        {/* Phase 7a — poster rep badge. Hidden when count === 0 (Q13). */}
        {posterCount > 0 && posterAvg !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-page)] px-2 py-0.5 text-[10px] normal-case tracking-normal text-[var(--text-secondary)]">
            <Star className="h-2.5 w-2.5 fill-current text-accent" />
            <span>
              {posterAvg.toFixed(1)} ({posterCount})
            </span>
          </span>
        ) : null}
      </p>

      {/* Account header */}
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
        {/* Phase 7a — listing-level rep badge, paired with ratingCount.
            Hidden when count === 0 (Q13) to avoid showing avg=null. */}
        {ratingCount > 0 && averageRating !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-page)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            <Star className="h-3 w-3 fill-current text-accent" />
            {averageRating.toFixed(1)} ({ratingCount})
          </span>
        ) : null}
      </div>

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

      {/* Campaign */}
      <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Campaign
      </p>
      <div className="mb-3">
        <Badge variant="active">{campaignName}</Badge>
      </div>

      {/* Niche */}
      {niche ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Niche
          </p>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">{niche}</p>
        </>
      ) : null}

      {/* Audience (2-line clamp) */}
      {audience ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
            Audience
          </p>
          <p
            className="mb-3 text-sm text-[var(--text-secondary)]"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {audience}
          </p>
        </>
      ) : null}

      {/* Stats footer */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-page)] p-2 text-center">
        <Stat label="Submitted" value={totalSubmissions} />
        <Stat label="Approved" value={totalApproved} />
        <Stat label="Posted" value={totalPosted} />
      </div>

      {/* Daily slots — Phase: "X / Y today" surfaces scarcity. When usedToday
          equals slots, no submissions accepted today (server enforces). */}
      <p className="mb-1 text-sm text-[var(--text-secondary)]">
        <span className="font-bold text-accent">{usedToday}</span>
        <span className="text-[var(--text-muted)]"> / {slots} today</span>
      </p>

      {/* Country/timezone */}
      {country || timezone ? (
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          {country ?? ""}
          {country && timezone ? " · " : ""}
          {timezone ?? ""}
        </p>
      ) : (
        <div className="mb-3" />
      )}

      <Button onClick={onSubmit} size="sm">
        Submit a clip
      </Button>
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
