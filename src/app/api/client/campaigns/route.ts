import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const banCheck = checkBanStatus(session);
    if (banCheck) return banCheck;
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const role = (session.user as any).role;
    if (role !== "CLIENT" && role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // For OWNER, return all campaigns; for CLIENT, only assigned ones
    let campaignIds: string[] = [];
    if (role === "CLIENT") {
      const assignments = await db.campaignClient.findMany({
        where: { userId: session.user.id },
        select: { campaignId: true },
        take: 100,
      });
      campaignIds = assignments.map((a: any) => a.campaignId);
      if (campaignIds.length === 0) return NextResponse.json([]);
    }

    const where = role === "CLIENT" ? { id: { in: campaignIds } } : {};
    const campaigns = await db.campaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        platform: true,
        status: true,
        budget: true,
        startDate: true,
        imageUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Get clip stats for each campaign (no sensitive data)
    const campaignData = await Promise.all(
      campaigns.map(async (campaign: any) => {
        const clips = await db.clip.findMany({
          where: { campaignId: campaign.id, isDeleted: false },
          select: {
            status: true,
            earnings: true,
            videoUnavailable: true,
            createdAt: true,
            stats: { orderBy: { checkedAt: "desc" }, take: 1, select: { views: true, likes: true, comments: true, shares: true } },
          },
          take: 5000,
        });

        const approved = clips.filter((c: any) => c.status === "APPROVED" && !c.videoUnavailable);
        const pending = clips.filter((c: any) => c.status === "PENDING");
        const totalViews = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0);
        const totalLikes = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.likes || 0), 0);
        const totalComments = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.comments || 0), 0);
        const totalShares = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.shares || 0), 0);
        const totalEarnings = approved.reduce((s: number, c: any) => s + (c.earnings || 0), 0);

        // Get agency earnings for total spend
        const agencyEarnings = await db.agencyEarning.aggregate({
          where: { campaignId: campaign.id, clip: { videoUnavailable: false } },
          _sum: { amount: true },
        });
        const totalSpent = totalEarnings + (agencyEarnings._sum.amount || 0);

        return {
          ...campaign,
          totalClips: clips.length,
          approvedClips: approved.length,
          pendingClips: pending.length,
          totalViews,
          totalLikes,
          totalComments,
          totalShares,
          totalSpent,
        };
      })
    );

    return NextResponse.json(campaignData);
  } catch (err: any) {
    console.error("[CLIENT-CAMPAIGNS] Error:", err?.message);
    return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  }
}
