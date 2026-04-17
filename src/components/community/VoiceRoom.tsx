"use client";

import { useEffect, useState } from "react";
import { Phone, Users, Calendar } from "lucide-react";

interface Call {
  id: string;
  title: string;
  description?: string | null;
  scheduledAt: string;
  duration: number;
  status: string;
  isGlobal: boolean;
}

interface Props {
  call: Call;
}

/**
 * Phase-1 placeholder for the voice room. Actual Jitsi embed is phase 3.
 */
export function VoiceRoom({ call }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startMs = new Date(call.scheduledAt).getTime();
  const endMs = startMs + (call.duration || 60) * 60_000;
  const isLive = call.status === "live" || (now >= startMs && now <= endMs);
  const isPast = now > endMs && !isLive;

  const countdown = () => {
    const diff = Math.max(0, startMs - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 max-w-xl mx-auto text-center">
      <div className="h-20 w-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
        <Phone className={`h-10 w-10 text-accent ${isLive ? "animate-pulse" : ""}`} />
      </div>
      <h2 className="text-xl lg:text-2xl font-bold text-[var(--text-primary)] mb-2">{call.title}</h2>
      {call.description && (
        <p className="text-sm lg:text-base text-[var(--text-muted)] mb-6 max-w-md whitespace-pre-wrap">
          {call.description}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-8">
        <Calendar className="h-3.5 w-3.5" />
        <span>{new Date(call.scheduledAt).toLocaleString()}</span>
        <span className="mx-1">·</span>
        <span>{call.duration} min</span>
      </div>

      {isLive ? (
        <>
          <button
            disabled
            className="px-8 py-3 rounded-xl bg-accent/50 text-white text-base font-semibold cursor-not-allowed opacity-80"
          >
            Join Voice Call
          </button>
          <p className="mt-3 text-xs text-[var(--text-muted)] italic">
            Voice room UI lands in phase 3. The call is live on the team's side.
          </p>
        </>
      ) : isPast ? (
        <div className="px-6 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
          <p className="text-sm text-[var(--text-muted)]">This call has ended.</p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-2">Starts in</p>
          <p className="text-3xl lg:text-4xl font-bold text-accent font-mono tabular-nums">{countdown()}</p>
        </div>
      )}

      {isLive && (
        <p className="mt-6 text-xs text-[var(--text-muted)] flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Listening soon
        </p>
      )}
    </div>
  );
}
