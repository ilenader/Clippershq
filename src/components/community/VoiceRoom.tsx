"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { JitsiMeeting } from "@jitsi/react-sdk";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { Phone, PhoneOff, Users, Hand, X, ChevronUp } from "lucide-react";

// Use free public Jitsi servers for now.
// When self-hosting, change this to your domain (e.g., "voice.clipershq.com")
const JITSI_DOMAIN = "meet.jit.si";

interface VoiceRoomProps {
  call: {
    id: string;
    title: string;
    description?: string | null;
    campaignId?: string | null;
    scheduledAt: string;
    status: string;
    roomId?: string;
  };
  campaignName: string;
  isHost: boolean; // OWNER or ADMIN of this campaign
  onLeave: () => void;
  onCallStatusChange?: (status: string) => void;
}

export default function VoiceRoom({ call, campaignName, isHost, onLeave, onCallStatusChange }: VoiceRoomProps) {
  const { data: session } = useSession();
  const user = session?.user as (SessionUser & { username?: string }) | undefined;
  const username = user?.username || user?.name || "Clipper";

  const [joined, setJoined] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [raisedHands, setRaisedHands] = useState<{ userId: string; username: string; time: number }[]>([]);
  const [showHandQueue, setShowHandQueue] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const apiRef = useRef<any>(null);

  // Room name: deterministic from call ID so everyone joins the same room.
  const roomName = `clipershq-${call.campaignId || "global"}-${call.id}`.replace(/[^a-zA-Z0-9-]/g, "");

  // When host joins, flip call status to "live" on the server.
  useEffect(() => {
    if (joined && isHost && call.status !== "live") {
      fetch(`/api/community/calls/${call.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      }).catch(() => {});
      onCallStatusChange?.("live");
    }
  }, [joined, isHost, call.id, call.status, onCallStatusChange]);

  const handleApiReady = useCallback((externalApi: any) => {
    apiRef.current = externalApi;

    externalApi.addListener("participantJoined", () => {
      setParticipantCount((prev) => prev + 1);
    });

    externalApi.addListener("participantLeft", () => {
      setParticipantCount((prev) => Math.max(0, prev - 1));
    });

    externalApi.addListener("videoConferenceJoined", () => {
      setJoined(true);
    });

    externalApi.addListener("videoConferenceLeft", () => {
      setJoined(false);
      if (isHost) {
        // Host left — end the call for everyone.
        fetch(`/api/community/calls/${call.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ended" }),
        }).catch(() => {});
        onCallStatusChange?.("ended");
      }
      onLeave();
    });

    externalApi.addListener("raiseHandUpdated", (data: any) => {
      if (data?.handRaised) {
        setRaisedHands((prev) => {
          if (prev.some((h) => h.userId === data.id)) return prev;
          return [...prev, { userId: data.id, username: data.displayName || "Unknown", time: Date.now() }];
        });
      } else {
        setRaisedHands((prev) => prev.filter((h) => h.userId !== data.id));
      }
    });

    // Initial participant count — getParticipantsInfo returns an array of remotes (self excluded).
    try {
      const participants = externalApi.getParticipantsInfo?.();
      setParticipantCount(Array.isArray(participants) ? participants.length + 1 : 1);
    } catch {
      setParticipantCount(1);
    }
  }, [isHost, call.id, onLeave, onCallStatusChange]);

  const handleLeave = () => {
    if (apiRef.current) {
      apiRef.current.executeCommand("hangup");
    } else {
      onLeave();
    }
  };

  const handleGrantVoice = (participantId: string) => {
    // Remove from the queue. Jitsi's iframe API doesn't expose a per-user unmute,
    // so the host must verbally invite them to unmute — but clearing the queue
    // signals the host has handled them.
    setRaisedHands((prev) => prev.filter((h) => h.userId !== participantId));
  };

  const handleSkipQueue = (participantId: string) => {
    setRaisedHands((prev) => {
      const hand = prev.find((h) => h.userId === participantId);
      if (!hand) return prev;
      const rest = prev.filter((h) => h.userId !== participantId);
      return [hand, ...rest];
    });
  };

  // PRE-JOIN STATE: non-hosts see a waiting screen until the host starts.
  if (!isHost && call.status !== "live") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="h-20 w-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-6 animate-pulse">
          <Phone className="h-10 w-10 text-accent" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">{call.title}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">{campaignName}</p>
        <p className="text-sm text-amber-400 mb-6">Waiting for host to start the call...</p>
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Users className="h-4 w-4" />
          <span>{participantCount} waiting</span>
        </div>
      </div>
    );
  }

  // MINIMIZED STATE: small floating bar so the user can navigate while on the call.
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border border-accent/20 bg-[var(--bg-card)] shadow-xl shadow-black/20">
        <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
          <Phone className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{call.title}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{participantCount} participants</p>
        </div>
        <button onClick={() => setIsMinimized(false)} className="p-1.5 rounded-lg hover:bg-[var(--bg-input)] transition-colors">
          <ChevronUp className="h-4 w-4 text-accent" />
        </button>
        <button onClick={handleLeave} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
          <PhoneOff className="h-4 w-4 text-red-400" />
        </button>
      </div>
    );
  }

  // FULL CALL VIEW
  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[400px]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Phone className="h-4 w-4 text-accent" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{call.title}</h3>
            <p className="text-[10px] text-[var(--text-muted)] truncate">{campaignName} · {participantCount} participants</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {isHost && raisedHands.length > 0 && (
            <button
              onClick={() => setShowHandQueue(!showHandQueue)}
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] sm:text-xs font-medium text-amber-400"
            >
              <Hand className="h-3.5 w-3.5" />
              {raisedHands.length} raised
            </button>
          )}
          <button onClick={() => setIsMinimized(true)} className="p-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors" title="Minimize">
            <X className="h-4 w-4 text-[var(--text-muted)]" />
          </button>
          <button onClick={handleLeave} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] sm:text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors">
            <PhoneOff className="h-3.5 w-3.5" />
            {isHost ? "End Call" : "Leave"}
          </button>
        </div>
      </div>

      {/* Hand queue panel — host only */}
      {isHost && showHandQueue && raisedHands.length > 0 && (
        <div className="border-b border-[var(--border-color)] bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
            <Hand className="h-3 w-3" /> Raised Hands (first = first in queue)
          </p>
          <div className="space-y-1.5">
            {raisedHands.map((h, i) => (
              <div key={h.userId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--text-muted)] w-4">#{i + 1}</span>
                  <span className="text-sm text-[var(--text-primary)]">{h.username}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleGrantVoice(h.userId)} className="px-2 py-1 rounded text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                    Grant voice
                  </button>
                  <button onClick={() => handleSkipQueue(h.userId)} className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                    Move to front
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jitsi iframe */}
      <div className="flex-1 bg-black rounded-b-xl overflow-hidden">
        <JitsiMeeting
          domain={JITSI_DOMAIN}
          roomName={roomName}
          configOverwrite={{
            startWithAudioMuted: !isHost,
            startWithVideoMuted: true,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            hideConferenceSubject: true,
            hideConferenceTimer: false,
            disableModeratorIndicator: false,
            enableClosePage: false,
            toolbarButtons: [
              "microphone",
              "camera",
              "desktop",
              "raisehand",
              "tileview",
              "fullscreen",
              "hangup",
            ],
            notifications: [],
            disableThirdPartyRequests: true,
            analytics: { disabled: true },
          }}
          interfaceConfigOverwrite={{
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            DEFAULT_BACKGROUND: "#0a0f1a",
            TOOLBAR_ALWAYS_VISIBLE: true,
            DISABLE_VIDEO_BACKGROUND: true,
            HIDE_INVITE_MORE_HEADER: true,
            MOBILE_APP_PROMO: false,
            SHOW_CHROME_EXTENSION_BANNER: false,
          }}
          userInfo={{
            displayName: username,
            email: user?.email || "",
          }}
          onApiReady={handleApiReady}
          getIFrameRef={(iframeRef) => {
            if (iframeRef) {
              iframeRef.style.height = "100%";
              iframeRef.style.width = "100%";
              iframeRef.style.border = "none";
            }
          }}
        />
      </div>
    </div>
  );
}
