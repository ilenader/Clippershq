"use client";

import { memo, useRef, useState, useEffect } from "react";
import { Reply, SmilePlus, Trash2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";

/** Discord-style message timestamp: time for today, "Yesterday at …" for yesterday,
 *  full MM/DD/YYYY for older. */
function formatMessageTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (d.toDateString() === now.toDateString()) return time;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })} ${time}`;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  /** Stable client-generated id attached to optimistic temp messages. Echoed back by the
   *  server on the real message so the sender can match real→temp and keep the React key. */
  clientId?: string | null;
  content: string;
  isDeleted?: boolean;
  deletedBy?: string | null;
  createdAt: string | Date;
  userId: string;
  user?: {
    id: string;
    username?: string | null;
    name?: string | null;
    role?: string | null;
    image?: string | null;
  } | null;
  replyTo?: {
    id: string;
    /** Author of the original message being replied to — used to detect
     *  "someone replied to me" and render the Discord-style accent highlight. */
    userId?: string | null;
    content: string;
    isDeleted?: boolean;
    user?: { username?: string | null } | null;
  } | null;
  reactions?: Reaction[];
  _deleted?: boolean;
}

interface Props {
  message: Message;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  viewerId: string;
  /** Channel type — when "announcement" and viewer is CLIPPER, Reply is hidden
   *  (clippers can't post in announcement channels, so replying would dead-end). */
  channelType?: string;
  onDelete?: (id: string) => void;
  onReply?: (m: { id: string; username: string; content: string }) => void;
  onReact?: (messageId: string, emoji: string) => void;
  /** Staff-only: opens the mute dialog targeted at this message's author. */
  onMute?: (target: { userId: string; username: string }) => void;
  showAvatar?: boolean;
  /** When set and non-empty, matching substrings in the message content are highlighted. */
  searchQuery?: string;
}

/** Highlight case-insensitive matches of `query` inside `text`. Safe: React escapes children. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-accent/30 text-[var(--text-primary)] rounded px-0.5">{part}</mark>
      : part,
  );
}

const roleStyles: Record<string, { name: string; badgeBg: string; badgeText: string }> = {
  OWNER: { name: "text-red-400", badgeBg: "bg-red-500/10", badgeText: "text-red-400" },
  ADMIN: { name: "text-amber-400", badgeBg: "bg-amber-500/10", badgeText: "text-amber-400" },
};

// Accent-blue reaction set (see /api/community/reactions ALLOWED_REACTIONS for the server-side list).
export const REACTION_KEYS = ["thumbsup", "heart", "fire", "clap", "eyes"] as const;
export const REACTION_GLYPHS: Record<string, string> = {
  thumbsup: "👍",
  heart: "💙",
  fire: "🔥",
  clap: "👏",
  eyes: "👀",
};

function MessageBubbleInner({
  message, viewerRole, viewerId,
  channelType,
  onDelete, onReply, onReact, onMute,
  showAvatar = true,
  searchQuery,
}: Props) {
  const router = useRouter();
  // Prefer the stored Discord username. Fall back to `name` (display name) if
  // the username field is missing or the historic placeholder "user" — avoids
  // a generic "user" bubble for owner accounts created before the username
  // migration landed.
  const rawUsername = message.user?.username;
  const username =
    rawUsername && rawUsername !== "user"
      ? rawUsername
      : (message.user?.name || rawUsername || "Unknown");
  const role = (message.user?.role || "CLIPPER").toUpperCase();
  const roleStyle = roleStyles[role];
  const isOwner = viewerRole === "OWNER";
  const isAdmin = viewerRole === "ADMIN";
  const canModerate = isOwner || isAdmin;
  const canDelete = canModerate && !message.isDeleted;
  const isDeletedForViewer = message.isDeleted;
  // Reply is hidden for clippers on announcement channels — they can't post there, so a
  // reply prompt would just dead-end at a locked input.
  const canReply =
    channelType !== "announcement" || viewerRole === "OWNER" || viewerRole === "ADMIN";

  // Emoji picker popover state + flip logic. Defaults above; flips below if near the top
  // of the viewport (< 80px). Also flips horizontally if the trigger is close to the right
  // edge so the 5-emoji row stays fully visible on narrow screens.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(true);
  const [pickerLeft, setPickerLeft] = useState(true);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pickerOpen) return;
    if (pickerRef.current) {
      const rect = pickerRef.current.getBoundingClientRect();
      setPickerAbove(rect.top > 80);
      setPickerLeft(rect.left < window.innerWidth - 200);
    }
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  // Group reactions: { emoji: [userIds...] }
  const groupedReactions: Record<string, string[]> = {};
  for (const r of message.reactions || []) {
    if (!groupedReactions[r.emoji]) groupedReactions[r.emoji] = [];
    groupedReactions[r.emoji].push(r.userId);
  }
  const hasReactions = Object.keys(groupedReactions).length > 0;

  // Discord-style "someone replied to you" highlight: this message is a reply,
  // the original was authored by the viewer, and the replier isn't the viewer.
  const isReplyToMe =
    !!message.replyTo &&
    !!message.replyTo.userId &&
    message.replyTo.userId === viewerId &&
    message.userId !== viewerId;

  return (
    <div
      className={`group relative flex gap-3 px-3 sm:px-4 ${showAvatar ? "py-1.5 mt-1" : "py-0.5"} transition-colors ${
        isReplyToMe
          ? "bg-accent/10 hover:bg-accent/[0.14]"
          : "hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      {isReplyToMe && (
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1 sm:w-0.5 bg-accent"
        />
      )}
      <div className="flex-shrink-0 w-8">
        {showAvatar && (
          message.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={message.user.image}
              alt={username}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold uppercase">
              {username[0] || "?"}
            </div>
          )
        )}
      </div>

      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <button
              onClick={() => {
                if (isOwner && message.user?.id) router.push(`/admin/users/${message.user.id}`);
              }}
              className={`text-sm lg:text-base font-semibold truncate max-w-[150px] sm:max-w-[200px] ${roleStyle?.name || "text-[var(--text-primary)]"} ${isOwner ? "hover:underline cursor-pointer" : "cursor-default"}`}
            >
              {username}
            </button>
            {roleStyle && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${roleStyle.badgeBg} ${roleStyle.badgeText}`}>
                {role}
              </span>
            )}
            <span className="text-[11px] lg:text-xs text-[var(--text-muted)] tabular-nums">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
        )}

        {/* Reply-to preview — rendered above the content */}
        {message.replyTo && !isDeletedForViewer && (
          <div className="flex items-center gap-1.5 mb-1 pl-3 border-l-2 border-accent/30">
            <Reply className="h-3 w-3 text-accent/70 flex-shrink-0" />
            <span className="text-[11px] font-medium text-accent flex-shrink-0">
              {message.replyTo.user?.username || "user"}
            </span>
            <span className="text-[11px] text-[var(--text-muted)] truncate">
              {message.replyTo.isDeleted ? "[deleted message]" : message.replyTo.content}
            </span>
          </div>
        )}

        {isDeletedForViewer ? (
          (isOwner || isAdmin) ? (
            <p className="text-sm text-[var(--text-muted)] italic line-through opacity-60">
              {message.content}
              <span className="ml-2 text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded not-italic">
                Deleted
              </span>
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] italic">
              {message.userId === viewerId
                ? (message.deletedBy && message.deletedBy === viewerId
                    ? "You deleted this message"
                    : "This message was deleted by admin")
                : message.content}
            </p>
          )
        ) : (
          <p className="text-sm lg:text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
            {searchQuery ? highlightMatch(message.content, searchQuery) : message.content}
          </p>
        )}

        {/* Reactions row */}
        {!isDeletedForViewer && (hasReactions || onReact) && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {Object.entries(groupedReactions).map(([emoji, userIds]) => {
              const active = userIds.includes(viewerId);
              return (
                <button
                  key={emoji}
                  onClick={() => onReact?.(message.id, emoji)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                    active
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-[var(--border-color)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-accent/30"
                  }`}
                  title={`${userIds.length} reaction${userIds.length === 1 ? "" : "s"}`}
                >
                  <span>{REACTION_GLYPHS[emoji] || emoji}</span>
                  <span className="tabular-nums">{userIds.length}</span>
                </button>
              );
            })}
            {onReact && (
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => setPickerOpen((o) => !o)}
                  className={`h-5 w-5 rounded-full flex items-center justify-center transition-opacity border border-transparent ${
                    hasReactions
                      ? "opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-input)] hover:border-[var(--border-color)]"
                      : "opacity-60 group-hover:opacity-100 hover:bg-[var(--bg-input)] hover:border-[var(--border-color)]"
                  }`}
                  aria-label="Add reaction"
                >
                  <SmilePlus className="h-3 w-3 text-[var(--text-muted)]" />
                </button>
                {pickerOpen && (
                  <div
                    className={`absolute ${pickerAbove ? "bottom-full mb-1" : "top-full mt-1"} ${pickerLeft ? "left-0" : "right-0"} flex gap-0.5 p-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl shadow-black/40 z-20`}
                  >
                    {REACTION_KEYS.map((key) => (
                      <button
                        key={key}
                        onClick={() => { onReact(message.id, key); setPickerOpen(false); }}
                        className="h-7 w-7 rounded-md hover:bg-[var(--bg-input)] flex items-center justify-center text-base transition-colors"
                        title={key}
                      >
                        {REACTION_GLYPHS[key]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover action rail */}
      {!isDeletedForViewer && (
        <div className="flex items-start gap-0.5 flex-shrink-0">
          {onReply && canReply && (
            <button
              onClick={() => onReply({ id: message.id, username, content: message.content })}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg flex items-center justify-center hover:bg-accent/10"
              title="Reply"
              aria-label="Reply to message"
            >
              <Reply className="h-3.5 w-3.5 text-accent" />
            </button>
          )}
          {canModerate && onMute && message.userId !== viewerId && role !== "OWNER" && (
            <button
              onClick={() => onMute({ userId: message.userId, username })}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg flex items-center justify-center hover:bg-amber-500/10"
              title="Mute user"
              aria-label="Mute user"
            >
              <VolumeX className="h-3.5 w-3.5 text-amber-400" />
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-500/10"
              title="Delete message"
              aria-label="Delete message"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Memo'd export: skips re-render when neighbors update, so replacing one temp→real
// doesn't cause every sibling MessageBubble to re-render.
export const MessageBubble = memo(MessageBubbleInner);
