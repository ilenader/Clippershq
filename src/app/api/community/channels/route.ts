import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { ensureCampaignChannels, userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/channels?campaignId=X
 * Returns the campaign's channels with per-channel unread count.
 * Auto-provisions default channels on first read.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Not a member of this campaign" }, { status: 403 });

  try {
    await ensureCampaignChannels(campaignId);

    const [channels, readStatuses, mute] = await Promise.all([
      db.channel.findMany({
        where: { campaignId },
        orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.channelReadStatus.findMany({
        where: { userId: session.user.id, channelId: { in: [] } }, // placeholder, refilled below
      }).catch(() => []),
      db.communityMute.findFirst({ where: { campaignId, userId: session.user.id } }),
    ]);

    // Re-run read-status lookup with the real channel IDs (placeholder above avoided N+1 on missing data)
    const channelIds = channels.map((c: any) => c.id);
    const reads = channelIds.length > 0
      ? await db.channelReadStatus.findMany({
          where: { userId: session.user.id, channelId: { in: channelIds } },
        })
      : [];
    const readByChannel: Record<string, Date> = {};
    for (const r of reads) readByChannel[r.channelId] = new Date(r.lastReadAt);

    // Unread count per channel — messages created after lastReadAt (or all messages if never read).
    const channelsWithMeta = await Promise.all(
      channels.map(async (ch: any) => {
        const lastReadAt = readByChannel[ch.id];
        const unread = await db.channelMessage.count({
          where: {
            channelId: ch.id,
            isDeleted: false,
            userId: { not: session.user.id },
            ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
          },
        });
        return { ...ch, unread };
      }),
    );

    return NextResponse.json({ channels: channelsWithMeta, muted: !!mute });
  } catch (err: any) {
    console.error("[COMMUNITY] channels GET error:", err?.message);
    return NextResponse.json({ error: "Failed to load channels" }, { status: 500 });
  }
}
