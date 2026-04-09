import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ campaigns: [], total: 0 });

  try {
    // Get all campaigns with their agency earnings and agency fees
    const campaigns = await db.campaign.findMany({
      where: {},
      select: {
        id: true, name: true, platform: true, pricingModel: true,
        ownerCpm: true, agencyFee: true, budget: true, status: true, isArchived: true,
        agencyEarnings: {
          select: {
            amount: true, views: true, createdAt: true, clipId: true,
            clip: {
              select: {
                clipUrl: true, earnings: true, reviewedAt: true, createdAt: true,
                clipAccount: { select: { username: true, platform: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = campaigns.map((c: any) => {
      // Default pricingModel for campaigns created before the field existed
      const pricing = c.pricingModel || "AGENCY_FEE";
      const totalOwnerEarnings = c.agencyEarnings.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const totalViews = c.agencyEarnings.reduce((s: number, e: any) => s + (e.views || 0), 0);
      // For AGENCY_FEE: the fee is the campaign's agencyFee field (flat amount)
      // For CPM_SPLIT: earnings come from AgencyEarning records (views × ownerCpm)
      const displayEarnings = pricing === "CPM_SPLIT" ? Math.round(totalOwnerEarnings * 100) / 100 : (c.agencyFee || 0);
      const clips = c.agencyEarnings.map((ae: any) => ({
        clipId: ae.clipId,
        clipUrl: ae.clip?.clipUrl || null,
        accountName: ae.clip?.clipAccount?.username || null,
        accountPlatform: ae.clip?.clipAccount?.platform || null,
        views: ae.views || 0,
        clipperEarnings: Math.round((ae.clip?.earnings || 0) * 100) / 100,
        ownerEarnings: Math.round((ae.amount || 0) * 100) / 100,
        date: ae.clip?.reviewedAt || ae.clip?.createdAt || ae.createdAt,
      }));

      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        pricingModel: pricing,
        ownerCpm: c.ownerCpm,
        agencyFee: c.agencyFee,
        budget: c.budget,
        status: c.isArchived ? "ARCHIVED" : c.status,
        isArchived: c.isArchived || false,
        totalOwnerEarnings: Math.round(totalOwnerEarnings * 100) / 100,
        displayEarnings,
        totalViews,
        clipCount: c.agencyEarnings.length,
        clips,
      };
    });

    // Only include campaigns that have some agency value
    const withEarnings = result.filter((c: any) => c.displayEarnings > 0 || c.totalOwnerEarnings > 0);

    const grandTotal = withEarnings.reduce((s: number, c: any) => s + (c.displayEarnings || 0), 0);

    return NextResponse.json({ campaigns: withEarnings, allCampaigns: result, total: Math.round(grandTotal * 100) / 100 });
  } catch {
    return NextResponse.json({ campaigns: [], total: 0 });
  }
}
