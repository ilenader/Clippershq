import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { id: campaignId } = await params;

    // Verify client has access to this campaign
    if (role === "CLIENT") {
      const access = await db.campaignClient.findUnique({
        where: { userId_campaignId: { userId: session.user.id, campaignId } },
      });
      if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, platform: true, status: true, budget: true, startDate: true, imageUrl: true, createdAt: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Get clips with stats (no clipper info)
    const clips = await db.clip.findMany({
      where: { campaignId, isDeleted: false },
      select: {
        id: true,
        clipUrl: true,
        status: true,
        earnings: true,
        videoUnavailable: true,
        createdAt: true,
        campaign: { select: { platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1, select: { views: true, likes: true, comments: true, shares: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // Agency earnings keyed by clipId — so per-day "earnings" reflects the FULL campaign spend
    // (clipper payout + owner/agency portion), not just the clipper slice.
    const agencyRows = await db.agencyEarning.findMany({
      where: { campaignId, clip: { videoUnavailable: false } },
      select: { clipId: true, amount: true },
    });
    const agencyByClip: Record<string, number> = {};
    for (const ae of agencyRows) {
      agencyByClip[ae.clipId] = (agencyByClip[ae.clipId] || 0) + (ae.amount || 0);
    }

    // Build daily breakdown (includes both clip + agency earnings as "earnings")
    const dayMap: Record<string, { clips: number; views: number; likes: number; comments: number; shares: number; earnings: number }> = {};
    for (const clip of clips) {
      const day = new Date(clip.createdAt).toISOString().split("T")[0];
      if (!dayMap[day]) dayMap[day] = { clips: 0, views: 0, likes: 0, comments: 0, shares: 0, earnings: 0 };
      dayMap[day].clips++;
      const stat = clip.stats?.[0];
      if (clip.status === "APPROVED" && !clip.videoUnavailable && stat) {
        dayMap[day].views += stat.views || 0;
        dayMap[day].likes += stat.likes || 0;
        dayMap[day].comments += stat.comments || 0;
        dayMap[day].shares += stat.shares || 0;
        const clipperPortion = clip.earnings || 0;
        const agencyPortion = agencyByClip[clip.id] || 0;
        dayMap[day].earnings += clipperPortion + agencyPortion;
      }
    }
    const dailyBreakdown = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data, earnings: Math.round(data.earnings * 100) / 100 }));

    // Clean clips for client view (no sensitive data)
    const clientClips = clips.map((c: any, i: number) => ({
      num: i + 1,
      platform: c.campaign?.platform || "",
      url: c.clipUrl,
      status: c.status,
      views: c.stats?.[0]?.views || 0,
      likes: c.stats?.[0]?.likes || 0,
      comments: c.stats?.[0]?.comments || 0,
      shares: c.stats?.[0]?.shares || 0,
      earnings: c.status === "APPROVED" && !c.videoUnavailable ? c.earnings || 0 : 0,
      submitted: c.createdAt,
    }));

    const approved = clips.filter((c: any) => c.status === "APPROVED" && !c.videoUnavailable);
    const totalViews = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.views || 0), 0);
    const totalLikes = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.likes || 0), 0);
    const totalComments = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.comments || 0), 0);
    const totalShares = approved.reduce((s: number, c: any) => s + (c.stats?.[0]?.shares || 0), 0);

    // Calculate total spend: clip earnings + agency earnings (matches /api/campaigns/spend logic).
    // Reuses the agencyByClip map built above — no extra DB round-trip.
    const clipSpend = approved.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    const agencyTotal = Object.values(agencyByClip).reduce((s: number, v: number) => s + v, 0);
    const totalSpent = Math.round((clipSpend + agencyTotal) * 100) / 100;

    return NextResponse.json({
      campaign,
      clips: clientClips,
      dailyBreakdown,
      summary: {
        totalClips: clips.length,
        approvedClips: approved.length,
        pendingClips: clips.filter((c: any) => c.status === "PENDING").length,
        totalViews,
        totalLikes,
        totalComments,
        totalShares,
        totalSpent,
        avgViewsPerClip: approved.length > 0 ? Math.round(totalViews / approved.length) : 0,
        topViews: approved.reduce((max: number, c: any) => Math.max(max, c.stats?.[0]?.views || 0), 0),
      },
    });
  } catch (err: any) {
    console.error("[CLIENT-CAMPAIGN-DETAIL] Error:", err?.message);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}
