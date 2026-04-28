/**
 * Notification system — creates in-app notifications for users.
 */
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";

export type NotificationType =
  | "CLIP_SUBMITTED" | "CLIP_APPROVED" | "CLIP_REJECTED" | "CLIP_FLAGGED"
  | "CAMPAIGN_APPROVED" | "CAMPAIGN_REJECTED"
  | "STREAK_WARNING" | "STREAK_MILESTONE" | "STREAK_LOST"
  | "LEVEL_UP" | "REFERRAL_SIGNUP"
  | "PAYOUT_APPROVED" | "PAYOUT_REJECTED" | "PAYOUT_PAID"
  | "COMMUNITY_REPLY"
  // Phase 9 — marketplace event types. The Notification.type column is a
  // free-form String so adding entries here requires no migration; the union
  // exists purely for TypeScript safety on call sites.
  | "MKT_NEW_SUBMISSION"
  | "MKT_SUBMISSION_APPROVED"
  | "MKT_SUBMISSION_REJECTED"
  | "MKT_LISTING_APPROVED"
  | "MKT_LISTING_REJECTED";

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  metadata?: Record<string, any>,
): Promise<void> {
  if (!db || !db.notification) return;
  try {
    await db.notification.create({
      data: { userId, type, title, body, metadata: metadata ? JSON.stringify(metadata) : null },
    });
  } catch {}
  // Real-time push — tell the user's open tabs to refetch count + list.
  // Silent if Ably not configured; the 15s navbar polling catches the update either way.
  try {
    const { publishToUser } = await import("@/lib/ably");
    await publishToUser(userId, "notif_refresh", {});
  } catch {}
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!db || !db.notification) return 0;
  try {
    return await withDbRetry(
      () => db.notification.count({ where: { userId, isRead: false } }),
      "notif.unreadCount",
    );
  } catch { return 0; }
}

export async function getNotifications(userId: string, limit = 20): Promise<any[]> {
  if (!db || !db.notification) return [];
  try {
    return await withDbRetry(
      () => db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      "notif.list",
    );
  } catch { return []; }
}

export async function markRead(userId: string, ids?: string[]): Promise<void> {
  if (!db || !db.notification) return;
  try {
    const where: any = { userId };
    if (ids) where.id = { in: ids };
    await db.notification.updateMany({ where, data: { isRead: true } });
  } catch {}
}
