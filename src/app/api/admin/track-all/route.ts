import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function POST(req: NextRequest) {
  try {
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
    const includeInactive: boolean = body.includeInactive === true;

    if (campaignIds.length > 0) {
      const blocked: string[] = [];
      for (const cid of campaignIds) {
        const rl = checkRateLimit(`track-manual:${cid}`, 1, 30 * 60_000);
        if (!rl.allowed) blocked.push(cid);
      }
      if (blocked.length === campaignIds.length) {
        return NextResponse.json({ error: "All selected campaigns were checked recently. Wait 30 minutes." }, { status: 429 });
      }
      const allowed = campaignIds.filter((id) => !blocked.includes(id));

      console.log(`[TRACK-ALL] Manual check for ${allowed.length} campaigns`);
      const { runDueTrackingJobs } = await import("@/lib/tracking");
      const start = Date.now();

      let result;
      try {
        result = await withTimeout(
          runDueTrackingJobs({ campaignIds: allowed, source: "manual", includeInactive }),
          55_000,
        );
      } catch (trackErr: any) {
        console.error("[TRACK-ALL] runDueTrackingJobs error:", trackErr?.message);
        return NextResponse.json({
          success: false,
          error: "Tracking error: " + (trackErr?.message || "unknown"),
          checked: 0,
          errors: 1,
          campaignsChecked: allowed.length,
          campaignsBlocked: blocked.length,
        });
      }

      if (result === null) {
        console.log("[TRACK-ALL] Timed out after 55s, still processing in background");
        return NextResponse.json({
          success: true,
          partial: true,
          message: "Check started, still processing in background",
          checked: 0,
          errors: 0,
          campaignsChecked: allowed.length,
          campaignsBlocked: blocked.length,
          elapsedMs: Date.now() - start,
        });
      }

      const elapsed = Date.now() - start;
      return NextResponse.json({
        success: true,
        checked: result.processed,
        errors: result.errors,
        details: result.details.slice(0, 20),
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

    let result;
    try {
      result = await withTimeout(runDueTrackingJobs({ source: "manual" }), 55_000);
    } catch (trackErr: any) {
      console.error("[TRACK-ALL] runDueTrackingJobs error:", trackErr?.message);
      return NextResponse.json({
        success: false,
        error: "Tracking error: " + (trackErr?.message || "unknown"),
        checked: 0,
        errors: 1,
      });
    }

    if (result === null) {
      return NextResponse.json({
        success: true,
        partial: true,
        message: "Check started, still processing in background",
        checked: 0,
        errors: 0,
        elapsedMs: Date.now() - start,
      });
    }

    const elapsed = Date.now() - start;
    return NextResponse.json({
      success: true,
      checked: result.processed,
      errors: result.errors,
      details: result.details.slice(0, 20),
      campaignsChecked: 0,
      campaignsBlocked: 0,
      elapsedMs: elapsed,
    });
  } catch (err: any) {
    console.error("[TRACK-ALL] Fatal error:", err?.message);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
