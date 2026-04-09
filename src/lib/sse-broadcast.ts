/**
 * SSE broadcast registry — allows server-side code to push events
 * to specific users' open SSE connections in real time.
 *
 * Usage:
 *   import { broadcastToUser, registerSSEClient, unregisterSSEClient } from "@/lib/sse-broadcast";
 *
 *   // In SSE endpoint: register the stream controller
 *   registerSSEClient(userId, controller);
 *
 *   // In any server route: push an event to a user
 *   broadcastToUser(userId, "clip_updated", { clipId: "abc", status: "APPROVED" });
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
