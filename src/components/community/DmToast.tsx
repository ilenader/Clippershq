"use client";

import { useEffect, useRef, useState } from "react";
import { X, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Toast {
  ticketId: string;
  senderName: string;
  messagePreview?: string;
  campaignName?: string;
  arrivedAt: number;
}

/**
 * Global listener for sse:ticket_message. When a CLIPPER receives a message they didn't send,
 * a slide-in toast appears top-right and auto-dismisses after 8s.
 */
export function DmToast({ viewerId, viewerRole }: { viewerId: string; viewerRole: string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const router = useRouter();
  const lastFetchRef = useRef(0);

  useEffect(() => {
    if (viewerRole !== "CLIPPER") return;
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.ticketId) return;
      if (detail.userId === viewerId) return; // don't toast yourself
      // Throttle — at most once per 3s, even if Ably redelivers or multiple tickets fire.
      const now = Date.now();
      if (now - lastFetchRef.current < 3000) return;
      lastFetchRef.current = now;

      // Hydrate with a light message preview — we only have IDs from Ably payload.
      // Fetch latest message for the ticket to build a nice preview.
      try {
        const res = await fetch(`/api/community/tickets/${detail.ticketId}/messages?limit=1`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const msg = (data.messages || [])[0];
        setToast({
          ticketId: detail.ticketId,
          senderName: msg?.user?.username || "Team",
          messagePreview: msg?.content,
          campaignName: detail.campaignName,
          arrivedAt: Date.now(),
        });
      } catch {
        setToast({
          ticketId: detail.ticketId,
          senderName: "Team",
          campaignName: detail.campaignName,
          arrivedAt: Date.now(),
        });
      }
    };
    window.addEventListener("sse:ticket_message", handler);
    return () => window.removeEventListener("sse:ticket_message", handler);
  }, [viewerId, viewerRole]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const preview = (toast.messagePreview || "").slice(0, 120);

  return (
    <div
      className="fixed top-4 right-4 z-[70] max-w-sm w-[calc(100vw-2rem)] sm:w-80"
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
          router.push(`/community?ticketId=${encodeURIComponent(toast.ticketId)}`);
          setToast(null);
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
