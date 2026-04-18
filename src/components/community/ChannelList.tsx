"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity, ArrowLeft, Bell, BellOff, Hash, Lock, Megaphone, MessageSquare,
  Phone, Plus, Settings, Trophy, X,
} from "lucide-react";

interface Channel {
  id: string;
  name: string;
  type: string;
  unread?: number;
}

/** What the ChannelList currently has highlighted.
 *  - channel: a real channel row (activeChannelId)
 *  - ticket / activity / voice: one of the pseudo-rows that maps to a viewMode */
type ActiveKey =
  | { kind: "channel"; id: string }
  | { kind: "ticket" }
  | { kind: "activity" }
  | { kind: "voice" };

interface Props {
  campaignName: string;
  campaignImageUrl?: string | null;
  channels: Channel[];
  active: ActiveKey | null;
  onSelectChannel: (ch: Channel) => void;
  onSelectTicket: () => void;
  onSelectActivity: () => void;
  onSelectVoice: () => void;
  upcomingCall: { id: string; title: string; status: string } | null;
  ticketUnread: number;
  isAdmin: boolean;
  isOwner: boolean;
  username: string;
  userImage?: string | null;
  userRole: string;
  muted: boolean;
  onToggleMute: () => void;
  onAddChannel: () => void;
  onDeleteChannel?: (channelId: string) => void;
  onRenameChannel?: (channelId: string, newName: string) => void;
  /** Mobile back chevron — hidden on desktop. */
  onBack?: () => void;
}

const DEFAULT_CHANNEL_NAMES = ["announcements", "general", "leaderboard"];

function iconFor(type: string) {
  if (type === "announcement") return Megaphone;
  if (type === "leaderboard") return Trophy;
  if (type === "private") return Lock;
  if (type === "voice") return Phone;
  return Hash;
}

