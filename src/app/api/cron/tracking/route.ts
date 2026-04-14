import { runDueTrackingJobs } from "@/lib/tracking";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes — cron processes many clips via Apify

/**
 * GET /api/cron/tracking
 *
 * Executes all due tracking jobs. Call this via:
 * - Vercel Cron (vercel.json): every 5 minutes
 * - External cron service
 * - Manual trigger from browser/curl
 *
 * Protected by CRON_SECRET in production.
 * In development, accessible without secret.
 */
export async function GET(req: NextRequest) {
  // Always require CRON_SECRET — no unauthenticated access
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[CRON] CRON_SECRET not configured — blocking request");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[CRON] Unauthorized tracking attempt blocked");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON] Tracking cron fired at", new Date().toISOString());
  const start = Date.now();

  const result = await runDueTrackingJobs();

  const elapsed = Date.now() - start;
  console.log(`[Tracking Cron] Done in ${elapsed}ms: ${result.processed} processed, ${result.errors} errors`);

  return NextResponse.json({
    ...result,
    elapsedMs: elapsed,
    timestamp: new Date().toISOString(),
  });
}
