import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/activity?campaignId=X&limit=30
 *
 * Owner/admin-only feed of clipper joins and leaves for a campaign.
 * Returns the most recent entries from the CommunityActivity audit table.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ activity: [] });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  // ADMIN still needs team access; OWNER always passes via checkCommunityAccess.
  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 30, 1), 200);

  try {
    const activity = await db.communityActivity.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ activity });
  } catch (err: any) {
    console.error("[COMMUNITY] activity GET error:", err?.message);
    return NextResponse.json({ activity: [] });
  }
}
