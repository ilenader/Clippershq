import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/spend
 *
 * Returns aggregate spend per campaign:
 *   { [campaignId]: totalSpent }
 *
 * Spend = SUM(clip.earnings) WHERE status = APPROVED AND isDeleted = false
 * This is GLOBAL — not filtered by current user.
 * Available to any authenticated user (clippers need it for progress bars).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({}, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;

  if (!db) return NextResponse.json({});

  try {
    // Clipper-only spend: just approved clip earnings, no agency/owner data
    const result = await db.clip.groupBy({
      by: ["campaignId"],
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        campaign: { isArchived: false },
      },
      _sum: { earnings: true },
    });

    const spendMap: Record<string, number> = {};
    for (const row of result) {
      spendMap[row.campaignId] = Math.round((row._sum.earnings || 0) * 100) / 100;
    }

    // Include agency/owner earnings in spend totals for all roles
    // (total spent should match the budget progress bar for everyone)
    {
      try {
        const agencyResult = await db.agencyEarning.groupBy({
          by: ["campaignId"],
          _sum: { amount: true },
        });
        for (const row of agencyResult) {
          const ownerSpend = Math.round((row._sum.amount || 0) * 100) / 100;
          if (ownerSpend > 0) {
            spendMap[row.campaignId] = Math.round(((spendMap[row.campaignId] || 0) + ownerSpend) * 100) / 100;
          }
        }
      } catch {}
    }

    return NextResponse.json(spendMap);
  } catch (err: any) {
    console.error("GET /api/campaigns/spend error:", err?.message);
    return NextResponse.json({});
  }
}
