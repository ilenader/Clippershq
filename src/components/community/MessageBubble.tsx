"use client";

import { Pin, Trash2 } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import { useRouter } from "next/navigation";

export interface Message {
  id: string;
  content: string;
  isPinned?: boolean;
  isDeleted?: boolean;
  deletedBy?: string | null;
  createdAt: string | Date;
  userId: string;
  user?: {
    id: string;
    username?: string | null;
    role?: string | null;
    image?: string | null;
  } | null;
  _deleted?: boolean;
}

interface Props {
  message: Message;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  viewerId: string;
  onDelete?: (id: string) => void;
  showAvatar?: boolean;
}

const roleStyles: Record<string, { name: string; badgeBg: string; badgeText: string }> = {
  OWNER: { name: "text-red-400", badgeBg: "bg-red-500/10", badgeText: "text-red-400" },
  ADMIN: { name: "text-amber-400", badgeBg: "bg-amber-500/10", badgeText: "text-amber-400" },
};

export function MessageBubble({ message, viewerRole, viewerId, onDelete, showAvatar = true }: Props) {
  const router = useRouter();
  const username = message.user?.username || "user";
  const role = (message.user?.role || "CLIPPER").toUpperCase();
  const roleStyle = roleStyles[role];
  const isOwner = viewerRole === "OWNER";
  const isAdmin = viewerRole === "ADMIN";
  const canDelete = (isOwner || isAdmin) && !message.isDeleted;
  const isDeletedForViewer = message.isDeleted;

  return (
    <div className="group flex gap-3 px-3 sm:px-4 py-2 hover:bg-[var(--bg-card-hover)] transition-colors">
      {/* Avatar column — always occupies space for rhythm, even when hidden for grouped messages */}
      <div className="flex-shrink-0 w-8">
        {showAvatar && (
          <div className="h-8 w-8 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold uppercase">
            {username[0] || "?"}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <button
              onClick={() => {
                if (isOwner && message.user?.id) router.push(`/admin/users/${message.user.id}`);
              }}
              className={`text-sm font-semibold ${roleStyle?.name || "text-[var(--text-primary)]"} ${isOwner ? "hover:underline cursor-pointer" : "cursor-default"}`}
            >
              {username}
            </button>
            {roleStyle && (
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${roleStyle.badgeBg} ${roleStyle.badgeText}`}>
                {role}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
              {formatRelative(message.createdAt)}
            </span>
            {message.isPinned && (
              <span className="inline-flex items-center gap-1 text-[10px] text-accent font-medium">
                <Pin className="h-3 w-3" /> Pinned
              </span>
            )}
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
              {message.userId === viewerId ? "This message was deleted by admin" : message.content}
            </p>
          )
        ) : (
          <p className="text-sm lg:text-[15px] text-[var(--text-secondary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
            {message.content}
          </p>
        )}
      </div>

      {canDelete && onDelete && (
        <button
          onClick={() => onDelete(message.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 flex-shrink-0"
          title="Delete message"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </button>
      )}
    </div>
  );
}
