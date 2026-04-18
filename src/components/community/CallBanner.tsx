"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, X } from "lucide-react";

interface Call {
  id: string;
  title: string;
  scheduledAt: string;
  duration: number;
  status: string;
  campaignId?: string | null;
  campaign?: { name: string } | null;
  isGlobal: boolean;
}

const DISMISS_KEY = "community_call_banner_dismissed_until";
const CACHE_KEY = "community_calls_cache";
const CACHE_TIME_KEY = "community_calls_cache_time";
const CACHE_TTL = 5 * 60_000; // 5 minutes

function readDismissedUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

function readCachedCalls(): { upcoming: Call[] } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const t = sessionStorage.getItem(CACHE_TIME_KEY);
    if (!raw || !t) return null;
    if (Date.now() - Number(t) > CACHE_TTL) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCachedCalls(data: { upcoming: Call[] }): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
    sessionStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch {}
}

function invalidateCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(CACHE_TIME_KEY);
  } catch {}
}

/**
 * Sticky-top banner for the next upcoming voice call.
 * Shows when a call is within 48h. Dismissible for 1h via localStorage.
 */
export function CallBanner() {
  const [call, setCall] = useState<Call | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dismissedUntil, setDismissedUntil] = useState<number>(() => readDismissedUntil());

  const pickActive = (data: { upcoming: Call[] } | null | undefined): Call | null => {
    const upcoming: Call[] = data?.upcoming || [];
    return (
      upcoming
        .filter((c) => c.status !== "cancelled")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] || null
    );
  };

  const load = useCallback(async (opts?: { skipCache?: boolean }) => {
    // Serve from sessionStorage cache (5 min TTL) unless forced to skip.
    if (!opts?.skipCache) {
      const cached = readCachedCalls();
      if (cached) { setCall(pickActive(cached)); return; }
    }
    try {
      const res = await fetch("/api/community/calls");
      if (!res.ok) return;
      const data = await res.json();
      writeCachedCalls({ upcoming: data.upcoming || [] });
      setCall(pickActive(data));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load({ skipCache: true }), 2 * 60_000); // fresh fetch every 2min
    // Invalidate cache + refetch when a new call is scheduled or cancelled.
    const invalidate = () => { invalidateCache(); load({ skipCache: true }); };
    window.addEventListener("sse:voice_call_scheduled", invalidate);
    window.addEventListener("sse:voice_call_cancelled", invalidate);
    return () => {
      clearInterval(interval);
      window.removeEventListener("sse:voice_call_scheduled", invalidate);
      window.removeEventListener("sse:voice_call_cancelled", invalidate);
    };
  }, [load]);

  // Tick for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!call) return null;
  if (Date.now() < dismissedUntil) return null;

  const startMs = new Date(call.scheduledAt).getTime();
  const endMs = startMs + (call.duration || 60) * 60_000;
  const diff = startMs - now;

  // Show only within 48h before start OR while call is live.
  const isLive = call.status === "live" || (now >= startMs && now <= endMs);
  if (!isLive && diff > 48 * 3600_000) return null;
  if (now > endMs && !isLive) return null;

  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const seconds = Math.floor((abs % 60000) / 1000);

  const campaignLabel = call.isGlobal ? "All clippers" : call.campaign?.name || "Campaign call";

  return (
    <div className="sticky top-0 z-[60] bg-gradient-to-r from-accent/15 via-accent/10 to-accent/15 border-b border-accent/25 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2 max-w-screen-2xl mx-auto">
        <Phone className={`h-4 w-4 text-accent flex-shrink-0 ${isLive ? "animate-pulse" : ""}`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm">
            <span className="font-semibold text-[var(--text-primary)] truncate">{call.title}</span>
            <span className="text-[var(--text-muted)] hidden sm:inline"> — {campaignLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="font-mono text-xs sm:text-sm font-bold text-accent tabular-nums">
            {isLive ? "LIVE" : diff <= 0 && call.status === "scheduled" ? (
              <span className="text-amber-400 font-semibold">Starting soon…</span>
            ) : (
              <>
                {days > 0 && `${days}d `}
                {hours > 0 && `${hours}h `}
                {minutes}m {seconds.toString().padStart(2, "0")}s
              </>
            )}
          </div>

          {isLive && (
            <button
              onClick={() => {
                const opener = (window as any).__openVoiceRoom;
                if (typeof opener === "function") {
                  opener({ ...call, campaignName: call.campaign?.name || "Campaign" });
                  return;
                }
                // Fallback: full navigation (shouldn't normally happen — app-layout always mounts).
                const params = new URLSearchParams({ tab: "voice", callId: call.id });
                if (call.campaignId) params.set("campaignId", call.campaignId);
                window.location.href = `/community?${params.toString()}`;
              }}
              className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-semibold animate-pulse hover:animate-none hover:bg-accent/85 transition-colors"
            >
              Join Now
            </button>
          )}

          <button
            onClick={() => {
              const until = Date.now() + 3600_000;
              try { localStorage.setItem(DISMISS_KEY, String(until)); } catch {}
              setDismissedUntil(until);
            }}
            className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-accent/15 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>
    </div>
  );
}
