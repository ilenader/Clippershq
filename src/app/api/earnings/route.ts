import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { computeBalance, computeCampaignBalances } from "@/lib/balance";
import { checkBanStatus } from "@/lib/check-ban";
import { withDbRetry } from "@/lib/db-retry";
import { cachedRead } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ totalEarned: 0, available: 0, campaignBalances: [] });

  // Role isolation: personal earnings data is clipper-only. Cached 120s per
  // userId — role only changes on admin promote/demote. Stale role for up to
  // 2 minutes after a role flip is acceptable; admin can pre-warm refresh by
  // calling invalidateCache(`user.role.${userId}`) in the promotion handler.
  // FLAGGED sanitization below is gated on this lookup.
  const currentUser = await cachedRead(
    `user.role.${session.user.id}`,
    120_000,
    () => withDbRetry<{ role: string } | null>(
      () => db.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      }),
      "earnings.user",
    ),
  );
  if (currentUser?.role !== "CLIPPER") {
    return NextResponse.json({ totalEarned: 0, approvedEarnings: 0, pendingEarnings: 0, paidOut: 0, lockedInPayouts: 0, available: 0, campaignBalances: [], clipEarnings: [], marketplaceCreatorEarnings: 0 });
  }

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

    // Phase 6d — creator's 60% share from marketplace clips lives in a
    // separate table keyed by creatorId (not in Clip.earnings, which holds
    // the poster's 30%). Without this query, a creator who is NOT the
    // poster would see $0 earnings on /earnings even though they're owed
    // money. Combined into the headline available balance, also returned
    // as a separate field so the UI (Phase 6e) can surface it as a sub-row.
    // Self-listing (creator === poster on same clip) is mathematically safe:
    // the two rows live in separate tables — no double-count.
    const creatorEarningsWhere: any = {
      creatorId: session.user.id,
      clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false },
    };
    if (filterCampaignIds.length > 0) creatorEarningsWhere.campaignId = { in: filterCampaignIds };

    const [clips, payouts, marketplaceCreatorEarnings] = await Promise.all([
      withDbRetry<any[]>(
        () => db.clip.findMany({
          where: clipWhere,
          select: { id: true, earnings: true, status: true, campaignId: true, createdAt: true },
          take: 5000,
        }),
        "earnings.clips",
      ),
      withDbRetry<any[]>(
        () => db.payoutRequest.findMany({
          where: payoutWhere,
          select: { amount: true, status: true, campaignId: true },
          take: 1000,
        }),
        "earnings.payouts",
      ),
      withDbRetry<any[]>(
        () => db.marketplaceCreatorEarning.findMany({
          where: creatorEarningsWhere,
          select: { amount: true, campaignId: true },
          take: 5000,
        }),
        "earnings.creatorEarnings",
      ),
    ]);

    const balance = computeBalance({ clips, payouts, marketplaceCreatorEarnings });
    const campaignBalances = computeCampaignBalances({ clips, payouts, marketplaceCreatorEarnings });
    const marketplaceCreatorEarningsTotal = Math.round(
      marketplaceCreatorEarnings.reduce((s: number, c: any) => s + (c.amount || 0), 0) * 100,
    ) / 100;

    // Get campaign names
    const campaignIds = campaignBalances.map((b) => b.campaignId);
    const campaigns: any[] = campaignIds.length > 0
      ? await withDbRetry(
          () => db.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, name: true },
          }),
          "earnings.campaigns",
        )
      : [];

    const nameMap = Object.fromEntries(campaigns.map((c: any) => [c.id, c.name]));
    const enrichedBalances = campaignBalances.map((b) => ({
      ...b,
      campaignName: nameMap[b.campaignId] || "Unknown",
    }));

    // Clip earnings for chart display. FLAGGED is mapped to PENDING for the
    // clipper facade (same rule as /api/clips/mine). computeBalance above
    // already buckets FLAGGED as pending, so this keeps the per-clip chart
    // consistent with the summary numbers above.
    const clipEarnings = clips.map((c: any) => ({
      earnings: c.earnings,
      status: c.status === "FLAGGED" ? "PENDING" : c.status,
      campaignId: c.campaignId,
      createdAt: c.createdAt,
    }));

    return NextResponse.json({
      ...balance,
      campaignBalances: enrichedBalances,
      clipEarnings,
      // Phase 6d — exposed as a separate field so Phase 6e UI can show it
      // as a "Marketplace creator earnings" sub-row under the headline.
      // Already folded into balance.totalEarned / approvedEarnings / available.
      marketplaceCreatorEarnings: marketplaceCreatorEarningsTotal,
    });
  } catch {
    return NextResponse.json({ totalEarned: 0, available: 0, campaignBalances: [], marketplaceCreatorEarnings: 0 });
  }
}
