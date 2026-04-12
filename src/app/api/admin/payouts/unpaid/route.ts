import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payouts/unpaid
 * Returns unpaid clipper balances, optionally filtered by campaign.
 * OWNER ONLY.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can view unpaid balances" }, { status: 403 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;

  try {
    // 1. Get all approved, non-deleted clips with earnings
    const clipWhere: any = { status: "APPROVED", isDeleted: false };
    if (campaignId) clipWhere.campaignId = campaignId;

    const clips = await db.clip.findMany({
      where: clipWhere,
      select: {
        userId: true,
        campaignId: true,
        earnings: true,
        campaign: { select: { name: true } },
        user: { select: { username: true, image: true } },
      },
    });

    // 2. Get all payout requests
    const payoutWhere: any = {};
    if (campaignId) payoutWhere.campaignId = campaignId;

    const payouts = await db.payoutRequest.findMany({
      where: payoutWhere,
      select: { userId: true, campaignId: true, amount: true, feeAmount: true, finalAmount: true, status: true },
    });

    // 3. Aggregate earnings by user+campaign
    const earningsMap = new Map<string, { userId: string; campaignId: string; campaignName: string; username: string; image: string | null; earned: number }>();
    for (const clip of clips) {
      const key = `${clip.userId}:${clip.campaignId}`;
      const existing = earningsMap.get(key);
      if (existing) {
        existing.earned += clip.earnings || 0;
      } else {
        earningsMap.set(key, {
          userId: clip.userId,
          campaignId: clip.campaignId,
          campaignName: clip.campaign?.name || "Unknown",
          username: clip.user?.username || "Unknown",
          image: clip.user?.image || null,
          earned: clip.earnings || 0,
        });
      }
    }

    // 4. Aggregate paid and locked amounts by user+campaign
    const paidMap = new Map<string, number>();
    const lockedMap = new Map<string, number>();
    for (const p of payouts) {
      const key = `${p.userId}:${p.campaignId || ""}`;
      // Use finalAmount (after fee) if available, otherwise estimate
      const effectiveAmount = p.finalAmount != null ? p.finalAmount
        : p.feeAmount != null ? p.amount - p.feeAmount
        : p.amount * 0.91;
      if (p.status === "PAID") {
        paidMap.set(key, (paidMap.get(key) || 0) + effectiveAmount);
      } else if (["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status)) {
        lockedMap.set(key, (lockedMap.get(key) || 0) + effectiveAmount);
      }
    }

    // 5. Build clippers list
    const clippers: any[] = [];
    for (const [key, data] of earningsMap) {
      const paid = paidMap.get(key) || 0;
      const locked = lockedMap.get(key) || 0;
      const unpaid = Math.max(Math.round((data.earned - paid) * 100) / 100, 0);
      clippers.push({
        userId: data.userId,
        username: data.username,
        image: data.image,
        campaignId: data.campaignId,
        campaignName: data.campaignName,
        earned: Math.round(data.earned * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        locked: Math.round(locked * 100) / 100,
        unpaid,
      });
    }

    // Sort by unpaid descending
    clippers.sort((a, b) => b.unpaid - a.unpaid);

    // 6. Build campaign summaries
    const campaignMap = new Map<string, { campaignId: string; campaignName: string; totalEarned: number; totalPaid: number; totalLocked: number; totalUnpaid: number }>();
    for (const c of clippers) {
      const existing = campaignMap.get(c.campaignId);
      if (existing) {
        existing.totalEarned += c.earned;
        existing.totalPaid += c.paid;
        existing.totalLocked += c.locked;
        existing.totalUnpaid += c.unpaid;
      } else {
        campaignMap.set(c.campaignId, {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          totalEarned: c.earned,
          totalPaid: c.paid,
          totalLocked: c.locked,
          totalUnpaid: c.unpaid,
        });
      }
    }

    const campaigns = Array.from(campaignMap.values()).map((c) => ({
      ...c,
      totalEarned: Math.round(c.totalEarned * 100) / 100,
      totalPaid: Math.round(c.totalPaid * 100) / 100,
      totalLocked: Math.round(c.totalLocked * 100) / 100,
      totalUnpaid: Math.round(c.totalUnpaid * 100) / 100,
    }));

    return NextResponse.json({ campaigns, clippers });
  } catch (err: any) {
    console.error("[UNPAID] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to fetch unpaid balances" }, { status: 500 });
  }
}
