"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommunityCampaign {
  id: string;
  name: string;
  imageUrl?: string | null;
  platform?: string | null;
  totalUnread?: number;
}

/**
 * Collapsible "Community" section for the sidebar.
 * Self-contained — owns the fetch + Ably refresh listener + open/close state (persisted
 * to localStorage so the user's preferred default survives navigation).
 */
export function CommunitySidebarNav({
  role,
}: {
  role: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCampaignId = searchParams.get("campaignId");
  const onCommunityPage = pathname.startsWith("/community");

  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem("sidebar_community_open");
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch {}
    return false;
  });
  const [campaigns, setCampaigns] = useState<CommunityCampaign[]>([]);
  const fetchingRef = useRef(false);
  // 30s in-memory TTL cache so route changes don't trigger a /api/community/campaigns
  // round-trip every time (this component remounts on every navigation).
  const cacheRef = useRef<{ data: CommunityCampaign[]; time: number } | null>(null);

  // Persist open/close preference.
  useEffect(() => {
    try { localStorage.setItem("sidebar_community_open", open ? "1" : "0"); } catch {}
  }, [open]);

  const load = useCallback(async (opts?: { skipCache?: boolean }) => {
    if (role === "CLIENT") return;
    if (fetchingRef.current) return;
    if (!opts?.skipCache && cacheRef.current && Date.now() - cacheRef.current.time < 30_000) {
      setCampaigns(cacheRef.current.data);
      return;
    }
    fetchingRef.current = true;
    try {
      const res = await fetch("/api/community/campaigns");
      if (!res.ok) {
        // On first load a failure leaves the empty initial state; on later loads
        // the stale cache persists. Either way, we must fall through to the
        // `finally` so fetchingRef doesn't stay stuck at true.
        return;
      }
      const data = await res.json();
      const list: CommunityCampaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
      setCampaigns(list);
      cacheRef.current = { data: list, time: Date.now() };
    } catch {
      // Network/parse error — keep previous campaigns list if we had one.
    } finally {
      fetchingRef.current = false;
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  // Ably: refresh unread totals on channel + ticket activity. Invalidate the cache
  // so the refetch isn't served a stale copy. ticket_message is included because
  // the campaign totalUnread now folds in unread DMs too.
  useEffect(() => {
    const handler = () => { cacheRef.current = null; load({ skipCache: true }); };
    // Optimistic zero when the user scrolls to the bottom of a channel (or
    // opens one). ChannelChat emits `community:channel_read` with campaignId
    // so we can clear just that campaign's badge without waiting for the next
    // /api/community/campaigns round-trip. We still refetch authoritatively
    // to catch ticket unread drift.
    const readHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cid = detail?.campaignId;
      if (cid) {
        setCampaigns((prev) => prev.map((c) => (c.id === cid ? { ...c, totalUnread: 0 } : c)));
      }
      cacheRef.current = null;
      load({ skipCache: true });
    };
    window.addEventListener("sse:channel_message", handler);
    window.addEventListener("sse:channel_message_deleted", handler);
    window.addEventListener("sse:ticket_message", handler);
    window.addEventListener("community:channel_read", readHandler);
    return () => {
      window.removeEventListener("sse:channel_message", handler);
      window.removeEventListener("sse:channel_message_deleted", handler);
      window.removeEventListener("sse:ticket_message", handler);
      window.removeEventListener("community:channel_read", readHandler);
    };
  }, [load]);

  const totalUnread = useMemo(
    () => campaigns.reduce((sum, c) => sum + (c.totalUnread || 0), 0),
    [campaigns],
  );

  if (role === "CLIENT") return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center justify-between w-full rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-150",
          onCommunityPage
            ? "bg-accent/10 text-accent"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]",
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 min-w-0">
          <MessageCircle className="h-[18px] w-[18px]" />
          <span>Community</span>
          {totalUnread > 0 && (
            <span className="h-4 min-w-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[var(--text-muted)] transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-1 ml-3 pl-3 border-l border-[var(--border-subtle)] space-y-0.5">
          {campaigns.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-[var(--text-muted)] italic">
              No campaigns yet.
            </p>
          ) : (
            campaigns.map((c) => {
              const isActive = onCommunityPage && activeCampaignId === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/community?campaignId=${encodeURIComponent(c.id)}`}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-accent/10 text-accent border-l-2 border-accent pl-[calc(0.75rem-2px)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] hover:translate-x-0.5",
                  )}
                >
                  {(() => {
                    // Prefer communityAvatarUrl, fall back to legacy imageUrl.
                    const avatarSrc = (c as any).communityAvatarUrl || c.imageUrl || null;
                    return avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
                        alt=""
                        className="h-6 w-6 lg:h-7 lg:w-7 rounded-md object-cover flex-shrink-0 border border-[var(--border-subtle)]"
                      />
                    ) : (
                      <span className="h-6 w-6 lg:h-7 lg:w-7 rounded-md bg-accent/15 border border-accent/20 flex-shrink-0 text-[10px] font-bold text-accent flex items-center justify-center uppercase">
                        {c.name?.[0] || "?"}
                      </span>
                    );
                  })()}
                  <span className="text-sm lg:text-base truncate flex-1">{c.name}</span>
                  {(c.totalUnread || 0) > 0 && (
                    <span className="h-4 min-w-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums flex-shrink-0">
                      {(c.totalUnread || 0) > 99 ? "99+" : c.totalUnread}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
