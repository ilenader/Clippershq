import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/archive/[campaignId]
 * Returns detailed archive data for a single campaign. OWNER only.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { campaignId } = await params;

  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true, name: true, clientName: true, platform: true,
      pricingModel: true, clipperCpm: true, cpmRate: true, ownerCpm: true,
      agencyFee: true, budget: true, minViews: true, maxPayoutPerClip: true,
      description: true, requirements: true,
      startDate: true, endDate: true, createdAt: true, archivedAt: true,
      status: true, isArchived: true,
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // All clips for this campaign
  const clips = await db.clip.findMany({
    where: { campaignId, isDeleted: false },
    include: {
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      user: { select: { id: true, username: true, image: true } },
      clipAccount: { select: { username: true, platform: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Aggregate stats
  let totalViews = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
  let approvedCount = 0, rejectedCount = 0;
  for (const clip of clips) {
    const s = clip.stats[0];
    if (s) {
      totalViews += s.views || 0;
      totalLikes += s.likes || 0;
      totalComments += s.comments || 0;
      totalShares += s.shares || 0;
    }
    if (clip.status === "APPROVED") approvedCount++;
    if (clip.status === "REJECTED") rejectedCount++;
  }

  // Budget status
  const budgetStatus = await getCampaignBudgetStatus(campaignId);

  // Owner earnings
  const ownerAgg = await db.agencyEarning.aggregate({
    where: { campaignId },
    _sum: { amount: true },
  });
  const ownerEarningsTotal = ownerAgg._sum.amount ?? 0;

  // Owner earnings per clip
  const ownerEarnings = await db.agencyEarning.findMany({
    where: { campaignId },
    select: { clipId: true, amount: true, views: true },
  });
  const ownerEarningsMap: Record<string, number> = {};
  for (const oe of ownerEarnings) {
    ownerEarningsMap[oe.clipId] = oe.amount || 0;
  }

  // Per-clipper payouts (PAID)
  const payouts = await db.payoutRequest.findMany({
    where: { campaignId, status: "PAID" },
    select: { userId: true, finalAmount: true, amount: true },
  });
  const paidByUser: Record<string, number> = {};
  for (const p of payouts) {
    paidByUser[p.userId] = (paidByUser[p.userId] || 0) + (p.finalAmount ?? p.amount ?? 0);
  }

  // Group clips by user
  const clipperMap: Record<string, {
    userId: string; username: string; image: string | null;
    clips: any[]; totalViews: number; totalEarnings: number;
  }> = {};

  for (const clip of clips) {
    if (clip.status !== "APPROVED") continue;
    const uid = clip.user.id;
    if (!clipperMap[uid]) {
      clipperMap[uid] = {
        userId: uid,
        username: clip.user.username || "Unknown",
        image: clip.user.image,
        clips: [],
        totalViews: 0,
        totalEarnings: 0,
      };
    }
    const s = clip.stats[0];
    const clipData = {
      clipId: clip.id,
      clipUrl: (clip as any).clipUrl || (clip as any).url || null,
      platform: clip.clipAccount?.platform || null,
      accountUsername: clip.clipAccount?.username || null,
      views: s?.views || 0,
      likes: s?.likes || 0,
      comments: s?.comments || 0,
      shares: s?.shares || 0,
      earnings: clip.earnings || 0,
      baseEarnings: (clip as any).baseEarnings || 0,
      bonusPercent: (clip as any).bonusPercent || 0,
      bonusAmount: (clip as any).bonusAmount || 0,
      ownerEarnings: ownerEarningsMap[clip.id] || 0,
      status: clip.status,
      createdAt: clip.createdAt,
    };
    clipperMap[uid].clips.push(clipData);
    clipperMap[uid].totalViews += clipData.views;
    clipperMap[uid].totalEarnings += clip.earnings || 0;
  }

  // Build clippers array sorted by earnings desc
  const clippers = Object.values(clipperMap)
    .map((c) => ({
      ...c,
      clipCount: c.clips.length,
      totalEarnings: Math.round(c.totalEarnings * 100) / 100,
      paidOut: Math.round((paidByUser[c.userId] || 0) * 100) / 100,
      unpaid: Math.round((c.totalEarnings - (paidByUser[c.userId] || 0)) * 100) / 100,
    }))
    .sort((a, b) => b.totalEarnings - a.totalEarnings);

  return NextResponse.json({
    campaign,
    stats: {
      totalClips: clips.length,
      approvedClips: approvedCount,
      rejectedClips: rejectedCount,
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
    },
    budgetStatus,
    ownerEarningsTotal: Math.round(ownerEarningsTotal * 100) / 100,
    ownerEarningsPerClip: ownerEarnings,
    clippers,
  });
}
