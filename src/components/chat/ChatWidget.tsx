"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, ArrowLeft, Send, Plus, Search, Megaphone, UserRound, AlertTriangle, ChevronDown, Bot, Clock } from "lucide-react";
const WELCOME_MESSAGE = "Hey! I'm the Clippers HQ assistant. I can help with questions about campaigns, clips, earnings, payouts, and more. If you need to talk to a real person, just let me know and I'll connect you with our support team.";

// ─── Types ──────────────────────────────────────────────────

interface Participant {
  userId: string;
  name: string | null;
  username: string;
  image: string | null;
  role: string;
}

interface ConversationSummary {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  needsHumanSupport: boolean;
  updatedAt: string;
  participants: Participant[];
  lastMessage: { id: string; content: string; senderId: string; createdAt: string } | null;
  hasUnread: boolean;
}

interface CampaignChat {
  campaignId: string;
  campaignName: string;
  campaignPlatform: string;
  campaignImage: string | null;
  campaignStatus: string;
  conversationId: string | null;
  lastMessage: { id: string; content: string; senderId: string; createdAt: string } | null;
  hasUnread: boolean;
}

interface MessageData {
  id: string;
  content: string;
  senderId: string;
  isAI?: boolean;
  createdAt: string;
  sender: { id: string; name: string | null; username: string; image: string | null; role: string };
}

interface MessageableUser {
  id: string;
  name: string | null;
  username: string;
  image: string | null;
  role: string;
}

interface ThreadInfo {
  convoId: string;
  title: string;
  subtitle: string | null;
  avatarType: "campaign" | "user";
  avatarSrc: string | null;
  avatarName: string;
  otherRole: string | null;
  needsHumanSupport?: boolean;
}

// ─── Quick Suggestions (10 prompts, displayed as a grid) ────

const QUICK_SUGGESTIONS = [
  "I have a problem with my views",
  "I don't know what to post",
  "I'm having trouble hitting the USA market",
  "How do I post correctly?",
  "Can you review my posting strategy?",
  "Why is this video not performing?",
  "What kind of content should I make for this campaign?",
  "How do I hit more USA viewers?",
  "What's the best hook for this campaign?",
  "Can you help me improve this clip?",
];

// ─── Helpers ────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function getDisplayName(p: { name: string | null; username: string }): string {
  return p.name || p.username || "User";
}

function roleBadgeColor(role: string): string {
  if (role === "OWNER") return "text-amber-400";
  if (role === "ADMIN") return "text-blue-400";
  return "text-[var(--text-muted)]";
}

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 text-accent font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CampaignAvatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return <img src={src} alt={name} className="rounded-xl object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <Megaphone className="h-5 w-5 text-accent" />
    </div>
  );
}

// ─── Notification sounds disabled — all updates are silent ─────────────

function RoleBadge({ role }: { role: string }) {
  if (role === "OWNER") {
    return <span className="inline-block rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Owner</span>;
  }
  if (role === "ADMIN") {
    return <span className="inline-block rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">Admin</span>;
  }
  return null;
}

// ─── Main Widget ────────────────────────────────────────────

interface ChatWidgetProps {
  userId: string;
  role: string;
}

