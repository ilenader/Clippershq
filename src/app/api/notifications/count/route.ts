import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/count
 *
 * Lightweight polling endpoint — returns just the unread count, not the full list.
 * Used by the navbar's 15s polling fallback alongside Ably real-time.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ count: 0 }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.notification) return NextResponse.json({ count: 0 });

  try {
    const count = await db.notification.count({
      where: { userId: session.user.id, isRead: false },
    });
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
