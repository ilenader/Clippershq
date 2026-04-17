"use client";

import { useEffect, useRef } from "react";
import Ably from "ably";

// Module-level singleton — one Ably connection per tab, shared across components.
let ablyClient: Ably.Realtime | null = null;
let connectionPromise: Promise<Ably.Realtime | null> | null = null;

function getAblyClient(): Promise<Ably.Realtime | null> {
  if (ablyClient && ablyClient.connection.state === "connected") {
    return Promise.resolve(ablyClient);
  }
  if (connectionPromise) return connectionPromise;

  connectionPromise = new Promise<Ably.Realtime | null>((resolve) => {
    try {
      ablyClient = new Ably.Realtime({
        authCallback: async (_tokenParams, callback) => {
          try {
            const res = await fetch("/api/ably-token");
            if (!res.ok) {
              callback(new Error(`Token fetch failed: ${res.status}`) as any, null as any);
              return;
            }
            const tokenRequest = await res.json();
            callback(null, tokenRequest);
          } catch (err) {
            callback(err as any, null as any);
          }
        },
        autoConnect: true,
        disconnectedRetryTimeout: 5000,
        suspendedRetryTimeout: 15000,
      });

      ablyClient.connection.on("connected", () => {
        console.log("[ABLY] Connected");
        resolve(ablyClient);
      });

      ablyClient.connection.on("failed", (err) => {
        console.error("[ABLY] Connection failed:", err);
        resolve(null);
      });

      // Safety: resolve after 5s regardless of state. Polling covers us if Ably never connects.
      setTimeout(() => resolve(ablyClient), 5000);
    } catch (err) {
      console.error("[ABLY] Client construction failed:", err);
      resolve(null);
    }
  });

  return connectionPromise;
}

/**
 * Subscribe the current user to their personal Ably channel.
 *
 * Every message received is rebroadcast as a window CustomEvent with the prefix
 * `sse:{event}` — this matches the old SSE event-forwarding pattern, so every
 * existing listener (clip_updated, earnings_updated, tracking_progress,
 * notif_refresh, etc.) keeps working without edits in the consumer.
 *
 * If Ably isn't configured or the connection fails, this hook is a no-op and
 * the page's existing polling handles updates.
 */
export function useAbly(userId: string | null | undefined) {
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    getAblyClient().then((client) => {
      if (cancelled || !client) return;
      const channel = client.channels.get(`user:${userId}`);
      channelRef.current = channel;

      channel.subscribe((message) => {
        try {
          window.dispatchEvent(
            new CustomEvent(`sse:${message.name}`, { detail: message.data })
          );
        } catch {}
      });
    }).catch(() => {
      // Ably failed — polling fallback handles data freshness. Silent intentionally.
    });

    return () => {
      cancelled = true;
      if (channelRef.current) {
        try { channelRef.current.unsubscribe(); } catch {}
        channelRef.current = null;
      }
    };
  }, [userId]);
}
