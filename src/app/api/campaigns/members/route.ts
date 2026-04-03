import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/members
 * Returns { [campaignId]: { clippers: number, accounts: number } }
 * Owner/Admin only.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({}, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({}, { status: 403 });
  }

  if (!db) return NextResponse.json({});

  try {
    const joins = await db.campaignAccount.findMany({
      select: {
        campaignId: true,
        clipAccount: { select: { userId: true } },
      },
    });

    const stats: Record<string, { clippers: Set<string>; accounts: number }> = {};
    for (const join of joins) {
      if (!stats[join.campaignId]) {
        stats[join.campaignId] = { clippers: new Set(), accounts: 0 };
      }
      stats[join.campaignId].clippers.add(join.clipAccount.userId);
      stats[join.campaignId].accounts += 1;
    }

    const result: Record<string, { clippers: number; accounts: number }> = {};
    for (const [campaignId, data] of Object.entries(stats)) {
      result[campaignId] = { clippers: data.clippers.size, accounts: data.accounts };
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({});
  }
}
