/**
 * Notification system — creates in-app notifications for users.
 */
import { db } from "@/lib/db";

export type NotificationType =
  | "CLIP_SUBMITTED" | "CLIP_APPROVED" | "CLIP_REJECTED" | "CLIP_FLAGGED"
  | "CAMPAIGN_APPROVED" | "CAMPAIGN_REJECTED"
  | "STREAK_WARNING" | "STREAK_MILESTONE" | "STREAK_LOST"
  | "LEVEL_UP" | "REFERRAL_SIGNUP"
  | "PAYOUT_APPROVED" | "PAYOUT_REJECTED" | "PAYOUT_PAID";

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
}

export async function getUnreadCount(userId: string): Promise<number> {
  if (!db || !db.notification) return 0;
  try {
    return await db.notification.count({ where: { userId, isRead: false } });
  } catch { return 0; }
}

export async function getNotifications(userId: string, limit = 20): Promise<any[]> {
  if (!db || !db.notification) return [];
  try {
    return await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
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
