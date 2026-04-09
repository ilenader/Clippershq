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
  // Production: verify Vercel cron secret
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  if (process.env.NODE_ENV === "production" && process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log("[CRON] Unauthorized — invalid or missing authorization header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
