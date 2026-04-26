import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { calculateClipEarnings } from "@/lib/earnings-calc";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/clips/[id]/override
 * Owner-only: manually override clip stats (views, likes, comments, shares)
 * and optionally earnings.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can override stats" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`clip-override:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Fetch clip with campaign data
    const clip = await db.clip.findUnique({
      where: { id },
      include: {
        campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
    });
    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    const views = body.views !== undefined ? parseInt(body.views) : (clip.stats[0]?.views || 0);
    const likes = body.likes !== undefined ? parseInt(body.likes) : (clip.stats[0]?.likes || 0);
    const comments = body.comments !== undefined ? parseInt(body.comments) : (clip.stats[0]?.comments || 0);
    const shares = body.shares !== undefined ? parseInt(body.shares) : (clip.stats[0]?.shares || 0);

    if (isNaN(views) || views < 0 || isNaN(likes) || likes < 0 || isNaN(comments) || comments < 0 || isNaN(shares) || shares < 0) {
      return NextResponse.json({ error: "All stat values must be non-negative numbers" }, { status: 400 });
    }

    // Create manual stat snapshot
    await db.clipStat.create({
      data: { clipId: id, views, likes, comments, shares, isManual: true },
    });

    // Recalculate earnings from new stats
    let newEarnings: number;
    if (body.earnings !== undefined) {
      // Direct earnings override (fallback tool)
      newEarnings = Math.round(parseFloat(body.earnings) * 100) / 100;
      if (isNaN(newEarnings) || newEarnings < 0) {
        return NextResponse.json({ error: "Earnings must be a non-negative number" }, { status: 400 });
      }
    } else {
      // Auto-calculate from campaign rules
      newEarnings = calculateClipEarnings({
        views,
        campaignMinViews: clip.campaign.minViews,
        campaignCpmRate: clip.campaign.cpmRate,
        campaignMaxPayoutPerClip: clip.campaign.maxPayoutPerClip,
      });
    }

    // Update clip earnings
    await db.clip.update({
      where: { id },
      data: { earnings: newEarnings },
    });

    // Audit log
    await logAudit({
      userId: session.user.id,
      action: "MANUAL_OVERRIDE",
      targetType: "clip",
      targetId: id,
      details: {
        before: { views: clip.stats[0]?.views, likes: clip.stats[0]?.likes, earnings: clip.earnings },
        after: { views, likes, comments, shares, earnings: newEarnings },
        isManual: true,
      },
    });

    return NextResponse.json({ success: true, earnings: newEarnings });
  } catch (err: any) {
    console.error("Manual override failed:", err?.message);
    return NextResponse.json({ error: "Override failed" }, { status: 500 });
  }
}
