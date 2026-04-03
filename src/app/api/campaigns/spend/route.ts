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

  if (!db) return NextResponse.json({});

  try {
    const result = await db.clip.groupBy({
      by: ["campaignId"],
      where: {
        status: "APPROVED",
        isDeleted: false,
        campaign: { isArchived: false },
      },
      _sum: { earnings: true },
    });

    const spendMap: Record<string, number> = {};
    for (const row of result) {
      spendMap[row.campaignId] = Math.round((row._sum.earnings || 0) * 100) / 100;
    }

    return NextResponse.json(spendMap);
  } catch (err: any) {
    console.error("GET /api/campaigns/spend error:", err?.message);
    return NextResponse.json({});
  }
}
