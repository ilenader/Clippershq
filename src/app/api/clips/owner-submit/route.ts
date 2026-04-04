import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { detectPlatform } from "@/lib/apify";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/clips/owner-submit
 * Owner-only endpoint to submit clips without restrictions.
 * Skips: 2-hour window, campaign membership, daily limit.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { campaignId, clipUrl, userId, clipAccountId } = data;
  if (!campaignId || !clipUrl) {
    return NextResponse.json({ error: "Campaign and clip URL are required." }, { status: 400 });
  }

  try { new URL(clipUrl); } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  try {
    // Verify campaign exists
    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    // Check duplicate
    const existing = await db.clip.findFirst({ where: { clipUrl, campaignId } });
    if (existing) return NextResponse.json({ error: "This clip URL already exists in this campaign." }, { status: 400 });

    // Determine user and account — owner can assign to themselves or another user
    const targetUserId = userId || session.user.id;

    // Find a clip account for the target user, or use the first available
    let targetAccountId = clipAccountId;
    if (!targetAccountId) {
      const account = await db.clipAccount.findFirst({
        where: { userId: targetUserId, status: "APPROVED" },
        select: { id: true },
      });
      if (!account) {
        // Create a placeholder if no account exists (owner override)
        const placeholder = await db.clipAccount.create({
          data: {
            userId: targetUserId,
            platform: detectPlatform(clipUrl) || "TikTok",
            username: "owner-override",
            profileLink: clipUrl,
            status: "APPROVED",
            verificationCode: "OWNER",
          },
        });
        targetAccountId = placeholder.id;
      } else {
        targetAccountId = account.id;
      }
    }

    const platform = detectPlatform(clipUrl);

    // Create clip + tracking job atomically (NO 2-hour check, NO membership check)
    const clip = await db.$transaction(async (tx: any) => {
      const newClip = await tx.clip.create({
        data: {
          userId: targetUserId,
          campaignId,
          clipAccountId: targetAccountId,
          clipUrl,
          note: data.note || "Owner override submission",
          isOwnerOverride: true,
        },
      });

      await tx.clipStat.create({
        data: { clipId: newClip.id, views: 0, likes: 0, comments: 0, shares: 0 },
      });

      if (platform === "tiktok" || platform === "instagram") {
        const nextHour = new Date();
        nextHour.setMinutes(0, 0, 0);
        nextHour.setHours(nextHour.getHours() + 1);
        await tx.trackingJob.create({
          data: { clipId: newClip.id, campaignId, nextCheckAt: nextHour, checkIntervalMin: 60, isActive: true },
        });
      }

      return newClip;
    });

    return NextResponse.json(clip, { status: 201 });
  } catch (err: any) {
    console.error("Owner clip submit error:", err?.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
