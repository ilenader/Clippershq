import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/mutes/me?campaignId=X
 * Returns the current user's active moderation mute for a campaign, or null if not muted.
 * Used by ChannelChat to disable the input when the viewer is muted.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const campaignId = req.nextUrl.searchParams.get("campaignId") || "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const mute = await db.communityModerationMute.findUnique({
    where: { campaignId_userId: { campaignId, userId: session.user.id } },
  });

  if (!mute || mute.expiresAt <= new Date()) {
    // Lazy-clean expired rows.
    if (mute) {
      await db.communityModerationMute.delete({ where: { id: mute.id } }).catch(() => {});
    }
    return NextResponse.json({ muted: false });
  }

  return NextResponse.json({
    muted: true,
    expiresAt: mute.expiresAt,
    reason: mute.reason,
  });
}
