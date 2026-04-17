"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageBubble, type Message } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { toast } from "@/lib/toast";
import { ArrowDown, Loader2, Megaphone, MessageCircle } from "lucide-react";

function MessageSkeleton() {
  return (
    <div className="py-2 space-y-4 px-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-[var(--bg-card-hover)] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <div className="h-3 w-20 rounded bg-[var(--bg-card-hover)]" />
              <div className="h-3 w-10 rounded bg-[var(--bg-card-hover)]" />
            </div>
            <div className={`h-3 rounded bg-[var(--bg-card-hover)]`} style={{ width: `${60 + i * 10}%` }} />
            {i === 1 && <div className="h-3 w-1/3 rounded bg-[var(--bg-card-hover)]" />}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Props {
  channelId: string;
  channelType: string;
  channelName: string;
  viewerId: string;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
}

const PAGE_SIZE = 50;

export function ChannelChat({ channelId, channelType, channelName, viewerId, viewerRole }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef(false);
  // Track whether the user is near the bottom so we know whether to auto-scroll new messages.
  const nearBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = bottomAnchorRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) < 200;
  }, []);

  // Initial load.
  const loadInitial = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(`/api/community/channels/${channelId}/messages?limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      // API returns newest-first; we reverse so oldest is at the top of the scroll column.
      const ordered = (data.messages || []).reverse();
      setMessages(ordered);
      setNextCursor(data.nextCursor || null);
      // Wait for DOM, then scroll to bottom.
      setTimeout(() => scrollToBottom(false), 30);
    } catch {
      // silent — empty state shows
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [channelId, scrollToBottom]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setNextCursor(null);
    loadInitial();
  }, [channelId, loadInitial]);

  // On unmount or channel switch: poke the GET endpoint so server-side ChannelReadStatus
  // advances to "now". GET handler already does an upsert — this is a cheap tail call.
  useEffect(() => {
    const id = channelId;
    return () => {
      fetch(`/api/community/channels/${id}/messages?limit=1`).catch(() => {});
    };
  }, [channelId]);

  // Load older (pagination triggered by scroll-to-top).
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/community/channels/${channelId}/messages?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const older = (data.messages || []).reverse();
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight || 0;
      setMessages((prev) => [...older, ...prev]);
      setNextCursor(data.nextCursor || null);
      // Preserve scroll position across prepend.
      setTimeout(() => {
        if (el) {
          const newHeight = el.scrollHeight;
          el.scrollTop = newHeight - prevHeight;
        }
      }, 10);
    } catch {}
    setLoadingMore(false);
  }, [channelId, nextCursor, loadingMore]);

  // Scroll handler: near-bottom tracking + fetch-older trigger.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = isNearBottom();
    setShowJumpToBottom(!nearBottomRef.current);
    if (el.scrollTop < 120 && nextCursor && !loadingMore) {
      loadMore();
    }
  }, [isNearBottom, nextCursor, loadingMore, loadMore]);

  // Ably: new message arrives.
  useEffect(() => {
    const onMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.channelId !== channelId) return;
      const incoming: Message = {
        id: detail.messageId,
        content: detail.content,
        createdAt: detail.createdAt || new Date().toISOString(),
        userId: detail.userId,
        user: {
          id: detail.userId,
          username: detail.username || "user",
          role: detail.role || "CLIPPER",
        },
      };
      setMessages((prev) => {
        // Drop any optimistic temp message from the same user within the last 10s —
        // the real server message is arriving now and should take its place.
        const filtered = prev.filter((m) => {
          if (!String(m.id).startsWith("temp-")) return true;
          if (m.userId !== incoming.userId) return true;
          const age = Date.now() - new Date(m.createdAt).getTime();
          if (age > 10_000) return true;
          return false;
        });
        if (filtered.some((m) => m.id === incoming.id)) return filtered;
        return [...filtered, incoming];
      });
      if (nearBottomRef.current || detail.userId === viewerId) {
        setTimeout(() => scrollToBottom(true), 20);
      }
    };
    const onDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.channelId !== channelId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === detail.messageId ? { ...m, isDeleted: true } : m)),
      );
    };
    window.addEventListener("sse:channel_message", onMessage);
    window.addEventListener("sse:channel_message_deleted", onDeleted);
    return () => {
      window.removeEventListener("sse:channel_message", onMessage);
      window.removeEventListener("sse:channel_message_deleted", onDeleted);
    };
  }, [channelId, viewerId, scrollToBottom]);

  const handleSend = useCallback(
    async (content: string) => {
      // Immediate optimistic append with a temporary id. Replaced by either the POST response
      // (this function) or the Ably echo (above) — whichever wins first.
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: Message = {
        id: tempId,
        content,
        createdAt: new Date().toISOString(),
        userId: viewerId,
        user: { id: viewerId, username: "You", role: "CLIPPER" },
      };
      setMessages((prev) => [...prev, optimistic]);
      setTimeout(() => scrollToBottom(true), 10);

      try {
        const res = await fetch(`/api/community/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send");
        // Swap temp → real (or no-op if Ably already replaced it).
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          if (withoutTemp.some((m) => m.id === data.id)) return withoutTemp;
          return [...withoutTemp, data];
        });
      } catch (err: any) {
        // Remove the optimistic bubble on failure so the user doesn't see a ghost.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        toast.error(err.message || "Could not send message");
      }
    },
    [channelId, scrollToBottom, viewerId],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this message?")) return;
      try {
        const res = await fetch(
          `/api/community/channels/${channelId}/messages?messageId=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Failed");
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isDeleted: true } : m)));
      } catch {
        toast.error("Could not delete");
      }
    },
    [channelId],
  );

  const locked =
    channelType === "announcement" && viewerRole === "CLIPPER"
      ? "Only admins can post announcements"
      : undefined;

  // Group consecutive messages from the same user (hide repeat avatars for a tighter read).
  // Deleted messages on either side break the grouping — a deleted bubble shouldn't
  // inherit or suppress an adjacent author's avatar.
  const shouldShowAvatar = (idx: number) => {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    const cur = messages[idx];
    if (prev.isDeleted || cur.isDeleted) return true;
    if (prev.userId !== cur.userId) return true;
    const gap = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return gap > 5 * 60_000;
  };

  return (
    <div className="relative flex flex-col h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {loadingMore && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {loading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-20 px-4">
            <div className="text-center max-w-xs">
              <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                {channelType === "announcement"
                  ? <Megaphone className="h-6 w-6 text-accent" />
                  : <MessageCircle className="h-6 w-6 text-accent" />}
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                {channelType === "announcement" ? "No announcements yet" : `Welcome to #${channelName}`}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {channelType === "announcement"
                  ? "Admins will post important updates here."
                  : "Start the conversation."}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                viewerId={viewerId}
                viewerRole={viewerRole}
                onDelete={handleDelete}
                showAvatar={shouldShowAvatar(i)}
              />
            ))}
            <div ref={bottomAnchorRef} />
          </div>
        )}
      </div>

      {showJumpToBottom && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-white text-xs font-semibold shadow-lg shadow-accent/30 hover:bg-accent/90 transition-colors"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          New messages
        </button>
      )}

      <MessageInput
        onSend={handleSend}
        lockedReason={locked}
        placeholder={
          channelType === "announcement"
            ? "Write an announcement…"
            : `Message #${channelName}…`
        }
      />
    </div>
  );
}
