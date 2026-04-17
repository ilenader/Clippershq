import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/channels/[id]/leaderboard
 * Top clippers for the channel's campaign, ranked by total views across APPROVED clips.
 * `me` is always included with the requester's current rank, even if outside top 10.
 *
 * NOTE: rankChange is returned as 0 in phase 1. Daily snapshot storage for real
 * day-over-day deltas is a phase 2 cron job (would require a new snapshot model).
 */
export async function GET(
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
    select: { campaignId: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, channel.campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Aggregate views by user from approved, available clips in this campaign.
    // Latest ClipStat per clip = view count for ranking.
    const clips = await db.clip.findMany({
      where: {
        campaignId: channel.campaignId,
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
      },
      select: {
        userId: true,
        stats: { orderBy: { checkedAt: "desc" }, take: 1, select: { views: true } },
      },
      take: 5000,
    });

    const byUser: Record<string, { totalViews: number; clipCount: number }> = {};
    for (const c of clips) {
      if (!c.userId) continue;
      if (!byUser[c.userId]) byUser[c.userId] = { totalViews: 0, clipCount: 0 };
      byUser[c.userId].totalViews += c.stats?.[0]?.views || 0;
      byUser[c.userId].clipCount++;
    }

    const userIds = Object.keys(byUser);
    const users = userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, image: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map((u: any) => [u.id, u]));

    const ranked = userIds
      .map((uid) => ({
        userId: uid,
        username: userMap[uid]?.username || "Clipper",
        image: userMap[uid]?.image || null,
        totalViews: byUser[uid].totalViews,
        clipCount: byUser[uid].clipCount,
      }))
      .sort((a, b) => b.totalViews - a.totalViews)
      .map((entry, i) => ({ ...entry, rank: i + 1, rankChange: 0 }));

    const top = ranked.slice(0, 10);
    const me = ranked.find((r) => r.userId === session.user.id) || null;

    return NextResponse.json({ top, me });
  } catch (err: any) {
    console.error("[COMMUNITY] leaderboard GET error:", err?.message);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
