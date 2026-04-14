import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { registerSSEClient, unregisterSSEClient } from "@/lib/sse-broadcast";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/sse
 *
 * Server-Sent Events endpoint for real-time chat notifications.
 * Holds connection open and polls the DB every 2s, pushing events
 * only when the unread count changes. Browsers do NOT throttle SSE
 * connections in background tabs — so this delivers instantly.
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
      // Register with SSE broadcast system
      registerSSEClient(userId, controller);

      // Send initial connection event
      controller.enqueue(encoder.encode("event: connected\ndata: ok\n\n"));

      async function checkUnread() {
        if (closed) return;
        if (!db || !db.conversationParticipant) return;

        try {
          const participations = await db.conversationParticipant.findMany({
            where: { userId },
            select: { conversationId: true, lastReadAt: true },
          });

          let total = 0;
          for (const p of participations) {
            const count = await db.message.count({
              where: {
                conversationId: p.conversationId,
                createdAt: { gt: p.lastReadAt },
                senderId: { not: userId },
              },
            });
            total += count;
          }

          // Only push if count changed
          if (total !== lastSentCount) {
            lastSentCount = total;
            const data = JSON.stringify({ count: total });
            controller.enqueue(encoder.encode(`event: unread\ndata: ${data}\n\n`));
          }
        } catch {
          // DB error — skip this tick
        }
      }

      // Check immediately, then every 2 seconds
      await checkUnread();
      const interval = setInterval(checkUnread, 5000);

      // Keep connection alive with heartbeat every 15s
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      // Handle client disconnect via abort signal
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
