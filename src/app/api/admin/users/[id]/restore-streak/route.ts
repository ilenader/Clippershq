import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const rl = checkRoleAwareRateLimit(`streak-restore:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { id } = await params;
  const body = await req.json();
  const days = body.days;
  const reason = body.reason || "Owner decision";

  if (!days || typeof days !== "number" || days < 1) {
    return NextResponse.json({ error: "Days must be at least 1" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id },
    select: { currentStreak: true, longestStreak: true, timezone: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const maxDays = user.longestStreak > 0 ? user.longestStreak : 30;
  if (days > maxDays) {
    return NextResponse.json({ error: `Cannot exceed ${maxDays} days (longest streak)` }, { status: 400 });
  }

  const oldStreak = user.currentStreak;
  const newLongest = Math.max(days, user.longestStreak);

  // Set lastActiveDate to yesterday in user's timezone
  const tz = user.timezone || "UTC";
  const yesterdayStr = new Date(Date.now() - 86400_000).toLocaleDateString("en-CA", { timeZone: tz });
  const yesterday = new Date(`${yesterdayStr}T00:00:00Z`);

  await db.user.update({
    where: { id },
    data: {
      currentStreak: days,
      longestStreak: newLongest,
      lastActiveDate: yesterday,
      streakRestoredAt: new Date(),
    },
  });

  // Recalculate earnings with new streak bonus
  try {
    const { recalculateUnpaidEarnings } = await import("@/lib/gamification");
    await recalculateUnpaidEarnings(id);
  } catch (err: any) {
    console.error(`[RESTORE-STREAK] Recalculate failed for user ${id}:`, err?.message);
  }

  await logAudit({
    userId: session.user.id,
    action: "RESTORE_STREAK",
    targetType: "USER",
    targetId: id,
    details: { oldStreak, newStreak: days, reason },
  });

  console.log(`[RESTORE-STREAK] User ${id}: streak ${oldStreak} → ${days} by ${session.user.id}. Reason: ${reason}`);

  return NextResponse.json({ success: true, newStreak: days });
}
