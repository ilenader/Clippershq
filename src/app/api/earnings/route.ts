import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { computeBalance } from "@/lib/balance";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const clips = await db.clip.findMany({
      where: { userId: session.user.id },
      select: { earnings: true, status: true, createdAt: true },
    });

    const payouts = await db.payoutRequest.findMany({
      where: { userId: session.user.id },
      select: { amount: true, status: true },
    });

    return NextResponse.json(buildResponse(clips, payouts));
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
}

function buildResponse(clips: any[], payouts: any[]) {
  const balance = computeBalance({ clips, payouts });

  // Per-clip earnings for chart
  const clipEarnings = clips
    .filter((c: any) => c.earnings > 0)
    .map((c: any) => ({
      date: c.createdAt,
      amount: c.earnings,
      status: c.status,
    }));

  return {
    totalEarned: balance.totalEarned,
    approvedEarnings: balance.approvedEarnings,
    pendingEarnings: balance.pendingEarnings,
    paidOut: balance.paidOut,
    lockedInPayouts: balance.lockedInPayouts,
    available: balance.available,
    clipEarnings,
  };
}
