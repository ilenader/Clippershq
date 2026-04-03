import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/unread
 * Returns { count: number } — total unread MESSAGES (not conversations) for the badge.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ count: 0 }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.conversationParticipant) return NextResponse.json({ count: 0 });

  const userId = session.user.id;

  try {
    const participations = await db.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    if (participations.length === 0) return NextResponse.json({ count: 0 });

    // Count actual unread messages across all conversations
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

    return NextResponse.json({ count: total });
  } catch (err: any) {
    console.error("GET /api/chat/unread error:", err?.message);
    return NextResponse.json({ count: 0 });
  }
}
