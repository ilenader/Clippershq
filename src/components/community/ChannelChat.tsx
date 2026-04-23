"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { MessageBubble, type Message } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { MuteUserDialog } from "./MuteUserDialog";
import { toast } from "@/lib/toast";
import { AlertCircle, ArrowDown, Loader2, Megaphone, MessageCircle, Search, Trophy, X } from "lucide-react";

/** Discord-style day divider label. */
function formatDateSeparator(date: string | Date): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function channelHeaderIcon(type: string) {
  if (type === "announcement") return Megaphone;
  if (type === "leaderboard") return Trophy;
  return MessageCircle;
}

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
  /** Campaign owning this channel — needed for the moderation mute feature. */
  campaignId: string;
  viewerId: string;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
}

const PAGE_SIZE = 50;

export function ChannelChat({ channelId, channelType, channelName, campaignId, viewerId, viewerRole }: Props) {
  const isAdminOrOwner = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchResults, setSearchResults] = useState<Message[] | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, { username: string; until: number }>>(new Map());
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Moderation mute state.
  const [mutedUntil, setMutedUntil] = useState<Date | null>(null);
  const [muteDialog, setMuteDialog] = useState<{ userId: string; username: string } | null>(null);

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
      if (res.status === 404) {
        setError("This channel no longer exists");
        return;
      }
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
    setError(null);
    // Reset search + reply state when switching channels — stale state from the
    // previous channel would otherwise leak into the new one's view.
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults(null);
    setReplyTo(null);
    loadInitial();
  }, [channelId, loadInitial]);

  // Escape: clear search first, then cancel reply. Ignored while typing in an input
  // so we don't hijack the textarea's native behavior.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (searchQuery) { clearSearch(); return; }
      if (replyTo) { setReplyTo(null); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchQuery, replyTo]);

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
        id: detail.messageId || detail.id,
        content: detail.content,
        createdAt: detail.createdAt || new Date().toISOString(),
        userId: detail.userId,
        user: {
          id: detail.userId,
          username: detail.username || "user",
          name: detail.name || null,
          role: detail.role || "CLIPPER",
          image: detail.image || null,
        },
        replyTo: detail.replyTo
          ? {
              id: detail.replyTo.id,
              userId: detail.replyTo.userId ?? detail.replyTo.user?.id ?? null,
              content: detail.replyTo.content,
              isDeleted: !!detail.replyTo.isDeleted,
              user: {
                id: detail.replyTo.user?.id ?? detail.replyTo.userId ?? null,
                username: detail.replyTo.user?.username ?? null,
              },
            }
          : null,
      };
      // No optimistic temp — the POST response already appended the sender's own message,
      // so we just dedupe by id and append incoming messages from other users.
      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
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
    const onReaction = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.channelId !== channelId) return;
      setMessages((prev) => prev.map((m) => {
        if (m.id !== detail.messageId) return m;
        const reactions = [...(m.reactions || [])];
        const idx = reactions.findIndex((r) => r.userId === detail.userId && r.emoji === detail.emoji);
        if (detail.action === "remove" && idx >= 0) reactions.splice(idx, 1);
        if (detail.action === "add" && idx < 0) reactions.push({ userId: detail.userId, emoji: detail.emoji });
        return { ...m, reactions };
      }));
    };

    window.addEventListener("sse:channel_message", onMessage);
    window.addEventListener("sse:channel_message_deleted", onDeleted);
    window.addEventListener("sse:channel_reaction", onReaction);
    return () => {
      window.removeEventListener("sse:channel_message", onMessage);
      window.removeEventListener("sse:channel_message_deleted", onDeleted);
      window.removeEventListener("sse:channel_reaction", onReaction);
    };
  }, [channelId, viewerId, scrollToBottom]);

  // Typing indicator — listen for `typing` events, add/refresh per-user entries,
  // auto-evict after 4s. Filter out the viewer's own typing pings.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.channelId !== channelId) return;
      if (detail.userId === viewerId) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(detail.userId, { username: detail.username || "user", until: Date.now() + 4000 });
        return next;
      });
    };
    const sweep = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        for (const [uid, entry] of next) {
          if (entry.until <= now) { next.delete(uid); changed = true; }
        }
        return changed ? next : prev;
      });
    }, 1000);
    window.addEventListener("sse:typing", handler);
    return () => {
      window.removeEventListener("sse:typing", handler);
      clearInterval(sweep);
    };
  }, [channelId, viewerId]);

  // Fetch the viewer's own moderation mute status for this campaign. Refetches whenever
  // we switch into a different campaign's community. OWNER is never mutable so skip.
  useEffect(() => {
    if (!campaignId || viewerRole === "OWNER") { setMutedUntil(null); return; }
    let cancelled = false;
    fetch(`/api/community/mutes/me?campaignId=${encodeURIComponent(campaignId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.muted && data.expiresAt) setMutedUntil(new Date(data.expiresAt));
        else setMutedUntil(null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId, viewerRole]);

  // Live mute updates via Ably.
  useEffect(() => {
    if (!campaignId) return;
    const onMuted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.campaignId !== campaignId) return;
      if (detail.userId !== viewerId) return;
      if (detail.expiresAt) setMutedUntil(new Date(detail.expiresAt));
    };
    const onUnmuted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.campaignId !== campaignId) return;
      if (detail.userId !== viewerId) return;
      setMutedUntil(null);
    };
    window.addEventListener("sse:user_muted", onMuted);
    window.addEventListener("sse:user_unmuted", onUnmuted);
    return () => {
      window.removeEventListener("sse:user_muted", onMuted);
      window.removeEventListener("sse:user_unmuted", onUnmuted);
    };
  }, [campaignId, viewerId]);

  // Auto-clear mutedUntil once it expires locally so the input unlocks without a refresh.
  useEffect(() => {
    if (!mutedUntil) return;
    const ms = mutedUntil.getTime() - Date.now();
    if (ms <= 0) { setMutedUntil(null); return; }
    const t = setTimeout(() => setMutedUntil(null), ms + 500);
    return () => clearTimeout(t);
  }, [mutedUntil]);

  // OWNER/ADMIN search — debounce 500ms, query server-side ILIKE, render results in place.
  useEffect(() => {
    if (!isAdminOrOwner) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchActive(false);
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setSearchActive(true);
        const res = await fetch(
          `/api/community/channels/${channelId}/messages?search=${encodeURIComponent(q)}&limit=100`,
        );
        if (!res.ok) { setSearchResults([]); return; }
        const data = await res.json();
        setSearchResults((data.messages || []).reverse());
      } catch {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [searchQuery, channelId, isAdminOrOwner]);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults(null);
  };

  // Client-side typing ping — sends to /api/community/typing, server-side throttled.
  const pingTyping = useCallback(() => {
    fetch("/api/community/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    }).catch(() => {});
  }, [channelId]);

  const handleSend = useCallback(
    async (content: string) => {
      // Mirror the ticket-chat pattern: no optimistic temp. POST first, then append the
      // server-returned message exactly once. Eliminates the temp→real swap flicker entirely.
      try {
        const res = await fetch(`/api/community/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, replyToId: replyTo?.id || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send");
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        setReplyTo(null);
        setTimeout(() => scrollToBottom(true), 20);
      } catch (err: any) {
        toast.error(err.message || "Could not send message");
      }
    },
    [channelId, scrollToBottom, replyTo],
  );

  const handleReply = useCallback((m: { id: string; username: string; content: string }) => {
    setReplyTo(m);
  }, []);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    // Snapshot the target message's reactions so we can restore on API failure.
    let snapshot: Message["reactions"] | undefined;
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      snapshot = m.reactions ? [...m.reactions] : [];
      const existing = (m.reactions || []).findIndex((r) => r.userId === viewerId && r.emoji === emoji);
      const nextReactions = [...(m.reactions || [])];
      if (existing >= 0) nextReactions.splice(existing, 1);
      else nextReactions.push({ userId: viewerId, emoji });
      return { ...m, reactions: nextReactions };
    }));

    try {
      const res = await fetch("/api/community/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      // Rollback — restore the snapshot for the exact message we optimistically edited.
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: snapshot } : m)));
      toast.error("Could not save reaction");
    }
  }, [viewerId]);

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
      : channelType === "private" && viewerRole === "CLIPPER"
        ? "This channel is private"
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

  const displayMessages = searchActive && searchResults ? searchResults : messages;
  const typingList = Array.from(typingUsers.values()).map((t) => t.username);
  const HeaderIcon = channelHeaderIcon(channelType);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center px-4">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-[var(--text-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-[var(--bg-primary)]">
      {/* Channel header — shows the channel name persistently inside the chat area
          so the context is visible below the campaign tabs on desktop and mobile. */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <HeaderIcon className="h-4 w-4 lg:h-5 lg:w-5 text-[var(--text-muted)] flex-shrink-0" />
        <h2 className="text-base lg:text-lg font-semibold text-[var(--text-primary)] truncate">
          {channelName}
        </h2>
      </div>

      {isAdminOrOwner && (
        <div className="px-3 sm:px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search messages…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-sm lg:text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center hover:bg-[var(--bg-card-hover)] transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              </button>
            )}
          </div>
          {searchActive && searchResults && (
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
              {searchResults.length} match{searchResults.length === 1 ? "" : "es"}
              <button onClick={clearSearch} className="ml-2 text-accent hover:underline">Clear</button>
            </p>
          )}
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={searchActive ? undefined : handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain min-h-0 flex flex-col"
      >
        {loadingMore && (
          <div className="flex items-center justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {loading ? (
          <MessageSkeleton />
        ) : searchActive && searchResults ? (
          searchResults.length === 0 ? (
            <div className="flex items-center justify-center py-20 px-4">
              <p className="text-sm text-[var(--text-muted)]">No messages match "{searchQuery}"</p>
            </div>
          ) : (
            <div className="py-2">
              {searchResults.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                  channelType={channelType}
                  onDelete={handleDelete}
                  onReply={handleReply}
                  onReact={handleReact}
                  onMute={isAdminOrOwner ? setMuteDialog : undefined}
                  showAvatar={true}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )
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
          // mt-auto bottom-aligns the messages list when it's shorter than the scroll
          // container. Without it, messages cling to the top and a gap appears at the
          // bottom (most noticeable when the mobile keyboard opens and the document
          // scrolls to reveal the input). With mt-auto the empty space moves above the
          // first message — hidden above the visible viewport when scrolled — so the
          // last message always sits flush against the input.
          <div className="py-2 mt-auto">
            {messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const sameDay = prev && new Date(prev.createdAt).toDateString() === new Date(m.createdAt).toDateString();
              const showSeparator = !sameDay;
              return (
                <Fragment key={m.id}>
                  {showSeparator && (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 h-px bg-[var(--border-color)]" />
                      <span className="text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap uppercase tracking-wider">
                        {formatDateSeparator(m.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-[var(--border-color)]" />
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    viewerId={viewerId}
                    viewerRole={viewerRole}
                    channelType={channelType}
                    onDelete={handleDelete}
                    onReply={handleReply}
                      onReact={handleReact}
                    onMute={isAdminOrOwner ? setMuteDialog : undefined}
                    showAvatar={shouldShowAvatar(i)}
                  />
                </Fragment>
              );
            })}
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

      {typingList.length > 0 && !searchActive && (
        <div className="flex-shrink-0 px-4 pb-0.5">
          <p className="text-xs text-[var(--text-muted)] italic animate-pulse">
            {typingList.slice(0, 3).join(", ")}
            {typingList.length > 3 && ` +${typingList.length - 3} more`}
            {typingList.length === 1 ? " is typing…" : " are typing…"}
          </p>
        </div>
      )}

      <MessageInput
        onSend={handleSend}
        onTyping={channelType === "leaderboard" ? undefined : pingTyping}
        lockedReason={locked}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        mutedUntil={mutedUntil}
        placeholder={
          channelType === "announcement"
            ? "Write an announcement…"
            : `Message #${channelName}…`
        }
      />

      <MuteUserDialog
        open={!!muteDialog}
        onClose={() => setMuteDialog(null)}
        campaignId={campaignId}
        target={muteDialog}
      />
    </div>
  );
}
