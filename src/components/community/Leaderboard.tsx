"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, RefreshCw, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface Entry {
  userId: string;
  username: string;
  image?: string | null;
  totalViews: number;
  clipCount: number;
  rank: number;
  rankChange: number;
}

interface Props {
  channelId: string;
  viewerId: string;
}

export function Leaderboard({ channelId, viewerId }: Props) {
  const [top, setTop] = useState<Entry[]>([]);
  const [me, setMe] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/channels/${channelId}/leaderboard`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTop(Array.isArray(data.top) ? data.top : []);
      setMe(data.me || null);
      setRefreshedAt(new Date());
    } catch {}
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    setLoading(true);
    load();
    // Only refresh when the tab is visible — background tabs don't need a fresh
    // leaderboard every minute.
    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        load();
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const myInTop = me ? top.some((t) => t.userId === me.userId) : false;

  return (
    <div className="p-3 sm:p-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm lg:text-base font-semibold text-[var(--text-primary)]">
          <Trophy className="h-4 w-4 text-accent" />
          Campaign Leaderboard
        </h3>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-accent transition-colors p-1.5 rounded-lg hover:bg-[var(--bg-card-hover)]"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)] animate-pulse">
              <div className="h-9 w-9 rounded-lg bg-[var(--bg-input)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 rounded bg-[var(--bg-input)]" />
                <div className="h-2.5 w-20 rounded bg-[var(--bg-input)]" />
              </div>
              <div className="h-4 w-12 rounded bg-[var(--bg-input)]" />
            </div>
          ))}
        </div>
      ) : top.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <Trophy className="h-6 w-6 text-accent" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No clips submitted yet</p>
          <p className="text-xs text-[var(--text-muted)]">Be the first to get on the board.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((entry, i) => (
            <Row key={entry.userId} entry={entry} isMe={entry.userId === viewerId} />
          ))}
          {me && !myInTop && (
            <>
              <div className="flex items-center justify-center py-1">
                <span className="text-xs text-[var(--text-muted)] tracking-widest">· · ·</span>
              </div>
              <Row entry={me} isMe />
            </>
          )}
        </div>
      )}

      {refreshedAt && (
        <p className="text-[10px] text-[var(--text-muted)] text-center mt-4 tabular-nums">
          Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <span className="mx-1.5">·</span>
          Auto-refresh every 60s
        </p>
      )}
    </div>
  );
}

function Row({ entry, isMe }: { entry: Entry; isMe: boolean }) {
  const rankStyle =
    entry.rank === 1
      ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20"
      : entry.rank === 2
      ? "bg-zinc-400/15 text-zinc-300 border border-zinc-400/20"
      : entry.rank === 3
      ? "bg-amber-600/15 text-amber-500 border border-amber-600/20"
      : "bg-[var(--bg-input)] text-[var(--text-muted)]";

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        isMe
          ? "border border-accent/30 bg-accent/5"
          : "border border-[var(--border-color)] bg-[var(--bg-card-hover)] hover:bg-[var(--bg-card)]"
      }`}
    >
      <div className={`flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm tabular-nums ${rankStyle}`}>
        #{entry.rank}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm lg:text-lg font-medium truncate ${isMe ? "text-accent" : "text-[var(--text-primary)]"}`}>
          {isMe ? "You" : entry.username}
        </p>
        <p className="text-xs lg:text-sm text-[var(--text-muted)]">
          {entry.clipCount} clip{entry.clipCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm lg:text-lg font-bold text-accent tabular-nums">
          {formatNumber(entry.totalViews)}
        </p>
        {entry.rankChange > 0 && (
          <p className="flex items-center justify-end gap-0.5 text-[10px] text-emerald-400 tabular-nums">
            <ArrowUp className="h-3 w-3" />
            {entry.rankChange}
          </p>
        )}
        {entry.rankChange < 0 && (
          <p className="flex items-center justify-end gap-0.5 text-[10px] text-red-400 tabular-nums">
            <ArrowDown className="h-3 w-3" />
            {Math.abs(entry.rankChange)}
          </p>
        )}
      </div>
    </div>
  );
}
