import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { recalculateClipEarningsBreakdown } from "@/lib/earnings-calc";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/fix-earnings
 * One-time migration: recalculates ALL approved clip earnings using the updated formula
 * (gross earnings = base + bonus, fee NOT subtracted).
 * OWNER only. Run once after deploying the fee fix.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[FIX-EARNINGS] Starting migration...");

  const clips = await db.clip.findMany({
    where: { status: "APPROVED", isDeleted: false },
    include: {
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true } },
      user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
    },
  });

  let updated = 0;
  let oldTotal = 0;
  let newTotal = 0;

  for (const clip of clips) {
    oldTotal += clip.earnings || 0;

    const breakdown = recalculateClipEarningsBreakdown({
      stats: clip.stats,
      campaign: clip.campaign,
      user: clip.user || undefined,
    });

    if (breakdown.clipperEarnings !== clip.earnings ||
        breakdown.baseEarnings !== clip.baseEarnings ||
        breakdown.bonusPercent !== clip.bonusPercent) {
      await db.clip.update({
        where: { id: clip.id },
        data: {
          earnings: breakdown.clipperEarnings,
          baseEarnings: breakdown.baseEarnings,
          bonusPercent: breakdown.bonusPercent,
          bonusAmount: breakdown.bonusAmount,
        },
      });
      updated++;
    }

    newTotal += breakdown.clipperEarnings;
  }

  // Update all users' totalEarnings
  const users = await db.user.findMany({
    where: { role: "CLIPPER" },
    select: { id: true },
  });

  for (const user of users) {
    const userClips = await db.clip.findMany({
      where: { userId: user.id, status: "APPROVED", isDeleted: false },
      select: { earnings: true },
    });
    const total = userClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
    await db.user.update({
      where: { id: user.id },
      data: { totalEarnings: Math.round(total * 100) / 100 },
    });
  }

  console.log(`[FIX-EARNINGS] Done: ${updated}/${clips.length} clips updated, $${oldTotal.toFixed(2)} → $${newTotal.toFixed(2)}`);

  return NextResponse.json({
    totalClips: clips.length,
    updated,
    oldTotal: Math.round(oldTotal * 100) / 100,
    newTotal: Math.round(newTotal * 100) / 100,
    usersUpdated: users.length,
  });
}
