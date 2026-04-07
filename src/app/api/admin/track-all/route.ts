import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/track-all
 * Owner-only: triggers immediate tracking check on ALL active clips.
 * Rate limited to once per 30 minutes.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Rate limit: once per 30 minutes
  const rl = checkRateLimit(`track-all:${session.user.id}`, 1, 30 * 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[TRACK-ALL] Manual tracking triggered by owner");

  // Set all active tracking jobs to be due now
  const updated = await db.trackingJob.updateMany({
    where: { isActive: true },
    data: { nextCheckAt: new Date() },
  });

  console.log(`[TRACK-ALL] Marked ${updated.count} jobs as due`);

  // Now run the tracking
  const { runDueTrackingJobs } = await import("@/lib/tracking");
  const start = Date.now();
  const result = await runDueTrackingJobs();
  const elapsed = Date.now() - start;

  console.log(`[TRACK-ALL] Done in ${elapsed}ms: ${result.processed} processed, ${result.errors} errors`);

  return NextResponse.json({
    checked: result.processed,
    errors: result.errors,
    details: result.details,
    elapsedMs: elapsed,
  });
}
