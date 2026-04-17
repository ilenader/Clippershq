// DEPRECATED: Replaced by Ably real-time + /api/notifications/count polling.
// Kept for backward compatibility during transition. Safe to remove after confirming Ably works.
// The navbar no longer opens an EventSource to this endpoint as of the Ably migration —
// any client still hitting it will get a working-but-unused stream.
import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { registerSSEClient, unregisterSSEClient } from "@/lib/sse-broadcast";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/sse
 *
 * Server-Sent Events for real-time notification delivery.
 * Polls DB every 2s and pushes the unread count whenever it changes.
 * Browsers do NOT throttle SSE connections in background tabs
 * (unlike setInterval which gets throttled to ~60s).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const userId = session.user.id;
  const encoder = new TextEncoder();
  let closed = false;
  let lastSentCount = -1;

  const stream = new ReadableStream({
    async start(controller) {
      // Register this controller for broadcast events (clip_updated, earnings_updated, etc.)
      registerSSEClient(userId, controller);

      controller.enqueue(encoder.encode("event: connected\ndata: ok\n\n"));

      async function checkNotifs() {
        if (closed) return;
        if (!db || !db.notification) return;

        try {
          const count = await db.notification.count({
            where: { userId, isRead: false },
          });

          if (count !== lastSentCount) {
            lastSentCount = count;
            controller.enqueue(
              encoder.encode(`event: notif\ndata: ${JSON.stringify({ count })}\n\n`)
            );
          }
        } catch {
          // DB error — skip this tick
        }
      }

      await checkNotifs();
      const interval = setInterval(checkNotifs, 10000);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        unregisterSSEClient(userId, controller);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
