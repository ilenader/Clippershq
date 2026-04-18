"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/lib/auth-types";
import {
  ArrowLeft, Loader2, Megaphone, MessageCircle, Phone, Trophy,
  Bell, BellOff, AlertCircle, Users as UsersIcon,
} from "lucide-react";
import { CampaignImage } from "@/components/ui/campaign-image";
import { ChannelChat } from "@/components/community/ChannelChat";
import { Leaderboard } from "@/components/community/Leaderboard";
import { TicketPanel } from "@/components/community/TicketPanel";
import { CallScheduler } from "@/components/community/CallScheduler";
import { ActivityFeed } from "@/components/community/ActivityFeed";
import { CommunityErrorBoundary } from "@/components/community/CommunityErrorBoundary";
import { toast } from "@/lib/toast";

interface Channel { id: string; name: string; type: string; unread: number; sortOrder: number; }
interface Call { id: string; title: string; description?: string | null; scheduledAt: string; duration: number; status: string; isGlobal: boolean; campaignId?: string | null; }

const channelIconFor = (type: string) => type === "announcement" ? Megaphone : type === "leaderboard" ? Trophy : type === "voice" ? Phone : MessageCircle;

export default function CampaignCommunityPage() {
  const { campaignId: campaignIdRaw } = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(campaignIdRaw) ? campaignIdRaw[0] : (campaignIdRaw as string);
  const { data: session } = useSession();
  const viewerId = (session?.user as SessionUser | undefined)?.id || "";
  const viewerRole = ((session?.user as SessionUser | undefined)?.role || "CLIPPER") as
    "CLIPPER" | "ADMIN" | "OWNER" | "CLIENT";
  const isAdmin = viewerRole === "OWNER" || viewerRole === "ADMIN";

  useEffect(() => {
    if (session && viewerRole === "CLIENT") router.replace("/client");
  }, [session, viewerRole, router]);

  const [campaign, setCampaign] = useState<any>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [viewMode, setViewMode] = useState<"channel" | "ticket" | "call" | "activity">("channel");
  const [upcomingCall, setUpcomingCall] = useState<Call | null>(null);
  const [pastCalls, setPastCalls] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [campRes, channelsRes, callsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`).catch(() => null),
        fetch(`/api/community/channels?campaignId=${encodeURIComponent(campaignId)}`),
        fetch(`/api/community/calls?campaignId=${encodeURIComponent(campaignId)}`),
      ]);
      if (campRes && campRes.ok) setCampaign(await campRes.json());
      if (channelsRes.status === 403) {
        setError("You don't have access to this campaign's community.");
      } else if (!channelsRes.ok) {
        setError("Couldn't load this campaign. Try again in a moment.");
      } else {
        const data = await channelsRes.json();
        const list: Channel[] = data.channels || [];
        setChannels(list);
        setMuted(!!data.muted);
        setSelectedChannelId((prev) => {
          if (list.some((c) => c.id === prev)) return prev;
          return (list.find((c) => c.type === "general") || list[0])?.id || "";
        });
      }
      if (callsRes.ok) {
        const data = await callsRes.json();
        const next = (data.upcoming || [])
          .filter((c: any) => c.status !== "cancelled")
          .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
        setUpcomingCall(next || null);
      }
    } catch {
      setError("Network error. Please refresh.");
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener("sse:channel_message", handler);
    return () => window.removeEventListener("sse:channel_message", handler);
  }, [loadAll]);

  // Past calls — admin only.
  const loadPastCalls = useCallback(() => {
    if (!isAdmin) { setPastCalls([]); return; }
    fetch(`/api/community/calls?campaignId=${encodeURIComponent(campaignId)}&status=ended,completed,cancelled`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPastCalls(Array.isArray(data) ? data : []))
      .catch(() => setPastCalls([]));
  }, [campaignId, isAdmin]);

  useEffect(() => { loadPastCalls(); }, [loadPastCalls]);

  // Keep the page's call state in sync with server-side lifecycle events.
  useEffect(() => {
    const handler = (e: any) => {
      const detail = e?.detail;
      if (!detail?.callId || !upcomingCall) return;
      if (detail.callId !== upcomingCall.id) return;
      if (detail.status === "ended" || detail.status === "completed" || detail.status === "cancelled") {
        setUpcomingCall(null);
        loadPastCalls();
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
  }, [upcomingCall, viewMode, loadPastCalls]);

  // Open the persistent voice room (hosted by app-layout).
  const openVoice = (c: Call) => {
    const opener = (window as any).__openVoiceRoom;
    if (typeof opener === "function") {
      opener({ ...c, campaignName: campaign?.name });
    }
  };

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );

  const toggleMute = async () => {
    try {
      if (muted) {
        await fetch("/api/community/mute", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
        setMuted(false);
        window.dispatchEvent(new CustomEvent("community:mute_changed", { detail: { campaignId, muted: false } }));
        toast.success("Unmuted");
      } else {
        await fetch("/api/community/mute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        });
        setMuted(true);
        window.dispatchEvent(new CustomEvent("community:mute_changed", { detail: { campaignId, muted: true } }));
        toast.success("Muted");
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center min-h-[50vh]">
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
    );
  }

  return (
    <div className="-m-4 lg:-m-6 flex flex-col h-[calc(100vh-56px)] min-h-0 bg-[var(--bg-primary)]">
      {/* Top bar with back */}
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <Link
          href="/community"
          className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-[var(--text-muted)]" />
        </Link>
        {campaign?.imageUrl != null && (
          <div className="h-8 w-8 rounded-lg overflow-hidden border border-[var(--border-subtle)] flex-shrink-0">
            <CampaignImage src={campaign.imageUrl} name={campaign.name} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {campaign?.name || "Campaign"}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] truncate">{campaign?.platform}</p>
        </div>
        {isAdmin && (
          <CallScheduler campaignId={campaignId} onScheduled={() => loadAll()} />
        )}
        <button
          onClick={toggleMute}
          className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
            muted ? "bg-amber-500/10 text-amber-400" : "hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
          }`}
        >
          {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 items-center border-b border-[var(--border-color)] px-2 py-2 bg-[var(--bg-card)] overflow-x-auto">
        {channels.map((ch) => {
          const Icon = channelIconFor(ch.type);
          const active = viewMode === "channel" && selectedChannelId === ch.id;
          return (
            <button
              key={ch.id}
              onClick={() => { setViewMode("channel"); setSelectedChannelId(ch.id); }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                active ? "bg-accent text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
              }`}
            >
              <Icon className="h-3 w-3" />
              {ch.name}
              {ch.unread > 0 && !active && (
                <span className="h-3.5 min-w-3.5 rounded-full bg-accent text-white text-[8px] font-bold flex items-center justify-center px-1 tabular-nums">
                  {ch.unread > 99 ? "99+" : ch.unread}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setViewMode("ticket")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            viewMode === "ticket" ? "bg-accent text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
          }`}
        >
          <MessageCircle className="h-3 w-3" />
          {isAdmin ? "Tickets" : "Direct"}
        </button>
        {isAdmin && (
          <button
            onClick={() => setViewMode("activity")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === "activity" ? "bg-accent text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]"
            }`}
          >
            <UsersIcon className="h-3 w-3" />
            Activity
          </button>
        )}
        {upcomingCall && (
          <button
            onClick={() => setViewMode("call")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              viewMode === "call" ? "bg-accent text-white" : "text-amber-400 hover:bg-amber-500/10"
            }`}
          >
            <Phone className="h-3 w-3" />
            Call
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CommunityErrorBoundary>
          {viewMode === "call" ? (
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
                  <p className="text-sm text-[var(--text-muted)] mb-6">{campaign?.name}</p>

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
            <ActivityFeed campaignId={campaignId} />
          ) : viewMode === "ticket" ? (
            <TicketPanel campaignId={campaignId} viewerId={viewerId} viewerRole={viewerRole} campaignName={campaign?.name} />
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
              <p className="text-sm text-[var(--text-muted)]">No channels</p>
            </div>
          )}
        </CommunityErrorBoundary>
      </div>
    </div>
  );
}
