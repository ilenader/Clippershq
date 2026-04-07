import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/track-all
 * Owner-only: triggers immediate tracking check.
 * Body: { campaignIds?: string[] }  — if omitted, checks ALL active clips
 * Rate limited per-campaign: 30 minutes per campaign.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const campaignIds: string[] = Array.isArray(body.campaignIds) ? body.campaignIds : [];

  // Per-campaign rate limit (30 min each) stored in localStorage-style via a simple in-memory map
  // For server-side, use the rate limiter per campaign
  const { checkRateLimit, rateLimitResponse } = await import("@/lib/rate-limit");
  if (campaignIds.length > 0) {
    const blocked: string[] = [];
    for (const cid of campaignIds) {
      const rl = checkRateLimit(`track-manual:${cid}`, 1, 30 * 60_000);
      if (!rl.allowed) blocked.push(cid);
    }
    if (blocked.length === campaignIds.length) {
      return NextResponse.json({ error: "All selected campaigns were checked recently. Wait 30 minutes." }, { status: 429 });
    }
    // Filter out blocked ones, proceed with the rest
    const allowed = campaignIds.filter((id) => !blocked.includes(id));
    if (allowed.length < campaignIds.length) {
      console.log(`[TRACK-ALL] ${blocked.length} campaigns rate-limited, checking ${allowed.length}`);
    }

    console.log(`[TRACK-ALL] Manual check for ${allowed.length} campaigns`);
    const { runDueTrackingJobs } = await import("@/lib/tracking");
    const start = Date.now();
    const result = await runDueTrackingJobs({ campaignIds: allowed, source: "manual" });
    const elapsed = Date.now() - start;

    return NextResponse.json({
      checked: result.processed,
      errors: result.errors,
      details: result.details,
      campaignsChecked: allowed.length,
      campaignsBlocked: blocked.length,
      elapsedMs: elapsed,
    });
  }

  // No campaign filter — check all (global rate limit)
  const rl = checkRateLimit(`track-all:${session.user.id}`, 1, 30 * 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  console.log("[TRACK-ALL] Manual check for ALL campaigns");
  const { runDueTrackingJobs } = await import("@/lib/tracking");
  const start = Date.now();
  const result = await runDueTrackingJobs({ source: "manual" });
  const elapsed = Date.now() - start;

  return NextResponse.json({
    checked: result.processed,
    errors: result.errors,
    details: result.details,
    campaignsChecked: 0,
    campaignsBlocked: 0,
    elapsedMs: elapsed,
  });
}
