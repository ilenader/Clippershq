import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Role isolation: personal payout data is clipper-only
  const role = (session.user as any).role;
  if (role !== "CLIPPER") return NextResponse.json([]);

  if (!db) return NextResponse.json([]);

  try {
    const payouts = await db.payoutRequest.findMany({
      where: { userId: session.user.id },
      include: {
        campaign: { select: { name: true } },
        scheduledCalls: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(payouts);
  } catch (err: any) {
    console.error("GET /api/payouts/mine error:", err?.message);
    // Fallback: try without scheduledCalls in case of relation error
    try {
      const payouts = await db.payoutRequest.findMany({
        where: { userId: session.user.id },
        include: { campaign: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(payouts);
    } catch {
      return NextResponse.json([]);
    }
  }
}
