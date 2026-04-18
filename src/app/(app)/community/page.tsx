"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle, Megaphone, Trophy, Phone, Bell, BellOff,
  Loader2, ChevronRight, Settings, AlertCircle, Users as UsersIcon,
} from "lucide-react";
import { CampaignImage } from "@/components/ui/campaign-image";
import { ChannelChat } from "@/components/community/ChannelChat";
import { Leaderboard } from "@/components/community/Leaderboard";
import { TicketPanel } from "@/components/community/TicketPanel";
import { CallScheduler } from "@/components/community/CallScheduler";
import { ActivityFeed } from "@/components/community/ActivityFeed";
import { CommunityErrorBoundary } from "@/components/community/CommunityErrorBoundary";
import { toast } from "@/lib/toast";

interface Campaign {
  id: string;
  name: string;
  imageUrl?: string | null;
  platform?: string | null;
  status?: string | null;
  totalUnread?: number;
}

interface Channel {
  id: string;
  name: string;
  type: string;
  unread: number;
  sortOrder: number;
}

interface Call {
  id: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  duration: number;
  status: string;
  isGlobal: boolean;
  campaignId?: string | null;
}

const channelIconFor = (type: string) => {
  if (type === "announcement") return Megaphone;
  if (type === "leaderboard") return Trophy;
  if (type === "voice") return Phone;
  return MessageCircle;
};

