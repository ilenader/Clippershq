"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Loader2, MessageCircle, Phone,
} from "lucide-react";
import { ChannelChat } from "@/components/community/ChannelChat";
import { Leaderboard } from "@/components/community/Leaderboard";
import { TicketPanel } from "@/components/community/TicketPanel";
import { CallScheduler } from "@/components/community/CallScheduler";
import { ActivityFeed } from "@/components/community/ActivityFeed";
import { CommunityErrorBoundary } from "@/components/community/CommunityErrorBoundary";
import { ServerStrip } from "@/components/community/ServerStrip";
import { ChannelList } from "@/components/community/ChannelList";
import { AddChannelModal } from "@/components/community/AddChannelModal";
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
  unread?: number;
  sortOrder?: number;
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

type MobileView = "servers" | "channels" | "chat";

export default function CommunityPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionUser = session?.user as (SessionUser & { image?: string | null }) | undefined;
  const viewerId = sessionUser?.id || "";
  const viewerRole = (sessionUser?.role || "CLIPPER") as
    | "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  const username = sessionUser?.name || "Clipper";
  const userImage = sessionUser?.image || null;

  // Client isolation — community isn't for brands.
  useEffect(() => {
    if (session && viewerRole === "CLIENT") router.replace("/client");
  }, [session, viewerRole, router]);

  const isAdmin = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const isOwner = viewerRole === "OWNER";

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
  const [unresolvedTicketCount, setUnresolvedTicketCount] = useState(0);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("servers");
  const initialLoadDone = useRef(false);
  const navHandledRef = useRef(false);

  // Handle subsequent client-side navigations (not initial load — loadCampaigns handles that).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    const tab = searchParams.get("tab");
    const ticketId = searchParams.get("ticketId");
    const callId = searchParams.get("callId");
    const cid = searchParams.get("campaignId");
    if (cid) {
      setSelectedCampaignId(cid);
      setMobileView((prev) => (prev === "servers" ? "channels" : prev));
    }
    if (tab === "ticket" || ticketId) {
      setViewMode("ticket");
      setMobileView("chat");
    } else if (tab === "voice" || callId) {
      setViewMode("call");
      setMobileView("chat");
    }
  }, [searchParams]);

  const loadCampaigns = useCallback(async () => {
    if (navHandledRef.current) {
      navHandledRef.current = false;
      setLoadingCampaigns(false);
      return;
    }

    try {
      const res = await fetch("/api/community/campaigns");
      if (!res.ok) return;
      const data = await res.json();
      const list: Campaign[] = Array.isArray(data?.campaigns) ? data.campaigns : [];
      setCampaigns(list);

      let handled = false;
      try {
        const raw = sessionStorage.getItem("community_nav_target");
        if (raw) {
          sessionStorage.removeItem("community_nav_target");
          const target = JSON.parse(raw);
          if (target.campaignId && list.some((c: Campaign) => c.id === target.campaignId)) {
            setSelectedCampaignId(target.campaignId);
            setMobileView("chat");
            if (target.tab === "ticket" || target.ticketId) {
              setViewMode("ticket");
            } else if (target.tab === "voice") {
              setViewMode("call");
            }
            if (target.ticketId) {
              sessionStorage.setItem("community_initial_ticket", target.ticketId);
            }
            navHandledRef.current = true;
            handled = true;
          }
        }
      } catch {}

      if (!handled) {
        // Priority 2: URL params (bookmarks, direct links)
        const urlParams = new URLSearchParams(window.location.search);
        const urlCampaignId = urlParams.get("campaignId");
        const urlTab = urlParams.get("tab");
        const urlTicketId = urlParams.get("ticketId");
        const urlCallId = urlParams.get("callId");

        if (urlCampaignId && list.some((c) => c.id === urlCampaignId)) {
          setSelectedCampaignId(urlCampaignId);
          setMobileView((prev) => (prev === "servers" ? "channels" : prev));
        } else if (!selectedCampaignId && list.length > 0) {
          const first = list[0].id;
          setSelectedCampaignId(first);
          try {
            const p = new URLSearchParams(window.location.search);
            if (!p.get("campaignId")) {
              p.set("campaignId", first);
              window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`);
            }
          } catch {}
        }

        if (urlTab === "ticket" || urlTicketId) {
          setViewMode("ticket");
          setMobileView("chat");
        } else if (urlTab === "voice" || urlCallId) {
          setViewMode("call");
          setMobileView("chat");
        }
      }

      initialLoadDone.current = true;
    } catch {}
    setLoadingCampaigns(false);
  }, [selectedCampaignId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (selectedCampaignId && mobileView === "servers") {
      setMobileView("channels");
    }
  }, [selectedCampaignId, mobileView]);

  // Real-time: refresh campaigns when channel or ticket activity arrives.
  useEffect(() => {
    const handler = () => { loadCampaigns(); };
    window.addEventListener("sse:channel_message", handler);
    window.addEventListener("sse:ticket_message", handler);
    return () => {
      window.removeEventListener("sse:channel_message", handler);
      window.removeEventListener("sse:ticket_message", handler);
    };
  }, [loadCampaigns]);

  // --- Channels for the selected campaign ---------------------------
  const loadChannels = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoadingChannels(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/channels?campaignId=${encodeURIComponent(cid)}`);
      if (res.status === 403) {
        setChannels((prev) => {
          if (prev.length === 0) setError("You don't have access to this campaign's community.");
          return prev;
        });
      } else if (!res.ok) {
        setChannels((prev) => {
          if (prev.length === 0) setError("Couldn't load this campaign's community. Try again in a moment.");
          return prev;
        });
      } else {
        const data = await res.json();
        const list: Channel[] = data.channels || [];
        setChannels(list);
        setMuted(!!data.muted);
        if (list.length > 0) {
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
      setChannels((prev) => {
        if (prev.length === 0) setError("Network error. Please refresh.");
        return prev;
      });
    }
    setLoadingChannels(false);
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadChannels(selectedCampaignId);
    if (initialLoadDone.current) {
      const currentUrl = new URLSearchParams(window.location.search);
      if (!currentUrl.get("tab") && !currentUrl.get("ticketId") && !currentUrl.get("callId")) {
        setViewMode("channel");
      }
    }
  }, [selectedCampaignId, loadChannels]);

  // Real-time unread refresh for the current campaign's channels.
  const fetchingRef = useRef(false);
  useEffect(() => {
    const handler = async () => {
      if (fetchingRef.current || !selectedCampaignId) return;
      fetchingRef.current = true;
      try { await loadChannels(selectedCampaignId); } finally { fetchingRef.current = false; }
    };
    const deleteHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.channelId && detail.channelId === selectedChannelId) {
        setSelectedChannelId("");
        setViewMode("channel");
        toast.info("This channel was deleted");
      }
      handler();
    };
    window.addEventListener("sse:channel_message", handler);
    window.addEventListener("sse:channel_created", handler);
    window.addEventListener("sse:channel_updated", handler);
    window.addEventListener("sse:channel_deleted", deleteHandler);
    return () => {
      window.removeEventListener("sse:channel_message", handler);
      window.removeEventListener("sse:channel_created", handler);
      window.removeEventListener("sse:channel_updated", handler);
      window.removeEventListener("sse:channel_deleted", deleteHandler);
    };
  }, [selectedCampaignId, selectedChannelId, loadChannels]);

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

  // Unresolved ticket count for the admin tickets row badge.
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

  // Server-side call lifecycle events.
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

  const openVoice = (c: Call) => {
    const opener = (window as any).__openVoiceRoom;
    if (typeof opener === "function") {
      opener({ ...c, campaignName: selectedCampaign?.name });
    }
  };

  // Campaign switch — update state, sync URL (so the app-sidebar dropdown can
  // highlight the active campaign), and on mobile drill into the channels view.
  const handleCampaignSelect = (id: string | null) => {
    setSelectedCampaignId(id || "");
    if (!id) {
      setMobileView("servers");
      // Home button → clear campaign from URL.
      if (typeof window !== "undefined") {
        try {
          window.history.replaceState({}, "", window.location.pathname);
        } catch {}
      }
      return;
    }
    setMobileView("channels");
    if (typeof window !== "undefined") {
      try {
        const params = new URLSearchParams(window.location.search);
        params.set("campaignId", id);
        params.delete("ticketId");
        params.delete("callId");
        params.delete("tab");
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      } catch {}
    }
  };

  // Selecting any row in the ChannelList → switch to chat view on mobile.
  const handleChannelSelect = (ch: Channel) => {
    setSelectedChannelId(ch.id);
    setViewMode("channel");
    setMobileView("chat");
  };
  const handleTicketSelect = () => {
    setViewMode("ticket");
    setMobileView("chat");
  };
  const handleActivitySelect = () => {
    setViewMode("activity");
    setMobileView("chat");
  };
  const handleVoiceSelect = () => {
    setViewMode("call");
    setMobileView("chat");
  };

  const handleRenameChannel = async (channelId: string, newName: string) => {
    try {
      const res = await fetch(`/api/community/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        toast.success("Channel renamed");
        loadChannels(selectedCampaignId);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to rename");
      }
    } catch {
      toast.error("Failed to rename channel");
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    try {
      const res = await fetch(`/api/community/channels/${channelId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Channel deleted");
        if (selectedChannelId === channelId) setSelectedChannelId("");
        loadChannels(selectedCampaignId);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete channel");
    }
  };

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

  // What the ChannelList should highlight right now.
  const activeKey: any = (() => {
    if (viewMode === "ticket") return { kind: "ticket" };
    if (viewMode === "activity") return { kind: "activity" };
    if (viewMode === "call") return { kind: "voice" };
    if (selectedChannelId) return { kind: "channel", id: selectedChannelId };
    return null;
  })();

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  // Strip-friendly campaign shape (only what ServerStrip needs).
  const stripCampaigns = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    imageUrl: c.imageUrl,
    totalUnread: c.totalUnread || 0,
  }));

  const showingChat = mobileView === "chat";
  const showingChannels = mobileView === "channels";
  const showingServers = mobileView === "servers";

  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100vh-56px)] min-h-0 bg-[var(--bg-primary)]">
      {/* Desktop: server strip always visible */}
      <div className="hidden lg:flex">
        <ServerStrip
          campaigns={stripCampaigns}
          selectedId={selectedCampaignId || null}
          onSelect={handleCampaignSelect}
        />
      </div>

      {/* Mobile: servers view — only when no campaigns or loading */}
      {showingServers && (
        <div className="flex w-full lg:hidden">
          <ServerStrip
            campaigns={stripCampaigns}
            selectedId={selectedCampaignId || null}
            onSelect={handleCampaignSelect}
            compact
          />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-xs">
              <MessageCircle className="h-12 w-12 text-accent/30 mx-auto mb-3" />
              <p className="text-base font-semibold text-[var(--text-primary)] mb-1">Community</p>
              <p className="text-sm text-[var(--text-muted)]">
                {loadingCampaigns ? "Loading your campaigns…"
                  : campaigns.length === 0
                    ? (isAdmin ? "No campaigns yet." : "Join a campaign to see its community.")
                    : "Tap a campaign to open its channels."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile: channels view — strip + channel list side by side */}
      {showingChannels && selectedCampaign && (
        <div className="flex w-full lg:hidden">
          <ServerStrip
            campaigns={stripCampaigns}
            selectedId={selectedCampaignId || null}
            onSelect={handleCampaignSelect}
            compact
          />
          <div className="flex-1 min-w-0">
            <ChannelList
              campaignName={selectedCampaign.name}
              campaignImageUrl={selectedCampaign.imageUrl}
              channels={channels}
              active={activeKey}
              onSelectChannel={handleChannelSelect}
              onSelectTicket={handleTicketSelect}
              onSelectActivity={handleActivitySelect}
              onSelectVoice={handleVoiceSelect}
              upcomingCall={upcomingCall ? { id: upcomingCall.id, title: upcomingCall.title, status: upcomingCall.status } : null}
              ticketUnread={unresolvedTicketCount}
              isAdmin={isAdmin}
              isOwner={isOwner}
              username={username}
              userImage={userImage}
              userRole={viewerRole}
              muted={muted}
              onToggleMute={toggleMute}
              onAddChannel={() => setShowAddChannel(true)}
              onDeleteChannel={handleDeleteChannel}
              onRenameChannel={handleRenameChannel}
            />
          </div>
        </div>
      )}

      {/* Desktop: channel list */}
      {selectedCampaign && (
        <div className="hidden lg:flex">
          <ChannelList
            campaignName={selectedCampaign.name}
            campaignImageUrl={selectedCampaign.imageUrl}
            channels={channels}
            active={activeKey}
            onSelectChannel={handleChannelSelect}
            onSelectTicket={handleTicketSelect}
            onSelectActivity={handleActivitySelect}
            onSelectVoice={handleVoiceSelect}
            upcomingCall={upcomingCall ? { id: upcomingCall.id, title: upcomingCall.title, status: upcomingCall.status } : null}
            ticketUnread={unresolvedTicketCount}
            isAdmin={isAdmin}
            isOwner={isOwner}
            username={username}
            userImage={userImage}
            userRole={viewerRole}
            muted={muted}
            onToggleMute={toggleMute}
            onAddChannel={() => setShowAddChannel(true)}
            onDeleteChannel={handleDeleteChannel}
            onRenameChannel={handleRenameChannel}
          />
        </div>
      )}

      {/* Chat area — active content */}
      {selectedCampaign && (
        <section className={`flex-1 min-w-0 flex-col min-h-0 ${showingChat ? "flex" : "hidden lg:flex"}`}>
          {/* Mobile top bar with back + channel context + admin's schedule-call button */}
          <div className="lg:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
            <button
              onClick={() => setMobileView("channels")}
              className="p-1 rounded hover:bg-[var(--bg-input)] transition-colors"
              aria-label="Back to channels"
            >
              <ArrowLeft className="h-4 w-4 text-[var(--text-muted)]" />
            </button>
            <p className="text-sm font-semibold text-[var(--text-primary)] truncate flex-1">
              {viewMode === "ticket" ? (isAdmin ? "Tickets" : "Direct messages")
                : viewMode === "activity" ? "Activity"
                : viewMode === "call" ? (upcomingCall?.title || "Voice")
                : selectedChannel?.name || "Channel"}
            </p>
            {isAdmin && (
              <CallScheduler campaignId={selectedCampaignId} onScheduled={() => loadCalls(selectedCampaignId)} />
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <CommunityErrorBoundary>
              {loadingChannels ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
                </div>
              ) : error ? (
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
                <CallStaging
                  upcomingCall={upcomingCall}
                  pastCalls={pastCalls}
                  isAdmin={isAdmin}
                  campaignName={selectedCampaign.name}
                  campaignId={selectedCampaignId}
                  onJoin={(c) => openVoice(c)}
                  onScheduleCallChange={() => loadCalls(selectedCampaignId)}
                />
              ) : viewMode === "activity" && isAdmin ? (
                <ActivityFeed campaignId={selectedCampaignId} />
              ) : viewMode === "ticket" ? (
                <TicketPanel
                  campaignId={selectedCampaignId}
                  viewerId={viewerId}
                  viewerRole={viewerRole}
                  campaignName={selectedCampaign.name}
                  initialTicketId={searchParams.get("ticketId") || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ticketId") : null) || undefined}
                />
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
                <div className="flex-1 flex items-center justify-center py-20">
                  <p className="text-sm text-[var(--text-muted)]">No channel selected</p>
                </div>
              )}
            </CommunityErrorBoundary>
          </div>
        </section>
      )}

      {/* Desktop welcome state when no campaign chosen */}
      {!selectedCampaign && (
        <div className="hidden lg:flex flex-1 items-center justify-center">
          <div className="text-center">
            <MessageCircle className="h-12 w-12 text-accent/30 mx-auto mb-3" />
            <p className="text-lg font-semibold text-[var(--text-primary)] mb-1">Welcome to Community</p>
            <p className="text-sm text-[var(--text-muted)]">
              {loadingCampaigns ? "Loading your campaigns…"
                : campaigns.length === 0
                  ? (isAdmin ? "No campaigns yet." : "Join a campaign to see its community.")
                  : "Select a campaign from the left to get started."}
            </p>
          </div>
        </div>
      )}

      {/* Owner-only channel creator */}
      {showAddChannel && selectedCampaignId && (
        <AddChannelModal
          campaignId={selectedCampaignId}
          open={showAddChannel}
          onClose={() => setShowAddChannel(false)}
          onCreated={(ch) => {
            setShowAddChannel(false);
            // Refresh the channels list and jump to the new channel.
            loadChannels(selectedCampaignId).then(() => {
              setSelectedChannelId(ch.id);
              setViewMode("channel");
              setMobileView("chat");
            });
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Voice-call staging area — shown when viewMode === "call".
   Preserves the old "Join Call / Start Call / Waiting for host"
   card plus the admin-only past-calls list.
   ───────────────────────────────────────────────────────────────── */
function CallStaging({
  upcomingCall,
  pastCalls,
  isAdmin,
  campaignName,
  campaignId,
  onJoin,
  onScheduleCallChange,
}: {
  upcomingCall: Call | null;
  pastCalls: Call[];
  isAdmin: boolean;
  campaignName: string;
  campaignId: string;
  onJoin: (c: Call) => void;
  onScheduleCallChange: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-6">
      {!upcomingCall ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <Phone className="h-8 w-8 text-accent opacity-50" />
          </div>
          <p className="text-sm text-[var(--text-muted)] mb-1">No calls scheduled</p>
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {isAdmin ? "Schedule one with the button above." : "Check back later."}
          </p>
          {isAdmin && (
            <CallScheduler campaignId={campaignId} onScheduled={onScheduleCallChange} />
          )}
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
          <p className="text-sm text-[var(--text-muted)] mb-6">{campaignName}</p>

          {upcomingCall.status === "live" ? (
            <button
              onClick={() => onJoin(upcomingCall)}
              className="px-8 py-3 rounded-xl bg-accent text-white text-base font-semibold hover:bg-accent/80 transition-colors flex items-center gap-2"
            >
              <Phone className="h-5 w-5" />
              Join Call
            </button>
          ) : isAdmin ? (
            <button
              onClick={() => onJoin(upcomingCall)}
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
  );
}
