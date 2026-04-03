import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getGamificationState, getStreakDayStatuses, loadConfig } from "@/lib/gamification";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — returns gamification state for current user, or config for owner */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;

  // Owner can get config
  if (req.nextUrl.searchParams.get("config") === "true" && role === "OWNER") {
    const config = await loadConfig();
    return NextResponse.json(config);
  }

  // Leaderboard data — accessible to all roles (it's public display data)
  if (req.nextUrl.searchParams.get("leaderboard") === "true") {
    if (!db || !db.gamificationConfig) return NextResponse.json([]);
    try {
      const row = await db.gamificationConfig.findUnique({ where: { key: "leaderboard" } });
      if (row) {
        const entries = JSON.parse(row.value);
        // Sort: highest earnings first, then views
        return NextResponse.json(
          Array.isArray(entries)
            ? entries.sort((a: any, b: any) => (b.earnings || 0) - (a.earnings || 0) || (b.views || 0) - (a.views || 0))
            : []
        );
      }
    } catch {}
    return NextResponse.json([]);
  }

  // Role isolation: ADMIN does not see personal gamification state
  if (role === "ADMIN") {
    return NextResponse.json({});
  }

  const state = await getGamificationState(session.user.id);
  // Include day-by-day statuses for the streak grid (0=today, 1=yesterday, etc.)
  const streakDayStatuses = await getStreakDayStatuses(session.user.id, 60);
  return NextResponse.json({ ...(state || {}), streakDayStatuses });
}

/** POST — owner updates gamification config */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db || !db.gamificationConfig) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  try {
    await db.gamificationConfig.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
