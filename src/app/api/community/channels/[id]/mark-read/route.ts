import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * POST /api/community/channels/[id]/mark-read
 *
 * Marks the channel as read for the current user by advancing
 * ChannelReadStatus.lastReadAt to now. Unread counts in
 * GET /api/community/campaigns are `count(message.createdAt > lastReadAt)`,
 * so this call is what actually clears the sidebar badge.
 *
 * The messages-GET handler already does the same upsert as a side effect, but
 * clients can't signal "I read these" separately from "give me the list".
 * This route is the explicit hook for scroll-to-bottom detection so the
 * sidebar can zero out without a full messages refetch.
 *
 * Returns the campaign id so the client can scope optimistic updates.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: channelId } = await params;

  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { id: true, campaignId: true, type: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, channel.campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (channel.type === "private" && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "This channel is private" }, { status: 403 });
  }

  try {
    await db.channelReadStatus.upsert({
      where: { channelId_userId: { channelId, userId: session.user.id } },
      create: { channelId, userId: session.user.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    return NextResponse.json({
      success: true,
      channelId,
      campaignId: channel.campaignId,
      unreadCount: 0,
    });
  } catch (err: any) {
    console.error("[MARK-READ] upsert failed:", err?.message);
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }
}
