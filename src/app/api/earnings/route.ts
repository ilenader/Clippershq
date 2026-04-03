import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { computeBalance, computeCampaignBalances } from "@/lib/balance";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Role isolation: personal earnings data is clipper-only
  const role = (session.user as any).role;
  if (role !== "CLIPPER") {
    return NextResponse.json({ totalEarned: 0, approvedEarnings: 0, pendingEarnings: 0, paidOut: 0, lockedInPayouts: 0, available: 0, campaignBalances: [], clipEarnings: [] });
  }

  if (!db) return NextResponse.json({ totalEarned: 0, available: 0, campaignBalances: [] });

  const { searchParams } = new URL(request.url);
  const filterParam = searchParams.get("campaignIds");
  const filterCampaignIds = filterParam ? filterParam.split(",").filter(Boolean) : [];

  try {
    const clipWhere: any = { userId: session.user.id, isDeleted: false };
    const payoutWhere: any = { userId: session.user.id };
    if (filterCampaignIds.length > 0) {
      clipWhere.campaignId = { in: filterCampaignIds };
      payoutWhere.campaignId = { in: filterCampaignIds };
    }

    const [clips, payouts] = await Promise.all([
      db.clip.findMany({
        where: clipWhere,
        select: { id: true, earnings: true, status: true, campaignId: true, createdAt: true },
      }),
      db.payoutRequest.findMany({
        where: payoutWhere,
        select: { amount: true, status: true, campaignId: true },
      }),
    ]);

    const balance = computeBalance({ clips, payouts });
    const campaignBalances = computeCampaignBalances({ clips, payouts });

    // Get campaign names
    const campaignIds = campaignBalances.map((b) => b.campaignId);
    const campaigns = campaignIds.length > 0
      ? await db.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, name: true },
        })
      : [];

    const nameMap = Object.fromEntries(campaigns.map((c: any) => [c.id, c.name]));
    const enrichedBalances = campaignBalances.map((b) => ({
      ...b,
      campaignName: nameMap[b.campaignId] || "Unknown",
    }));

    // Clip earnings for chart display
    const clipEarnings = clips.map((c: any) => ({
      earnings: c.earnings,
      status: c.status,
      campaignId: c.campaignId,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({
      ...balance,
      campaignBalances: enrichedBalances,
      clipEarnings,
    });
  } catch {
    return NextResponse.json({ totalEarned: 0, available: 0, campaignBalances: [] });
  }
}
