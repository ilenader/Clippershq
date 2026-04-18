"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { formatRelative } from "@/lib/utils";

interface Entry {
  id: string;
  campaignId: string;
  userId: string;
  username: string;
  action: "joined" | "left" | string;
  createdAt: string;
}

interface Props {
  campaignId: string;
}

/** OWNER/ADMIN-only timeline of clipper joins and leaves for a campaign. */
export function ActivityFeed({ campaignId }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(30);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    try {
      // +1 trick: request one more than the page size so we know whether there are
      // further entries without doing a separate COUNT query.
      const res = await fetch(`/api/community/activity?campaignId=${encodeURIComponent(campaignId)}&limit=${pageSize + 1}`);
      if (!res.ok) { setEntries([]); setHasMore(false); return; }
      const data = await res.json();
      const all: Entry[] = Array.isArray(data?.activity) ? data.activity : [];
      setHasMore(all.length > pageSize);
      setEntries(all.slice(0, pageSize));
    } catch { setEntries([]); setHasMore(false); }
    setLoading(false);
  }, [campaignId, pageSize]);

  useEffect(() => {
    setLoading(true);
    load();
    // Refresh every 60s — joins/leaves aren't real-time critical.
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Reset to the first page when switching campaigns so the new view starts clean.
  useEffect(() => { setPageSize(30); }, [campaignId]);

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm lg:text-base font-semibold text-[var(--text-primary)]">
          <Users className="h-4 w-4 text-accent" />
          Campaign Activity
        </h3>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 animate-pulse">
              <div className="h-6 w-6 rounded-full bg-[var(--bg-card-hover)]" />
              <div className="flex-1 h-3 rounded bg-[var(--bg-card-hover)]" style={{ maxWidth: `${200 + i * 30}px` }} />
              <div className="h-2.5 w-12 rounded bg-[var(--bg-card-hover)]" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Users className="h-6 w-6 text-accent" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No activity yet</p>
          <p className="text-xs text-[var(--text-muted)]">Joins and leaves will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => {
            const joined = e.action === "joined";
            return (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    joined ? "bg-emerald-500/10" : "bg-red-500/10"
                  }`}
                >
                  {joined
                    ? <UserPlus className="h-3 w-3 text-emerald-400" />
                    : <UserMinus className="h-3 w-3 text-red-400" />}
                </div>
                <p className="text-sm flex-1 min-w-0">
                  <span className="font-medium text-[var(--text-primary)]">{e.username}</span>
                  <span className="text-[var(--text-muted)]"> {joined ? "joined" : "left"} the campaign</span>
                </p>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums flex-shrink-0">
                  {formatRelative(e.createdAt)}
                </span>
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={() => setPageSize((n) => n + 30)}
              className="w-full mt-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card-hover)] text-xs font-medium text-[var(--text-muted)] hover:text-accent hover:border-accent/30 transition-colors"
            >
              Load more activity
            </button>
          )}
        </div>
      )}
    </div>
  );
}