export function ChatWidget({ userId, role }: ChatWidgetProps) {
  const myId = userId;
  const isClipper = role === "CLIPPER";

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "thread" | "new">("list");

  // List data
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [campaignChats, setCampaignChats] = useState<CampaignChat[]>([]);

  // Thread data
  const [threadInfo, setThreadInfo] = useState<ThreadInfo | null>(null);
  const activeConvoIdRef = useRef<string>("");
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [needsHumanSupport, setNeedsHumanSupport] = useState(false);

  // Global — unread tracking
  const [unreadCount, setUnreadCount] = useState(0);
  const sseRef = useRef<EventSource | null>(null);

  // Chat filter for admin/owner
  type ChatFilter = "all" | "needs-agent" | "direct" | string; // string = campaignId
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  // Track if user has sent a message in current thread (hides suggestions)
  const [hasSentInThread, setHasSentInThread] = useState(false);

  // New conversation (admin/owner)
  const [messageableUsers, setMessageableUsers] = useState<MessageableUser[]>([]);
  const [userSearch, setUserSearch] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync
  useEffect(() => { activeConvoIdRef.current = threadInfo?.convoId || ""; }, [threadInfo]);

  // ── Handle unread count update (shared by SSE + polling fallback) ──
  // All updates are silent — no notification sounds
  const handleUnreadUpdate = useCallback((newCount: number) => {
    try { sessionStorage.setItem("chat_unread_count", String(newCount)); } catch {}
    setUnreadCount(newCount);

    // If viewing a thread, refresh messages on new incoming
    if (activeConvoIdRef.current && newCount > 0) {
      fetch(`/api/chat/conversations/${activeConvoIdRef.current}/messages`)
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setMessages(data); })
        .catch(() => {});
    }
  }, []);

  // ── Data fetchers ──

  const fetchCampaignChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/campaign-chats");
      const data = await res.json();
      if (Array.isArray(data)) setCampaignChats(data);
    } catch {}
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      if (Array.isArray(data)) setConversations(data);
    } catch {}
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread");
      const data = await res.json();
      handleUnreadUpdate(data.count || 0);
    } catch {}
  }, [handleUnreadUpdate]);

  const fetchMessages = useCallback(async (convoId: string) => {
    try {
      const res = await fetch(`/api/chat/conversations/${convoId}/messages`);
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch {}
  }, []);

  const markRead = useCallback(async (convoId: string) => {
    try { await fetch(`/api/chat/conversations/${convoId}/read`, { method: "POST" }); } catch {}
  }, []);

  const refreshList = useCallback(() => {
    if (isClipper) fetchCampaignChats(); else fetchConversations();
  }, [isClipper, fetchCampaignChats, fetchConversations]);

  // ── SSE: Real-time unread updates (not throttled in background tabs) ──
  useEffect(() => {
    if (!myId) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    function connectSSE() {
      // Close existing connection
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }

      try {
        const es = new EventSource("/api/chat/sse");
        sseRef.current = es;

        es.addEventListener("unread", (event) => {
          try {
            const data = JSON.parse(event.data);
            handleUnreadUpdate(data.count || 0);
          } catch {}
        });

        es.addEventListener("connected", () => {
          if (fallbackInterval) {
            clearInterval(fallbackInterval);
            fallbackInterval = null;
          }
        });

        es.onerror = () => {
          es.close();
          sseRef.current = null;
          // Start fallback polling while reconnecting
          if (!fallbackInterval) {
            fallbackInterval = setInterval(fetchUnread, 5000);
          }
          reconnectTimer = setTimeout(connectSSE, 3000);
        };
      } catch {
        // SSE not supported — use polling fallback
        if (!fallbackInterval) {
          fallbackInterval = setInterval(fetchUnread, 5000);
        }
      }
    }

    // Initial unread fetch + connect SSE
    fetchUnread();
    connectSSE();

    return () => {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, [myId, fetchUnread, handleUnreadUpdate]);

  // ── Fetch list on widget open ──
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setView("list");
      setThreadInfo(null);
      setMessages([]);
      activeConvoIdRef.current = "";
      refreshList();
    }
    prevOpenRef.current = open;
  }, [open, refreshList]);

  // ── Refresh active thread periodically (SSE handles notification, this handles message content) ──
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (open && view === "thread" && activeConvoIdRef.current) {
      const id = activeConvoIdRef.current;
      pollRef.current = setInterval(() => fetchMessages(id), 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, view, threadInfo?.convoId, fetchMessages]);

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Focus input ──
  useEffect(() => {
    if (view === "thread") setTimeout(() => inputRef.current?.focus(), 100);
  }, [view]);

  // ── Send message ──
  const handleSend = useCallback(async (content?: string) => {
    const text = (content || "").trim();
    if (!text) return;
    const convoId = activeConvoIdRef.current;
    if (!convoId) return;

    // Optimistic: add message to UI immediately
    const optimisticMsg: MessageData = {
      id: `opt-${Date.now()}`,
      content: text,
      senderId: myId,
      createdAt: new Date().toISOString(),
      sender: { id: myId, name: null, username: "You", image: null, role },
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setHasSentInThread(true);
    setSending(true);

    try {
      const res = await fetch(`/api/chat/conversations/${convoId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        // Replace optimistic with real data (includes auto-reply if any)
        await fetchMessages(convoId);
        refreshList();
        // If admin/owner replied, clear the needsHumanSupport banner
        if (!isClipper && threadInfo?.needsHumanSupport) {
          setThreadInfo((prev) => prev ? { ...prev, needsHumanSupport: false } : prev);
        }
      }
    } catch {}
    setSending(false);
  }, [myId, role, isClipper, threadInfo, fetchMessages, refreshList]);

  const sendFromInput = useCallback(async () => {
    const text = messageInput.trim();
    if (!text) return;
    setMessageInput("");
    await handleSend(text);
  }, [messageInput, handleSend]);

  // ── Open thread ──
  const openThreadWithInfo = useCallback(async (info: ThreadInfo) => {
    setThreadInfo(info);
    activeConvoIdRef.current = info.convoId;
    setMessages([]);
    setHasSentInThread(false);
    setView("thread");
    setLoadingMessages(true);
    await fetchMessages(info.convoId);
    setLoadingMessages(false);
    markRead(info.convoId);
    fetchUnread();
  }, [fetchMessages, markRead, fetchUnread]);

  // ── Clipper: open campaign chat ──
  const openCampaignChat = useCallback(async (chat: CampaignChat) => {
    const baseInfo = {
      title: chat.campaignName,
      subtitle: chat.campaignPlatform?.replace(/,\s*/g, " · ") || null,
      avatarType: "campaign" as const,
      avatarSrc: chat.campaignImage,
      avatarName: chat.campaignName,
      otherRole: null,
    };

    if (chat.conversationId) {
      await openThreadWithInfo({ ...baseInfo, convoId: chat.conversationId });
    } else {
      setThreadInfo({ ...baseInfo, convoId: "" });
      activeConvoIdRef.current = "";
      setMessages([]);
      setView("thread");
      setLoadingMessages(true);
      try {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: chat.campaignId }),
        });
        const data = await res.json();
        if (res.ok && data.id) {
          setThreadInfo({ ...baseInfo, convoId: data.id });
          activeConvoIdRef.current = data.id;
          await fetchMessages(data.id);
          markRead(data.id);
          fetchCampaignChats();
        }
      } catch {}
      setLoadingMessages(false);
    }
  }, [openThreadWithInfo, fetchMessages, markRead, fetchCampaignChats]);

  // ── Admin/Owner: open conversation ──
  const openConversation = useCallback(async (convo: ConversationSummary) => {
    const other = convo.participants.find((p) => p.userId !== myId);
    const displayUser = other || convo.participants.find((p) => p.role === "CLIPPER") || convo.participants[0];
    const info: ThreadInfo = {
      convoId: convo.id,
      title: displayUser ? getDisplayName(displayUser) : (convo.campaignName || "Chat"),
      subtitle: convo.campaignName
        ? `${displayUser?.role || ""} · ${convo.campaignName}`.replace(/^ · /, "")
        : displayUser?.role || null,
      avatarType: "user",
      avatarSrc: displayUser?.image || null,
      avatarName: displayUser ? getDisplayName(displayUser) : "?",
      otherRole: displayUser?.role || null,
      needsHumanSupport: convo.needsHumanSupport,
    };
    await openThreadWithInfo(info);
  }, [myId, openThreadWithInfo]);

  // ── New conversation (admin/owner) ──
  const openNewConversation = useCallback(async () => {
    setView("new");
    setUserSearch("");
    try {
      const res = await fetch("/api/chat/messageable-users");
      const data = await res.json();
      if (Array.isArray(data)) setMessageableUsers(data);
    } catch {}
  }, []);

  const startConversation = useCallback(async (toUserId: string) => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        await fetchConversations();
        const otherP = data.participants?.find((p: any) => (p.userId || p.user?.id) !== myId);
        const user = otherP?.user || otherP;
        const info: ThreadInfo = {
          convoId: data.id,
          title: user ? getDisplayName(user) : "Chat",
          subtitle: user?.role || null,
          avatarType: "user",
          avatarSrc: user?.image || null,
          avatarName: user ? getDisplayName(user) : "?",
          otherRole: user?.role || null,
        };
        await openThreadWithInfo(info);
      }
    } catch {}
  }, [myId, fetchConversations, openThreadWithInfo]);

  const goBackToList = useCallback(() => {
    setView("list");
    setThreadInfo(null);
    activeConvoIdRef.current = "";
    setMessages([]);
    fetchUnread();
    refreshList();
  }, [fetchUnread, refreshList]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFromInput(); }
  };

  if (!myId) return null;

  const filteredUsers = messageableUsers.filter((u) => {
    const q = userSearch.toLowerCase();
    return (u.name?.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  });

  const canSend = !!(threadInfo?.convoId);

  return (
    <>
      {/* Floating launcher — slightly larger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-4 right-4 lg:bottom-6 lg:right-6 z-50 flex h-12 w-12 lg:h-[60px] lg:w-[60px] items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-accent shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Chat panel — fullscreen-ish up to md, then floating desktop panel */}
      <div
        className={`fixed z-50 flex flex-col overflow-hidden border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-elevated)] transition-all duration-300 origin-bottom-right
          inset-0 rounded-none
          md:inset-auto md:bottom-3 md:right-3 md:rounded-2xl md:w-[420px] md:h-[min(600px,calc(100vh-120px))]
          lg:bottom-[88px] lg:right-6 lg:w-[460px] lg:h-[660px] ${
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        {/* ─── List View ─── */}
        {view === "list" && (
          <>
            <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-3.5">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {isClipper ? "Campaign Support" : "Messages"}
              </h3>
              <div className="flex items-center gap-1">
                {!isClipper && (
                  <button onClick={openNewConversation}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                    title="New conversation">
                    <Plus className="h-5 w-5" />
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
                  title="Close chat">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Clipper: campaign list */}
              {isClipper && (
                campaignChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                    <Megaphone className="h-12 w-12 text-[var(--text-muted)] mb-3 opacity-40" />
                    <p className="text-sm text-[var(--text-muted)]">No campaigns joined yet</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Join a campaign to start chatting with support.</p>
                  </div>
                ) : (
                  campaignChats.map((chat) => (
                    <button key={chat.campaignId} onClick={() => openCampaignChat(chat)}
                      className={`flex w-full items-center gap-4 px-5 py-[18px] text-left transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] border-b border-[var(--border-color)] last:border-b-0 ${chat.hasUnread ? "bg-accent/5" : ""}`}>
                      <div className="relative flex-shrink-0">
                        <CampaignAvatar src={chat.campaignImage} name={chat.campaignName} size={48} />
                        {chat.hasUnread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border-2 border-[var(--bg-card)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[15px] font-medium truncate ${chat.hasUnread ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                            {chat.campaignName}
                          </span>
                          {chat.lastMessage && (
                            <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{formatTime(chat.lastMessage.createdAt)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-[var(--text-muted)]">{chat.campaignPlatform?.replace(/,\s*/g, " · ")}</span>
                          {chat.lastMessage ? (
                            <span className={`text-xs truncate ${chat.hasUnread ? "text-[var(--text-secondary)] font-medium" : "text-[var(--text-muted)]"}`}>
                              · {chat.lastMessage.senderId === myId ? "You: " : ""}{chat.lastMessage.content}
                            </span>
                          ) : (
                            <span className="text-xs text-accent">· Tap to start chatting</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )
              )}

              {/* Admin/Owner: conversation list with filter */}
              {!isClipper && (() => {
                // Build unique campaign names for filter
                const campaignNames = new Map<string, string>();
                conversations.forEach((c) => {
                  if (c.campaignId && c.campaignName) campaignNames.set(c.campaignId, c.campaignName);
                });
                const needsAgentCount = conversations.filter((c) => c.needsHumanSupport).length;

                // Filter conversations
                let filtered = conversations;
                if (chatFilter === "needs-agent") filtered = conversations.filter((c) => c.needsHumanSupport);
                else if (chatFilter === "direct") filtered = conversations.filter((c) => !c.campaignId);
                else if (chatFilter !== "all") filtered = conversations.filter((c) => c.campaignId === chatFilter);

                // Sort: needsHumanSupport first, then by updatedAt
                filtered = [...filtered].sort((a, b) => {
                  if (a.needsHumanSupport && !b.needsHumanSupport) return -1;
                  if (!a.needsHumanSupport && b.needsHumanSupport) return 1;
                  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
                });

                return (
                  <>
                    {/* Filter bar */}
                    {conversations.length > 0 && (
                      <div className="relative px-4 py-2.5 border-b border-[var(--border-subtle)]">
                        <button onClick={() => setFilterOpen(!filterOpen)}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer w-full">
                          <span className="flex-1 text-left truncate">
                            {chatFilter === "all" ? "All Conversations" : chatFilter === "needs-agent" ? `Needs Agent (${needsAgentCount})` : chatFilter === "direct" ? "Direct Messages" : `Campaign: ${campaignNames.get(chatFilter) || "Unknown"}`}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
                        </button>
                        {filterOpen && (
                          <div className="absolute left-4 right-4 top-full mt-1 z-20 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-elevated)] overflow-hidden">
                            {[
                              { key: "all", label: "All Conversations" },
                              { key: "needs-agent", label: `Needs Agent${needsAgentCount > 0 ? ` (${needsAgentCount})` : ""}` },
                              { key: "direct", label: "Direct Messages" },
                              ...Array.from(campaignNames).map(([id, name]) => ({ key: id, label: `Campaign: ${name}` })),
                            ].map((opt) => (
                              <button key={opt.key} onClick={() => { setChatFilter(opt.key); setFilterOpen(false); }}
                                className={`w-full px-4 py-2.5 text-left text-xs transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] ${chatFilter === opt.key ? "text-accent font-medium" : "text-[var(--text-secondary)]"}`}>
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {filtered.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                        <MessageCircle className="h-12 w-12 text-[var(--text-muted)] mb-3 opacity-40" />
                        <p className="text-sm text-[var(--text-muted)]">{conversations.length === 0 ? "No conversations yet" : "No matching conversations"}</p>
                        {conversations.length === 0 && (
                          <button onClick={openNewConversation} className="mt-3 text-sm text-accent hover:underline cursor-pointer">
                            Start a conversation
                          </button>
                        )}
                      </div>
                    ) : (
                      filtered.map((convo) => {
                        const other = convo.participants.find((p) => p.userId !== myId)
                          || convo.participants.find((p) => p.role === "CLIPPER")
                          || convo.participants[0];
                        if (!other) return null;
                        const isAgent = convo.needsHumanSupport;
                        return (
                          <button key={convo.id} onClick={() => openConversation(convo)}
                            className={`flex w-full items-center gap-4 px-5 py-[18px] text-left transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] border-b border-[var(--border-color)] last:border-b-0 ${isAgent ? "bg-red-500/5 border-l-2 border-l-red-400" : convo.hasUnread ? "bg-accent/5" : ""}`}>
                            <div className="relative flex-shrink-0">
                              <Avatar src={other.image} name={getDisplayName(other)} size={48} />
                              {isAgent ? (
                                <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-[var(--bg-card)] flex items-center justify-center">
                                  <span className="text-[6px] text-white font-bold">!</span>
                                </span>
                              ) : convo.hasUnread ? (
                                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent border-2 border-[var(--bg-card)]" />
                              ) : null}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[15px] font-medium truncate ${convo.hasUnread || isAgent ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                                    {getDisplayName(other)}
                                  </span>
                                  {isAgent && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-400 flex-shrink-0">
                                      <AlertTriangle className="h-2.5 w-2.5" /> Agent
                                    </span>
                                  )}
                                </div>
                                {convo.lastMessage && (
                                  <span className="text-xs text-[var(--text-muted)] flex-shrink-0">{formatTime(convo.lastMessage.createdAt)}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-xs ${roleBadgeColor(other.role)}`}>{other.role}</span>
                                {convo.campaignName && <span className="text-xs text-[var(--text-muted)]">· {convo.campaignName}</span>}
                                {convo.lastMessage && (
                                  <span className={`text-xs truncate ${convo.hasUnread ? "text-[var(--text-secondary)] font-medium" : "text-[var(--text-muted)]"}`}>
                                    · {convo.lastMessage.senderId === myId ? "You: " : ""}{convo.lastMessage.content}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}

        {/* ─── Thread View ─── */}
        {view === "thread" && (
          <>
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-5 py-3.5">
              <button onClick={goBackToList}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </button>
              {threadInfo && (
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {threadInfo.avatarType === "campaign"
                    ? <CampaignAvatar src={threadInfo.avatarSrc} name={threadInfo.avatarName} size={40} />
                    : <Avatar src={threadInfo.avatarSrc} name={threadInfo.avatarName} size={40} />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">{threadInfo.title}</p>
                    {threadInfo.subtitle && (
                      <p className={`text-xs ${threadInfo.otherRole ? roleBadgeColor(threadInfo.otherRole) : "text-[var(--text-muted)]"}`}>
                        {threadInfo.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <button onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer flex-shrink-0"
                title="Close chat">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Needs agent banner — admin/owner view */}
            {!isClipper && threadInfo?.needsHumanSupport && (
              <div className="flex items-center gap-2.5 px-5 py-2.5 border-b border-red-500/20 bg-red-500/5">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400 font-medium">This user requested to speak with an agent</p>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col h-full px-1">
                  {isClipper ? (
                    <div className="flex-1 flex flex-col justify-center">
                      {/* Welcome message */}
                      <div className="flex justify-start mb-4">
                        <div className="flex items-end gap-2 max-w-[85%]">
                          <div className="flex-shrink-0 w-8">
                            <div className="rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold" style={{ width: 28, height: 28, fontSize: 11 }}>AI</div>
                          </div>
                          <div className="rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-bl-md">
                            <p className="whitespace-pre-wrap break-words">{WELCOME_MESSAGE}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mb-4 text-center">
                        Pick a question below or type your own.
                      </p>
                      {/* Quick suggestions as a vertical card list — no horizontal scrolling */}
                      <div className="space-y-2">
                        {QUICK_SUGGESTIONS.slice(0, 6).map((suggestion) => (
                          <button key={suggestion} onClick={() => handleSend(suggestion)}
                            disabled={!canSend}
                            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] hover:border-accent/30 transition-all cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed">
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-[var(--text-muted)]">No messages yet. Say hello!</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    // System messages: centered, different style
                    if (msg.senderId === "system") {
                      const isTransfer = msg.id.startsWith("sys-human");
                      return (
                        <div key={msg.id} className="flex justify-center py-2">
                          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--bg-input)] rounded-lg px-4 py-2.5 max-w-[85%] border border-[var(--border-subtle)]">
                            {isTransfer
                              ? <Clock className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                              : <Bot className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
                            }
                            <span className="italic">{msg.content}</span>
                          </div>
                        </div>
                      );
                    }
                    const isMine = msg.senderId === myId;
                    const isOptimistic = msg.id.startsWith("opt-");
                    // AI message: uses the isAI field from the database
                    const isAIMsg = !!msg.isAI && !isMine;
                    // New sender group: different sender OR AI status changed (AI→human or human→AI from same senderId)
                    const prev = idx > 0 ? messages[idx - 1] : null;
                    const isNewSenderGroup = !prev
                      || prev.senderId === "system"
                      || prev.senderId !== msg.senderId
                      || (!!prev.isAI !== !!msg.isAI);
                    const showAvatar = !isMine && isNewSenderGroup;
                    // Human admin/owner message (NOT AI): show their name + role badge
                    const showRole = !isMine && isNewSenderGroup && !isAIMsg && (msg.sender.role === "ADMIN" || msg.sender.role === "OWNER");
                    return (
                      <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div className={`flex items-end gap-2 max-w-[85%] ${isMine ? "flex-row-reverse" : ""}`}>
                          {!isMine && (
                            <div className="flex-shrink-0 w-8">
                              {showAvatar && (isAIMsg
                                ? <div className="rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0" style={{ width: 28, height: 28 }}><Bot className="h-4 w-4 text-white" /></div>
                                : <Avatar src={msg.sender.image} name={getDisplayName(msg.sender)} size={28} />
                              )}
                            </div>
                          )}
                          <div>
                            {/* Label: AI Assistant for AI messages */}
                            {isAIMsg && showAvatar && (
                              <div className="mb-1 ml-0.5 flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-blue-400">AI Assistant</span>
                              </div>
                            )}
                            {/* Label: name + role badge for real human admin/owner */}
                            {showRole && (
                              <div className="mb-1 ml-0.5 flex items-center gap-1.5">
                                <span className="text-[11px] font-medium text-[var(--text-muted)]">{getDisplayName(msg.sender)}</span>
                                <RoleBadge role={msg.sender.role} />
                              </div>
                            )}
                            <div className={`rounded-2xl px-4 py-3 text-[14.5px] leading-relaxed ${
                              isMine
                                ? `bg-accent text-white rounded-br-md ${isOptimistic ? "opacity-70" : ""}`
                                : "bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-bl-md"
                            }`}>
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                              <p className={`text-[10px] mt-0.5 ${isMine ? "text-white/60" : "text-[var(--text-muted)]"}`}>
                                {formatTimestamp(msg.createdAt)}
                              </p>
                            </div>
                            {/* "Talk to a human" link below AI messages for clippers */}
                            {isClipper && !isMine && idx === messages.length - 1 && (
                              <button
                                onClick={() => {
                                  setNeedsHumanSupport(true);
                                  handleSend("connect me");
                                  // Insert a visible system-style feedback message
                                  setMessages((prev) => [...prev, {
                                    id: `sys-human-${Date.now()}`,
                                    content: "Connecting you with support. Someone will be with you shortly.",
                                    senderId: "system",
                                    isAI: false,
                                    createdAt: new Date().toISOString(),
                                    sender: { id: "system", name: "System", username: "System", image: null, role: "SYSTEM" },
                                  }]);
                                }}
                                className="flex items-center gap-1 mt-1 ml-0.5 text-[11px] text-accent hover:underline cursor-pointer"
                              >
                                <UserRound className="h-3 w-3" />
                                Talk to a human instead
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Typing indicator while waiting for AI response */}
                  {isClipper && sending && (
                    <div className="flex justify-start">
                      <div className="flex items-end gap-2 max-w-[85%]">
                        <div className="flex-shrink-0 w-8">
                          <div className="rounded-full bg-blue-500 flex items-center justify-center" style={{ width: 28, height: 28 }}>
                            <Bot className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                        <div className="rounded-2xl px-4 py-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-bl-md">
                          <div className="typing-dots"><span /><span /><span /></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Quick suggestion chips — only before first message in conversation */}
            {isClipper && canSend && messages.length === 0 && !hasSentInThread && (
              <div className="border-t border-[var(--border-subtle)] px-4 py-2.5 flex flex-wrap gap-2">
                {QUICK_SUGGESTIONS.slice(0, 4).map((s) => (
                  <button key={s} onClick={() => handleSend(s)}
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-accent hover:border-accent/30 transition-all cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Return to AI button — owner/admin only, after they've responded */}
            {!isClipper && threadInfo && !threadInfo.needsHumanSupport && messages.length > 0 && (
              <div className="border-t border-[var(--border-subtle)] px-5 py-2 flex justify-center">
                <button
                  onClick={() => {
                    // needsHumanSupport is already false (owner responded) — this is a visual confirmation
                    // The backend already cleared needsHumanSupport when owner sent a message
                    // Next clipper message will be handled by AI
                    setThreadInfo((prev) => prev ? { ...prev, needsHumanSupport: false } : prev);
                    // Insert a visible system-style feedback message
                    setMessages((prev) => [...prev, {
                      id: `sys-ai-${Date.now()}`,
                      content: "AI support has been resumed.",
                      senderId: "system",
                      isAI: false,
                      createdAt: new Date().toISOString(),
                      sender: { id: "system", name: "System", username: "System", image: null, role: "SYSTEM" },
                    }]);
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-accent hover:bg-accent/5 transition-colors cursor-pointer"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Resume AI support
                </button>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-[var(--border-color)] px-5 py-3.5">
              <div className="flex items-end gap-2.5">
                <textarea ref={inputRef} value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={isClipper ? "Ask about this campaign..." : "Type a message..."}
                  rows={1}
                  disabled={!canSend}
                  className="flex-1 resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 text-[14.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-colors disabled:opacity-40"
                  style={{ maxHeight: 120 }} />
                <button onClick={sendFromInput} disabled={!messageInput.trim() || sending || !canSend}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex-shrink-0">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── New Conversation (Admin/Owner) ─── */}
        {view === "new" && !isClipper && (
          <>
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] px-5 py-3.5">
              <button onClick={goBackToList}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex-1">New conversation</h3>
              <button onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer flex-shrink-0"
                title="Close chat">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-3.5 py-2.5">
                <Search className="h-4 w-4 text-[var(--text-muted)]" />
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-[var(--text-muted)]">
                    {messageableUsers.length === 0 ? "No users available" : "No results found"}
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button key={user.id} onClick={() => startConversation(user.id)}
                    className="flex w-full items-center gap-4 px-5 py-[18px] text-left transition-colors cursor-pointer hover:bg-[var(--bg-card-hover)] border-b border-[var(--border-color)] last:border-b-0">
                    <Avatar src={user.image} name={getDisplayName(user)} size={44} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-[var(--text-primary)] truncate">{getDisplayName(user)}</p>
                      <p className={`text-xs ${roleBadgeColor(user.role)}`}>{user.role}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
