"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Search, StickyNote, X } from "lucide-react";
import { MessageBubble, type Message } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { formatRelative } from "@/lib/utils";
import { toast } from "@/lib/toast";

type TicketStatus = "open" | "waiting" | "pending" | "resolved";

interface Ticket {
  id: string;
  userId: string;
  user?: { id: string; username?: string | null; image?: string | null };
  status: TicketStatus;
  notes?: string | null;
  lastMessageAt?: string | null;
  unread: number;
  lastMessage?: { content?: string } | null;
}

interface Props {
  campaignId: string;
  viewerId: string;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
}

const statusColors: Record<TicketStatus, { dot: string; active: string }> = {
  open:     { dot: "bg-blue-400",    active: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  waiting:  { dot: "bg-amber-400",   active: "bg-amber-500/15 text-amber-400 border border-amber-500/30" },
  pending:  { dot: "bg-purple-400",  active: "bg-purple-500/15 text-purple-400 border border-purple-500/30" },
  resolved: { dot: "bg-emerald-400", active: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" },
};

export function TicketPanel({ campaignId, viewerId, viewerRole }: Props) {
  const isAdminOrOwner = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | TicketStatus>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadedTicketsOnce, setLoadedTicketsOnce] = useState(false);
  const fetchingRef = useRef(false);

  const loadTickets = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(`/api/community/tickets?campaignId=${encodeURIComponent(campaignId)}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const list: Ticket[] = Array.isArray(data) ? data : [];
      setTickets(list);

      // Select existing ticket if one exists. Never auto-CREATE — CLIPPER must click
      // "Start a Conversation" first (see the empty-state block in render). Avoids
      // empty tickets cluttering the admin inbox when a user just peeks at the tab.
      if (!selectedId && list.length > 0) {
        const mine = !isAdminOrOwner ? list.find((t) => t.userId === viewerId) : list[0];
        if (mine) setSelectedId(mine.id);
      }
    } catch {}
    fetchingRef.current = false;
    setLoading(false);
    setLoadedTicketsOnce(true);
  }, [campaignId, isAdminOrOwner, viewerId, selectedId]);

  const startConversation = useCallback(async () => {
    try {
      const res = await fetch("/api/community/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) throw new Error("Failed");
      const t = await res.json();
      setTickets([{ ...t, unread: 0 }]);
      setSelectedId(t.id);
    } catch {
      toast.error("Could not start conversation");
    }
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    setTickets([]);
    setSelectedId(null);
    setLoadedTicketsOnce(false);
    loadTickets();
  }, [campaignId, loadTickets]);

  // Real-time ticket updates.
  useEffect(() => {
    const handler = () => loadTickets();
    window.addEventListener("sse:ticket_message", handler);
    return () => window.removeEventListener("sse:ticket_message", handler);
  }, [loadTickets]);

  // Filter + search.
  const filtered = useMemo(() => {
    let rows = tickets;
    if (statusFilter !== "all") rows = rows.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((t) => (t.user?.username || "").toLowerCase().includes(q));
    }
    return rows;
  }, [tickets, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { all: tickets.length, open: 0, waiting: 0, pending: 0, resolved: 0 };
    for (const t of tickets) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [tickets]);

  const selected = tickets.find((t) => t.id === selectedId) || null;

  if (!isAdminOrOwner) {
    // CLIPPER: single ticket view, no list.
    if (loading) {
      return (
        <div className="flex flex-col gap-3 p-4 h-full">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-[var(--bg-card-hover)] flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-[var(--bg-card-hover)]" />
                <div className="h-3 rounded bg-[var(--bg-card-hover)]" style={{ width: `${50 + i * 15}%` }} />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (!selected) {
      // No ticket yet — explicit opt-in button (nothing's created on mere page-visit).
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 h-full text-center">
          <div className="h-14 w-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <MessageCircle className="h-7 w-7 text-accent" />
          </div>
          <p className="text-sm lg:text-base font-semibold text-[var(--text-primary)] mb-1">
            Need help with this campaign?
          </p>
          <p className="text-xs text-[var(--text-muted)] max-w-xs mb-5">
            Start a private conversation with the team. We'll get back to you as soon as we can.
          </p>
          <button
            onClick={startConversation}
            className="px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/85 active:scale-[0.98] transition-all"
          >
            Start a Conversation
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-semibold">Direct message</p>
          <p className="text-sm lg:text-base font-semibold text-[var(--text-primary)]">One-on-one with the team</p>
        </div>
        <TicketThread ticket={selected} viewerId={viewerId} viewerRole={viewerRole} onUpdate={loadTickets} />
      </div>
    );
  }

  // OWNER/ADMIN: list + detail.
  return (
    <div className="flex h-full min-h-0">
      {/* LIST */}
      <div className="w-72 lg:w-80 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col min-h-0">
        {/* Filters */}
        <div className="p-3 border-b border-[var(--border-color)] space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clippers…"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] pl-8 pr-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "open", "waiting", "pending", "resolved"] as const).map((s) => {
              const isActive = statusFilter === s;
              const count = counts[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-accent/15 text-accent"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                  }`}
                >
                  {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
                  {count > 0 && <span className="ml-1 tabular-nums opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="p-2 space-y-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-[var(--bg-card-hover)] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-[var(--bg-card-hover)]" />
                    <div className="h-2.5 rounded bg-[var(--bg-card-hover)]" style={{ width: `${40 + i * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && tickets.length === 0 && (
            <div className="p-6 text-center">
              <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="h-6 w-6 text-accent" />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No tickets yet</p>
              <p className="text-xs text-[var(--text-muted)]">Clippers will reach out when they need help.</p>
            </div>
          )}
          {!loading && filtered.length === 0 && tickets.length > 0 && (
            <div className="p-6 text-center">
              <p className="text-xs text-[var(--text-muted)]">No tickets match this filter.</p>
            </div>
          )}
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left flex items-center gap-3 px-3 py-3 border-b border-[var(--border-subtle)] transition-colors ${
                selectedId === t.id
                  ? "bg-accent/10 border-l-2 border-l-accent"
                  : "hover:bg-[var(--bg-card-hover)] border-l-2 border-l-transparent"
              }`}
            >
              <div className="h-9 w-9 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold uppercase flex-shrink-0">
                {(t.user?.username || "?")[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {t.user?.username || "Clipper"}
                  </p>
                  {t.lastMessageAt && (
                    <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 tabular-nums">
                      {formatRelative(t.lastMessageAt)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {t.lastMessage?.content || "No messages yet"}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <span className={`h-2 w-2 rounded-full ${statusColors[t.status].dot}`} />
                {t.unread > 0 && (
                  <span className="h-4 min-w-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
                    {t.unread}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* DETAIL */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-[var(--text-muted)]">Select a ticket to view the conversation</p>
            </div>
          </div>
        ) : (
          <TicketThread
            key={selected.id}
            ticket={selected}
            viewerId={viewerId}
            viewerRole={viewerRole}
            onUpdate={loadTickets}
          />
        )}
      </div>
    </div>
  );
}

interface ThreadProps {
  ticket: Ticket;
  viewerId: string;
  viewerRole: "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  onUpdate: () => void;
}

function TicketThread({ ticket, viewerId, viewerRole, onUpdate }: ThreadProps) {
  const isAdminOrOwner = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const [messages, setMessages] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(ticket.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => setNotesDraft(ticket.notes || ""), [ticket.id, ticket.notes]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/community/tickets/${ticket.id}/messages?limit=50`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMessages((data.messages || []).reverse());
      setNextCursor(data.nextCursor || null);
      setTimeout(() => anchorRef.current?.scrollIntoView({ block: "end" }), 30);
    } catch {}
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    load();
  }, [ticket.id, load]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.ticketId !== ticket.id) return;
      load();
    };
    window.addEventListener("sse:ticket_message", handler);
    return () => window.removeEventListener("sse:ticket_message", handler);
  }, [ticket.id, load]);

  const handleSend = async (content: string) => {
    try {
      const res = await fetch(`/api/community/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setTimeout(() => anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 20);
      onUpdate();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    }
  };

  const updateStatus = async (status: TicketStatus) => {
    try {
      const res = await fetch(`/api/community/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Marked as ${status}`);
      onUpdate();
    } catch {
      toast.error("Could not update status");
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/community/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft || null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Notes saved");
      onUpdate();
    } catch {
      toast.error("Could not save notes");
    }
    setSavingNotes(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header: username + status buttons (admin only) + notes toggle */}
      {isAdminOrOwner && (
        <div className="px-3 sm:px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)] flex items-center gap-2 flex-wrap">
          <div className="h-8 w-8 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-xs font-bold uppercase flex-shrink-0">
            {(ticket.user?.username || "?")[0]}
          </div>
          <p className="text-sm lg:text-base font-semibold text-[var(--text-primary)] truncate">
            {ticket.user?.username || "Clipper"}
          </p>
          <div className="flex gap-1 ml-auto items-center flex-wrap">
            {(["open", "waiting", "pending", "resolved"] as TicketStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  ticket.status === s
                    ? statusColors[s].active
                    : "bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button
              onClick={() => setNotesOpen((o) => !o)}
              className={`h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
                notesOpen ? "bg-accent/15 text-accent" : "hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
              }`}
              title={notesOpen ? "Close notes" : "Open notes"}
            >
              {notesOpen ? <X className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Notes drawer */}
      {isAdminOrOwner && notesOpen && (
        <div className="px-3 sm:px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card-hover)]">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value.slice(0, 5000))}
            placeholder="Private notes about this clipper (never visible to them)…"
            rows={3}
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent/40 focus:outline-none transition-colors resize-y"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold transition-all hover:bg-accent/85 active:scale-95 disabled:opacity-50"
            >
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[var(--text-muted)]">No messages yet. Say hi.</p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const gap = prev ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity;
              const showAvatar = !prev || prev.userId !== m.userId || gap > 5 * 60_000;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                  showAvatar={showAvatar}
                />
              );
            })}
            <div ref={anchorRef} />
          </div>
        )}
      </div>

      <MessageInput onSend={handleSend} placeholder="Message…" maxLength={5000} />
    </div>
  );
}
