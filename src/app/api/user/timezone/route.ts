import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const rl = checkRateLimit(`user-timezone:${session.user.id}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tz = body?.timezone;
  if (!tz || typeof tz !== "string" || tz.length > 100) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  // Validate IANA timezone
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); } catch {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  try {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { timezone: true },
    });
    if (user?.timezone === tz) {
      return NextResponse.json({ success: true, changed: false });
    }

    await db.user.update({
      where: { id: session.user.id },
      data: { timezone: tz },
    });
    return NextResponse.json({ success: true, changed: true });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
