"use client";

import { useEffect, useRef, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Toast {
  ticketId: string;
  campaignId?: string | null;
  senderName: string;
  messagePreview?: string;
  campaignName?: string;
  arrivedAt: number;
}

/**
 * Global listener for sse:ticket_message. Shows a slide-in toast top-right for any
 * non-CLIENT role (CLIPPER sees admin replies; OWNER/ADMIN see clipper messages).
 * Auto-dismisses after 8s. Muted campaigns are suppressed.
 */
export function DmToast({ viewerId, viewerRole }: { viewerId: string; viewerRole: string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [mutedCampaigns, setMutedCampaigns] = useState<Set<string>>(new Set());
  const router = useRouter();
  const lastFetchRef = useRef(0);

  // Role guard — CLIENT never gets DM toasts. Everyone else does.
  const enabled = viewerRole !== "CLIENT";

  // Load muted campaign IDs once so we can suppress toasts for them.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/community/mute")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const ids: string[] = Array.isArray(data?.campaignIds) ? data.campaignIds : [];
        setMutedCampaigns(new Set(ids));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.ticketId) return;
      if (detail.userId === viewerId) return; // don't toast yourself
      if (detail.campaignId && mutedCampaigns.has(detail.campaignId)) return; // muted

      // Throttle — at most once per 3s, even if Ably redelivers or multiple tickets fire.
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;

      // Hydrate a preview — Ably payload only carries ids.
      try {
        const res = await fetch(`/api/community/tickets/${detail.ticketId}/messages?limit=1`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const msg = (data.messages || [])[0];
        setToast({
          ticketId: detail.ticketId,
          campaignId: detail.campaignId || null,
          senderName: msg?.user?.username || "Team",
          messagePreview: msg?.content,
          campaignName: detail.campaignName,
          arrivedAt: Date.now(),
        });
      } catch {
        setToast({
          ticketId: detail.ticketId,
          campaignId: detail.campaignId || null,
          senderName: "Team",
          campaignName: detail.campaignName,
          arrivedAt: Date.now(),
        });
      }
    };

    // Keep the muted set fresh if the user toggles mute elsewhere.
    const onMuteChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.campaignId) return;
      setMutedCampaigns((prev) => {
        const next = new Set(prev);
        if (detail.muted) next.add(detail.campaignId);
        else next.delete(detail.campaignId);
        return next;
      });
    };

    window.addEventListener("sse:ticket_message", handler);
    window.addEventListener("community:mute_changed", onMuteChanged);
    return () => {
      window.removeEventListener("sse:ticket_message", handler);
      window.removeEventListener("community:mute_changed", onMuteChanged);
    };
  }, [viewerId, enabled, mutedCampaigns]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast || !enabled) return null;

  const preview = (toast.messagePreview || "").slice(0, 120);

  return (
    <div
      className="fixed top-16 right-4 z-[70] max-w-sm w-[calc(100vw-2rem)] sm:w-80"
      style={{ animation: "dm-toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1)" }}
    >
      <style jsx>{`
        @keyframes dm-toast-in {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
      <button
        onClick={() => {
          const params = new URLSearchParams({ tab: "ticket", ticketId: toast.ticketId });
          if (toast.campaignId) params.set("campaignId", toast.campaignId);
          setToast(null);
          window.location.href = `/community?${params.toString()}`;
        }}
        className="w-full text-left flex items-start gap-3 p-4 rounded-xl border border-accent/20 bg-[var(--bg-card)] shadow-xl shadow-black/40 hover:border-accent/40 transition-colors cursor-pointer"
      >
        <div className="h-9 w-9 flex-shrink-0 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center text-accent text-sm font-bold uppercase">
          {toast.senderName[0] || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="h-3 w-3 text-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">New message</span>
          </div>
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate mt-0.5">{toast.senderName}</p>
          {preview && (
            <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-1">{preview}</p>
          )}
          {toast.campaignName && (
            <p className="text-[10px] text-accent mt-1.5 truncate">{toast.campaignName}</p>
          )}
        </div>
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            setToast(null);
          }}
          className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-lg hover:bg-[var(--bg-input)] transition-colors"
        >
          <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        </span>
      </button>
    </div>
  );
}
