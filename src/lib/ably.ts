/**
 * Ably server-side publish helper.
 *
 * Fire-and-forget real-time event delivery to user-specific channels.
 * Channel pattern: "user:{userId}" — each user only subscribes to their own channel
 * (enforced by the token capability in /api/ably-token).
 *
 * If ABLY_API_KEY is not set, publish calls return silently and pages fall back
 * to their existing polling (useAutoRefresh). This makes the switch opt-in via env.
 */

import Ably from "ably";

let ablyServer: Ably.Rest | null = null;

function getAblyServer(): Ably.Rest | null {
  if (!process.env.ABLY_API_KEY) return null;
  if (!ablyServer) {
    ablyServer = new Ably.Rest({ key: process.env.ABLY_API_KEY });
  }
  return ablyServer;
}

/**
 * Publish an event to a user's personal channel.
 * Safe to call from any server context (cron, API route, etc.).
 */
export async function publishToUser(userId: string, event: string, data: any): Promise<void> {
  try {
    const ably = getAblyServer();
    if (!ably) return;
    const channel = ably.channels.get(`user:${userId}`);
    await channel.publish(event, data);
  } catch (err) {
    console.error("[ABLY] Publish failed:", (err as any)?.message);
  }
}

/** Publish the same event to multiple users in parallel. */
export async function publishToUsers(userIds: string[], event: string, data: any): Promise<void> {
  await Promise.all(userIds.map((id) => publishToUser(id, event, data)));
}
