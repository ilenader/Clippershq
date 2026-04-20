import { getSession } from "@/lib/get-session";
import { fetchClipStats, detectPlatform } from "@/lib/apify";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/clips/fetch-stats
 * Body: { clipUrl: string }
 * Returns: { views, likes, comments, shares, createdAt, platform }
 *
 * Used by owner/admin to fetch real stats for a clip.
 * Also used by the tracking system.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Each call hits Apify. Cap at 30/min per admin so a runaway loop (or a
  // compromised admin token) can't drain credits. 30 is plenty for legitimate
  // manual stat lookups; automation should go through the cron path.
  const rl = checkRateLimit(`fetch-stats:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { clipUrl } = body;
  if (!clipUrl || typeof clipUrl !== "string") {
    return NextResponse.json({ error: "clipUrl is required" }, { status: 400 });
  }

  const platform = detectPlatform(clipUrl);
  if (!platform) {
    return NextResponse.json({ error: "Unsupported platform URL" }, { status: 400 });
  }

  try {
    const stats = await fetchClipStats(clipUrl);

    // Log for testing (no secrets — only stats)
    console.log(`[Apify] Fetched stats for ${platform}:`, {
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      createdAt: stats.createdAt,
    });

    // Return stats WITHOUT the raw field (could contain sensitive data)
    return NextResponse.json({
      views: stats.views,
      likes: stats.likes,
      comments: stats.comments,
      shares: stats.shares,
      createdAt: stats.createdAt,
      platform: stats.platform,
    });
  } catch (err: any) {
    console.error(`[Apify] Error fetching stats:`, err.message);
    return NextResponse.json({ error: err.message || "Failed to fetch stats" }, { status: 500 });
  }
}
