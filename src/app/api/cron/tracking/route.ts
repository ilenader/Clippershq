import { runDueTrackingJobs } from "@/lib/tracking";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for Apify calls

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
  // Production: verify cron secret
  if (process.env.NODE_ENV === "production") {
    const secret = req.headers.get("authorization");
    if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  console.log("[Tracking Cron] Starting...");
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
