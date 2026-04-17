/**
 * DEPRECATED: No longer used. Ably (src/lib/ably.ts) handles all real-time broadcasting.
 * The legacy /api/notifications/sse endpoint still imports registerSSEClient/unregisterSSEClient
 * from this module, so the file is kept for reference during the Ably transition.
 * Safe to delete once the old SSE route is removed.
 *
 * Original SSE broadcast registry — pushed events to in-memory ReadableStream controllers
 * keyed by userId. Fine at 1 server instance / <200 users; doesn't survive horizontal scaling
 * because each instance has its own map. Ably's user-channel model replaces this cleanly.
 */

const encoder = new TextEncoder();

// Global map: userId → Set of active ReadableStream controllers
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

/** Register an SSE client controller for a user */
export function registerSSEClient(userId: string, controller: ReadableStreamDefaultController): void {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(controller);
}

/** Unregister an SSE client controller */
export function unregisterSSEClient(userId: string, controller: ReadableStreamDefaultController): void {
  const set = clients.get(userId);
  if (set) {
    set.delete(controller);
    if (set.size === 0) clients.delete(userId);
  }
}

/** Broadcast an SSE event to all open connections for a specific user */
export function broadcastToUser(userId: string, eventType: string, data: any): void {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;

  const payload = encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);

  for (const controller of set) {
    try {
      controller.enqueue(payload);
    } catch {
      // Controller closed — will be cleaned up on abort
      set.delete(controller);
    }
  }
}
