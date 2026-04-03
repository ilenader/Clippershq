import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { canAccessConversation } from "@/lib/chat-access";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/conversations/[id]/read
 * Mark conversation as read for the current user.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.conversationParticipant) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: conversationId } = await params;
  const userId = session.user.id;
  const role = (session.user as any).role;

  const allowed = await canAccessConversation(userId, role, conversationId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Upsert: if owner joined ad-hoc, ensure participant exists
    await db.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      update: { lastReadAt: new Date() },
      create: { conversationId, userId, lastReadAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST read error:", err?.message);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}