export default function CommunityPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const viewerId = (session?.user as SessionUser | undefined)?.id || "";
  const viewerRole = ((session?.user as SessionUser | undefined)?.role || "CLIPPER") as
    | "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";

  // Client isolation — community isn't for brands.
  useEffect(() => {
    if (session && viewerRole === "CLIENT") router.replace("/client");
  }, [session, viewerRole, router]);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [muted, setMuted] = useState<boolean>(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"channel" | "ticket" | "call" | "activity">("channel");
  const [upcomingCall, setUpcomingCall] = useState<Call | null>(null);
  const [pastCalls, setPastCalls] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);

  // URL-driven initial tab (e.g., ?tab=ticket from "transfer to human" flow).
  useEffect(() => {
    const tab = searchParams.get("tab");
    const ticketId = searchParams.get("ticketId");
    const callId = searchParams.get("callId");
    const cid = searchParams.get("campaignId");
    if (cid) setSelectedCampaignId(cid);
    if (tab === "ticket" || ticketId) setViewMode("ticket");
    if (tab === "voice" || callId) setViewMode("call");
  }, [searchParams]);

  const isAdmin = viewerRole === "OWNER" || viewerRole === "ADMIN";

  // --- Campaign list -----------------------------------------------
  // Uses the dedicated /api/community/campaigns endpoint — handles role-based filtering
  // server-side AND returns per-campaign unread totals in one round-trip.
  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/community/campaigns");
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
      setCampaigns(list);
      if (!selectedCampaignId && list.length > 0) {
        const first = list[0].id;
        setSelectedCampaignId(first);
        // Mirror the auto-selection in the URL so the sidebar can highlight it.
        if (typeof window !== "undefined") {
          try {
            const params = new URLSearchParams(window.location.search);
            if (!params.get("campaignId")) {
              params.set("campaignId", first);
              window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
            }
          } catch {}
        }
      }
    } catch {}
    setLoadingCampaigns(false);
  }, [selectedCampaignId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Refresh campaign unread counts whenever a channel message arrives.
  useEffect(() => {
    const handler = () => { loadCampaigns(); };
    window.addEventListener("sse:channel_message", handler);
    return () => window.removeEventListener("sse:channel_message", handler);
  }, [loadCampaigns]);

  // --- Channels for the selected campaign ---------------------------
  const loadChannels = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoadingChannels(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/channels?campaignId=${encodeURIComponent(cid)}`);
      if (res.status === 403) {
        setError("You don't have access to this campaign's community.");
        setChannels([]);
        setMuted(false);
      } else if (!res.ok) {
        setError("Couldn't load this campaign's community. Try again in a moment.");
        setChannels([]);
        setMuted(false);
      } else {
        const data = await res.json();
        const list: Channel[] = data.channels || [];
        setChannels(list);
        setMuted(!!data.muted);
        if (list.length > 0) {
          // If current selection not in new list, pick General or first.
          setSelectedChannelId((prev) => {
            if (list.some((c) => c.id === prev)) return prev;
            const general = list.find((c) => c.type === "general");
            return (general || list[0]).id;
          });
        } else {
          setSelectedChannelId("");
        }
      }
    } catch {
      setError("Network error. Please refresh.");
      setChannels([]);
    }
    setLoadingChannels(false);
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadChannels(selectedCampaignId);
    // reset view when campaign changes (unless URL pinned it)
    if (!searchParams.get("tab") && !searchParams.get("ticketId") && !searchParams.get("callId")) {
      setViewMode("channel");
    }
  }, [selectedCampaignId, loadChannels, searchParams]);

  // Ably: refresh channel unread counts when a new message arrives.
  const fetchingRef = useRef(false);
  useEffect(() => {
    const handler = async () => {
      if (fetchingRef.current || !selectedCampaignId) return;
      fetchingRef.current = true;
      try { await loadChannels(selectedCampaignId); } finally { fetchingRef.current = false; }
    };
    window.addEventListener("sse:channel_message", handler);
    return () => window.removeEventListener("sse:channel_message", handler);
  }, [selectedCampaignId, loadChannels]);

  // Upcoming call for the current campaign.
  const loadCalls = useCallback(async (cid: string) => {
    if (!cid) { setUpcomingCall(null); return; }
    try {
      const res = await fetch(`/api/community/calls?campaignId=${encodeURIComponent(cid)}`);
      if (!res.ok) { setUpcomingCall(null); return; }
      const data = await res.json();
      const next = (data.upcoming || [])
        .filter((c: any) => c.status !== "cancelled")
        .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
      setUpcomingCall(next || null);
    } catch { setUpcomingCall(null); }
  }, []);

  useEffect(() => {
    if (selectedCampaignId) loadCalls(selectedCampaignId);
  }, [selectedCampaignId, loadCalls]);

  // Past calls — admin only.
  useEffect(() => {
    if (!selectedCampaignId || !isAdmin) { setPastCalls([]); return; }
    fetch(`/api/community/calls?campaignId=${encodeURIComponent(selectedCampaignId)}&status=ended,completed,cancelled`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPastCalls(Array.isArray(data) ? data : []))
      .catch(() => setPastCalls([]));
  }, [selectedCampaignId, isAdmin]);

  // Unresolved ticket count for the admin Tickets-tab badge.
  const [unresolvedTicketCount, setUnresolvedTicketCount] = useState(0);
  useEffect(() => {
    if (!selectedCampaignId || !isAdmin) { setUnresolvedTicketCount(0); return; }
    let cancelled = false;
    fetch(`/api/community/tickets?campaignId=${encodeURIComponent(selectedCampaignId)}&limit=100`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: any[] = Array.isArray(data?.tickets) ? data.tickets : [];
        setUnresolvedTicketCount(list.filter((t) => t.status !== "resolved").length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCampaignId, isAdmin]);
  // Refresh the count when a new ticket message arrives.
  useEffect(() => {
    const handler = () => {
      if (!selectedCampaignId || !isAdmin) return;
      fetch(`/api/community/tickets?campaignId=${encodeURIComponent(selectedCampaignId)}&limit=100`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const list: any[] = Array.isArray(data?.tickets) ? data.tickets : [];
          setUnresolvedTicketCount(list.filter((t) => t.status !== "resolved").length);
        })
        .catch(() => {});
    };
    window.addEventListener("sse:ticket_message", handler);
    return () => window.removeEventListener("sse:ticket_message", handler);
  }, [selectedCampaignId, isAdmin]);

  // Keep the page's call state in sync with server-side lifecycle events.
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail?.callId || !upcomingCall) return;
      if (detail.callId !== upcomingCall.id) return;
      if (detail.status === "ended" || detail.status === "completed" || detail.status === "cancelled") {
        setUpcomingCall(null);
        if (isAdmin && selectedCampaignId) {
          fetch(`/api/community/calls?campaignId=${encodeURIComponent(selectedCampaignId)}&status=ended,completed,cancelled`)
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => setPastCalls(Array.isArray(data) ? data : []))
            .catch(() => {});
        }
        if (viewMode === "call") {
          setViewMode("channel");
          toast.info("The host ended the call");
        }
      } else if (detail.status === "live") {
        setUpcomingCall((prev) => (prev && prev.id === detail.callId ? { ...prev, status: "live" } : prev));
      }
    };
    window.addEventListener("sse:voice_call_status", handler);
    return () => window.removeEventListener("sse:voice_call_status", handler);
  }, [upcomingCall, viewMode, isAdmin, selectedCampaignId]);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  );

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );

  // Open the persistent voice room (hosted by app-layout).
  const openVoice = (c: Call) => {
    const opener = (window as any).__openVoiceRoom;
    if (typeof opener === "function") {
      opener({ ...c, campaignName: selectedCampaign?.name });
    }
  };

  // Keep the URL ?campaignId=… in sync with the selected campaign so the
  // sidebar's community dropdown can highlight the active one and back/forward
  // navigation lands on the right campaign. history.replaceState (not push)
  // avoids polluting the back stack with every campaign switch.
  const handleCampaignSelect = (id: string) => {
    setSelectedCampaignId(id);
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        params.set("campaignId", id);
        // Strip ticket/call params so switching campaigns doesn't carry over
        // a ticketId/callId that belongs to the previous campaign.
        params.delete("ticketId");
        params.delete("callId");
        params.delete("tab");
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      } catch {}
    }
  };

  // Mute toggle — also fires a local window event so DmToast (and any future listener)
  // updates its mute set without a refetch.
  const toggleMute = async () => {
    if (!selectedCampaignId) return;
    try {
      if (muted) {
        await fetch("/api/community/mute", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: selectedCampaignId }),
        });
        setMuted(false);
        window.dispatchEvent(new CustomEvent("community:mute_changed", { detail: { campaignId: selectedCampaignId, muted: false } }));
        toast.success("Unmuted");
      } else {
        await fetch("/api/community/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId: selectedCampaignId }),
        });
        setMuted(true);
        window.dispatchEvent(new CustomEvent("community:mute_changed", { detail: { campaignId: selectedCampaignId, muted: true } }));
        toast.success("Muted announcements");
      }
    } catch { toast.error("Could not update mute"); }
  };

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100vh-56px)] lg:h-[calc(100vh-56px)] min-h-0 bg-[var(--bg-primary)]">
      {/* LEFT PANEL — campaign list */}
      <aside className="hidden md:flex w-72 lg:w-80 flex-shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-card)] flex-col min-h-0">
        <header className="px-4 py-4 border-b border-[var(--border-color)] flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-accent" />
          <h1 className="text-base lg:text-lg font-bold text-[var(--text-primary)]">Community</h1>
        </header>
        <div className="flex-1 overflow-y-auto min-h-0 p-2">
          {loadingCampaigns ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {isAdmin ? "No campaigns yet." : "Join a campaign to see its community."}
              </p>
              {!isAdmin && (
                <Link href="/campaigns" className="inline-block mt-3 text-xs text-accent hover:underline">
                  Browse campaigns →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {campaigns.map((c) => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  active={c.id === selectedCampaignId}
                  onSelect={() => handleCampaignSelect(c.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE — campaign list only; drill into /community/[id] */}
      <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-1">
        <header className="flex items-center gap-2 pb-3">
          <MessageCircle className="h-4 w-4 text-accent" />
          <h1 className="text-base font-bold text-[var(--text-primary)]">Community</h1>
        </header>
        {loadingCampaigns ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-10">
            {isAdmin ? "No campaigns yet." : "Join a campaign to see its community."}
          </p>
        ) : (
          campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/community/${c.id}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-accent/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg overflow-hidden border border-[var(--border-subtle)] flex-shrink-0">
                <CampaignImage src={c.imageUrl} name={c.name} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{c.platform}</p>
              </div>
              {(c.totalUnread || 0) > 0 && (
                <span className="h-5 min-w-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center px-1.5 tabular-nums flex-shrink-0">
                  {(c.totalUnread || 0) > 99 ? "99+" : c.totalUnread}
                </span>
              )}
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
            </Link>
          ))
        )}
      </div>

      {/* RIGHT PANEL — campaign detail */}
      <section className="hidden md:flex flex-1 min-w-0 flex-col min-h-0">
        {!selectedCampaign ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-10 w-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
              <p className="text-sm text-[var(--text-muted)]">Select a campaign to start</p>
            </div>
          </div>
        ) : (
          <>
            {/* Top bar */}
            <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
              <div className="h-9 w-9 rounded-lg overflow-hidden border border-[var(--border-subtle)] flex-shrink-0">
                <CampaignImage src={selectedCampaign.imageUrl} name={selectedCampaign.name} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm lg:text-base font-semibold text-[var(--text-primary)] truncate">
                  {selectedCampaign.name}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">{selectedCampaign.platform}</p>
              </div>
              {isAdmin && (
                <CallScheduler campaignId={selectedCampaignId} onScheduled={() => loadCalls(selectedCampaignId)} />
              )}
              <button
                onClick={toggleMute}
                className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors ${
                  muted ? "bg-amber-500/10 text-amber-400" : "hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
                }`}
                title={muted ? "Unmute announcements" : "Mute announcements"}
              >
                {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </button>
              {isAdmin && (
                <button className="hidden lg:flex h-9 w-9 rounded-lg items-center justify-center hover:bg-[var(--bg-input)] text-[var(--text-muted)] transition-colors" title="Settings">
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </header>

            {/* Tabs row: channels + ticket + (upcoming call) */}
            <div className="flex gap-1 items-center border-b border-[var(--border-color)] px-3 py-2 bg-[var(--bg-card)] overflow-x-auto">
              {loadingChannels ? (
                <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
              ) : (
                channels.map((ch) => {
                  const Icon = channelIconFor(ch.type);
                  const active = viewMode === "channel" && selectedChannelId === ch.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => { setViewMode("channel"); setSelectedChannelId(ch.id); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? "bg-accent text-white"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {ch.name}
                      {ch.unread > 0 && !active && (
                        <span className="h-4 min-w-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
                          {ch.unread > 99 ? "99+" : ch.unread}
                        </span>
                      )}
                    </button>
                  );
                })
              )}

              <button
                onClick={() => setViewMode("ticket")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${
                  viewMode === "ticket"
                    ? "bg-accent text-white"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {isAdmin ? "Tickets" : "Direct Messages"}
                {isAdmin && unresolvedTicketCount > 0 && viewMode !== "ticket" && (
                  <span className="ml-0.5 h-4 min-w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 tabular-nums">
                    {unresolvedTicketCount > 99 ? "99+" : unresolvedTicketCount}
                  </span>
                )}
              </button>

              {isAdmin && (
                <button
                  onClick={() => setViewMode("activity")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === "activity"
                      ? "bg-accent text-white"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                  }`}
                >
                  <UsersIcon className="h-3.5 w-3.5" />
                  Activity
                </button>
              )}

              {(upcomingCall || isAdmin) && (
                <button
                  onClick={() => setViewMode("call")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors whitespace-nowrap ${
                    viewMode === "call"
                      ? "bg-accent text-white"
                      : upcomingCall
                        ? "text-amber-400 hover:bg-amber-500/10"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {isAdmin ? "Calls" : "Voice"}
                </button>
              )}
            </div>

            {/* Content area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <CommunityErrorBoundary>
                {error ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center h-full">
                    <AlertCircle className="h-10 w-10 text-red-400 mb-3 opacity-80" />
                    <p className="text-sm text-[var(--text-primary)] font-medium mb-1">Can't open this community</p>
                    <p className="text-xs text-[var(--text-muted)] max-w-xs mb-4">{error}</p>
                    <button
                      onClick={() => router.push("/community")}
                      className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/85 transition-colors"
                    >
                      Back to Community
                    </button>
                  </div>
                ) : viewMode === "call" ? (
                  <div className="h-full overflow-y-auto p-6">
                    {!upcomingCall ? (
                      <div className="flex flex-col items-center justify-center py-16">
                        <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                          <Phone className="h-8 w-8 text-accent opacity-50" />
                        </div>
                        <p className="text-sm text-[var(--text-muted)] mb-1">No calls scheduled</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {isAdmin ? "Use the schedule button above to create one" : "Check back later"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="h-20 w-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
                          <Phone className="h-10 w-10 text-accent" />
                        </div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2 text-center">{upcomingCall.title}</h2>
                        {upcomingCall.description && (
                          <p className="text-sm text-[var(--text-muted)] mb-4 text-center max-w-md whitespace-pre-wrap">{upcomingCall.description}</p>
                        )}
                        <p className="text-sm text-[var(--text-muted)] mb-6">{selectedCampaign?.name}</p>

                        {upcomingCall.status === "live" ? (
                          <button
                            onClick={() => openVoice(upcomingCall)}
                            className="px-8 py-3 rounded-xl bg-accent text-white text-base font-semibold hover:bg-accent/80 transition-colors flex items-center gap-2"
                          >
                            <Phone className="h-5 w-5" />
                            Join Call
                          </button>
                        ) : isAdmin ? (
                          <button
                            onClick={() => openVoice(upcomingCall)}
                            className="px-8 py-3 rounded-xl bg-accent text-white text-base font-semibold hover:bg-accent/80 transition-colors flex items-center gap-2"
                          >
                            <Phone className="h-5 w-5" />
                            Start Call
                          </button>
                        ) : (
                          <div className="text-center">
                            <p className="text-sm text-amber-400 mb-2">Waiting for host to start</p>
                            <p className="text-xs text-[var(--text-muted)]">You'll be able to join once the host starts the call</p>
                          </div>
                        )}

                        {upcomingCall.status === "scheduled" && (
                          <div className="mt-6 px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)]">
                            <p className="text-xs text-[var(--text-muted)]">Scheduled for</p>
                            <p className="text-sm font-medium text-[var(--text-primary)]">
                              {new Date(upcomingCall.scheduledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                            {new Date(upcomingCall.scheduledAt).getTime() <= Date.now() && (
                              <p className="text-xs text-amber-400 mt-1 font-medium">Starting soon…</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {isAdmin && pastCalls.length > 0 && (
                      <div className="mt-8 border-t border-[var(--border-color)] pt-6 max-w-2xl mx-auto">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                          <Phone className="h-4 w-4 text-[var(--text-muted)]" />
                          Past Calls
                        </h3>
                        <div className="space-y-2">
                          {pastCalls.map((c) => (
                            <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)]">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{c.title}</p>
                                <p className="text-xs text-[var(--text-muted)]">{new Date(c.scheduledAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
                              </div>
                              <span className="text-xs text-[var(--text-muted)] px-2 py-1 rounded bg-[var(--bg-input)] flex-shrink-0 ml-2">
                                {c.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : viewMode === "activity" && isAdmin ? (
                  <ActivityFeed campaignId={selectedCampaignId} />
                ) : viewMode === "ticket" ? (
                  <TicketPanel campaignId={selectedCampaignId} viewerId={viewerId} viewerRole={viewerRole} campaignName={selectedCampaign?.name} initialTicketId={searchParams.get("ticketId") || undefined} />
                ) : selectedChannel ? (
                  selectedChannel.type === "leaderboard" ? (
                    <Leaderboard channelId={selectedChannel.id} viewerId={viewerId} />
                  ) : (
                    <ChannelChat
                      channelId={selectedChannel.id}
                      channelType={selectedChannel.type}
                      channelName={selectedChannel.name}
                      viewerId={viewerId}
                      viewerRole={viewerRole}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center py-20">
                    <p className="text-sm text-[var(--text-muted)]">No channel selected</p>
                  </div>
                )}
              </CommunityErrorBoundary>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CampaignRow({
  campaign, active, onSelect,
}: {
  campaign: Campaign;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = campaign.totalUnread || 0;
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
        active
          ? "bg-accent/10 border-l-2 border-l-accent pl-[calc(0.625rem-2px)]"
          : "hover:bg-[var(--bg-card-hover)] border-l-2 border-l-transparent"
      }`}
    >
      <div className="h-10 w-10 rounded-lg overflow-hidden border border-[var(--border-subtle)] flex-shrink-0">
        <CampaignImage src={campaign.imageUrl} name={campaign.name} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm lg:text-base font-medium truncate ${active ? "text-accent" : "text-[var(--text-primary)]"}`}>
          {campaign.name}
        </p>
        <p className="text-[11px] lg:text-xs text-[var(--text-muted)] truncate">{campaign.platform}</p>
      </div>
      {unread > 0 && (
        <span className="flex-shrink-0 h-5 min-w-5 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center px-1.5 tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
