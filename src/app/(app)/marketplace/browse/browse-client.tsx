"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Compass, Search, Star, X } from "lucide-react";
import { toast } from "@/lib/toast";

interface BrowseClientProps {
  campaigns: { id: string; name: string }[];
  currentUserId: string;
}

const SEARCH_DEBOUNCE_MS = 300;

export function BrowseClient({ campaigns, currentUserId: _currentUserId }: BrowseClientProps) {
  const [campaignFilter, setCampaignFilter] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const [listings, setListings] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce search input → debouncedSearch (which actually triggers fetch).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Track the latest fetch so out-of-order responses don't clobber state.
  const fetchSeqRef = useRef(0);

  function buildUrl(cursor?: string | null): string {
    const params = new URLSearchParams();
    if (campaignFilter) params.set("campaignId", campaignFilter);
    if (debouncedSearch) params.set("search", debouncedSearch);
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

  // Refetch on filter change (campaign + debounced search).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignFilter, debouncedSearch]);

  const filtersActive = campaignFilter !== "" || debouncedSearch !== "";

  function clearFilters() {
    setCampaignFilter("");
    setSearchInput("");
    setDebouncedSearch("");
  }

  function onSubmitClip() {
    toast.info("Coming in next phase.");
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
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <Select
          id="browse-campaign"
          placeholder="All campaigns"
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          options={campaignOptions}
        />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            id="browse-search"
            placeholder="Search by account username"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
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
        ) : (
          <div />
        )}
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
            <BrowseListingCard key={l.id} listing={l} onSubmit={onSubmitClip} />
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
  // Privacy: poster object is { username } only — never render anything else
  // (no email, no role, no id) even if a future API change leaks them.
  const posterUsername: string = listing.user?.username ?? "(unknown)";
  const acctUsername: string = listing.clipAccount?.username ?? "(unknown)";
  const acctPlatform: string = listing.clipAccount?.platform ?? "";
  const profileLink: string | null = listing.clipAccount?.profileLink ?? null;
  const campaignName: string = listing.campaign?.name ?? "(unknown campaign)";

  const niche: string = listing.niche ?? "";
  const audience: string = listing.audienceDescription ?? "";
  const slots: number = listing.dailySlotCount ?? 0;
  const totalSubmissions: number = listing.totalSubmissions ?? 0;
  const totalApproved: number = listing.totalApproved ?? 0;
  const totalPosted: number = listing.totalPosted ?? 0;
  const averageRating: number | null = listing.averageRating ?? null;
  const country: string | null = listing.country ?? null;
  const timezone: string | null = listing.timezone ?? null;

  return (
    <Card>
      {/* Poster row */}
      <p className="mb-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
        Posted by{" "}
        <span className="text-[var(--text-secondary)] normal-case tracking-normal">
          @{posterUsername}
        </span>
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
        {averageRating !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-page)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
            <Star className="h-3 w-3 text-accent" />
            {averageRating.toFixed(1)}
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

      {/* Daily slots */}
      <p className="mb-1 text-sm text-[var(--text-secondary)]">
        <span className="font-bold text-accent">{slots}</span>
        <span className="text-[var(--text-muted)]"> / 10 daily slots</span>
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