export function ChannelList({
  campaignName,
  channels,
  active,
  onSelectChannel,
  onSelectTicket,
  onSelectActivity,
  onSelectVoice,
  upcomingCall,
  ticketUnread,
  isAdmin,
  isOwner,
  username,
  userImage,
  userRole,
  muted,
  onToggleMute,
  onAddChannel,
  onDeleteChannel,
  onRenameChannel,
  onBack,
}: Props) {
  // Bucket the real channels by type for section rendering.
  const textChannels = channels.filter(
    (c) => c.type === "general" || c.type === "announcement" || c.type === "private",
  );
  const leaderboardChannel = channels.find((c) => c.type === "leaderboard") || null;
  const voiceChannel = channels.find((c) => c.type === "voice") || null;

  const isActiveChannel = (id: string) => active?.kind === "channel" && active.id === id;

  return (
    <div className="w-full lg:w-60 flex-shrink-0 bg-[var(--bg-card)] flex flex-col border-r border-[var(--border-color)] overflow-hidden h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden p-1 rounded hover:bg-[var(--bg-input)] transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        )}
        <h2 className="text-base font-semibold text-[var(--text-primary)] truncate flex-1">
          {campaignName}
        </h2>
        {isOwner && (
          <button
            onClick={onAddChannel}
            className="p-1 rounded hover:bg-[var(--bg-input)] transition-colors"
            title="Create channel"
            aria-label="Create channel"
          >
            <Plus className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
        )}
      </div>

      {/* Channel groups */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 min-h-0">
        {/* Text Channels */}
        {textChannels.length > 0 && (
          <Section label="Text Channels">
            {textChannels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                active={isActiveChannel(ch.id)}
                onClick={() => onSelectChannel(ch)}
                canDelete={isOwner && !DEFAULT_CHANNEL_NAMES.includes(ch.name.toLowerCase())}
                onDelete={onDeleteChannel ? () => onDeleteChannel(ch.id) : undefined}
                onRename={
                  isOwner && !DEFAULT_CHANNEL_NAMES.includes(ch.name.toLowerCase()) && onRenameChannel
                    ? (newName: string) => onRenameChannel(ch.id, newName)
                    : undefined
                }
              />
            ))}
          </Section>
        )}

        {/* Info */}
        {(leaderboardChannel || isAdmin) && (
          <Section label="Info">
            {leaderboardChannel && (
              <ChannelRow
                channel={leaderboardChannel}
                active={isActiveChannel(leaderboardChannel.id)}
                onClick={() => onSelectChannel(leaderboardChannel)}
              />
            )}
            {isAdmin && (
              <PseudoRow
                label="activity"
                icon={Activity}
                active={active?.kind === "activity"}
                onClick={onSelectActivity}
              />
            )}
          </Section>
        )}

        {/* Support — direct messages / tickets */}
        <Section label="Support">
          <PseudoRow
            label={isAdmin ? "tickets" : "direct-messages"}
            icon={MessageSquare}
            active={active?.kind === "ticket"}
            unread={ticketUnread}
            onClick={onSelectTicket}
          />
        </Section>

        {/* Voice */}
        {(upcomingCall || isAdmin || voiceChannel) && (
          <Section label="Voice">
            <PseudoRow
              label={upcomingCall?.title?.toLowerCase().replace(/\s+/g, "-") || "voice"}
              icon={Phone}
              active={active?.kind === "voice"}
              onClick={onSelectVoice}
              badge={upcomingCall?.status === "live" ? "LIVE" : undefined}
            />
          </Section>
        )}
      </div>

      {/* User footer */}
      <div className="px-3 py-2 border-t border-[var(--border-color)] bg-[var(--bg-primary)] flex items-center gap-2.5">
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={userImage}
            alt=""
            className="h-8 w-8 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold flex-shrink-0">
            {username?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{username}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{userRole}</p>
        </div>
        <button
          onClick={onToggleMute}
          className={`p-1.5 rounded transition-colors ${
            muted
              ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              : "hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
          }`}
          title={muted ? "Unmute announcements" : "Mute announcements"}
          aria-label={muted ? "Unmute announcements" : "Mute announcements"}
        >
          {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ChannelRow({
  channel,
  active,
  onClick,
  canDelete,
  onDelete,
  onRename,
}: {
  channel: Channel;
  active: boolean;
  onClick: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
}) {
  const Icon = iconFor(channel.type);
  const unread = channel.unread || 0;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(channel.name);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setEditValue(channel.name);
  }, [channel.name, editing]);

  const commitRename = () => {
    const next = editValue.trim();
    if (next && next !== channel.name) {
      onRename?.(next);
    }
    setEditing(false);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={editing ? undefined : onClick}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
        active
          ? "bg-[var(--bg-input)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {editing ? (
        <input
          ref={editRef}
          value={editValue}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setEditValue(
              e.target.value
                .toLowerCase()
                .replace(/\s+/g, "-")
                .replace(/[^a-z0-9-]/g, ""),
            )
          }
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditValue(channel.name);
              setEditing(false);
            }
          }}
          onBlur={commitRename}
          className="text-sm bg-transparent border-b border-accent outline-none flex-1 min-w-0 text-[var(--text-primary)]"
          maxLength={50}
        />
      ) : (
        <span className="text-sm truncate flex-1 text-left">{channel.name}</span>
      )}
      {unread > 0 && !active && !editing && (
        <span className="h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      {canDelete && onRename && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditValue(channel.name);
            setEditing(true);
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent/10 transition-opacity"
          aria-label="Rename channel"
          title="Rename channel"
        >
          <Settings className="h-3 w-3 text-[var(--text-muted)]" />
        </button>
      )}
      {canDelete && onDelete && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete #${channel.name}? All messages will be lost.`)) {
              onDelete();
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 transition-opacity"
          aria-label="Delete channel"
          title="Delete channel"
        >
          <X className="h-3 w-3 text-red-400" />
        </button>
      )}
    </div>
  );
}

function PseudoRow({
  label,
  icon: Icon,
  active,
  unread,
  badge,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  unread?: number;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
        active
          ? "bg-[var(--bg-input)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="text-sm truncate flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 animate-pulse">
          {badge}
        </span>
      )}
      {(unread || 0) > 0 && !active && (
        <span className="h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
          {(unread || 0) > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
