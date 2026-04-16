import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { detectPlatform, fetchClipStats } from "@/lib/apify";
import { recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { roundToNextSlot } from "@/lib/tracking";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/clips/owner-submit
 * Owner-only: submit clips without restrictions.
 * Auto-approved, earnings calculated immediately, tracking job created.
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

  const { campaignId, clipUrl, userId, clipAccountId, note, customCpm } = data;
  if (!campaignId || !clipUrl) {
    return NextResponse.json({ error: "Campaign and clip URL are required." }, { status: 400 });
  }

  try { new URL(clipUrl); } catch {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  try {
    // Fetch campaign with CPM and budget info
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, clipperCpm: true, cpmRate: true, budget: true, maxPayoutPerClip: true, minViews: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

    // Check duplicate
    const existing = await db.clip.findFirst({ where: { clipUrl, campaignId } });
    if (existing) return NextResponse.json({ error: "This clip URL already exists in this campaign." }, { status: 400 });

    // Determine user and account — validate target user
    const targetUserId = userId || session.user.id;
    if (userId && userId !== session.user.id) {
      const targetUser = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!targetUser || targetUser.role !== "CLIPPER" || targetUser.status === "BANNED") {
        return NextResponse.json({ error: "Invalid target user. Must be an active CLIPPER." }, { status: 400 });
      }
    }

    let targetAccountId = clipAccountId;
    if (!targetAccountId) {
      const account = await db.clipAccount.findFirst({
        where: { userId: targetUserId, status: "APPROVED", deletedByUser: false },
        select: { id: true },
      });
      if (!account) {
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

    // Determine CPM: use custom if provided (capped at campaign rate), else campaign rate
    const campaignCpm = campaign.clipperCpm ?? campaign.cpmRate ?? 0;
    let effectiveCpm = campaignCpm;
    if (customCpm != null && customCpm > 0) {
      effectiveCpm = Math.min(customCpm, campaignCpm);
    }

    // Fetch real stats from platform BEFORE creating the clip
    let fetchedStats = { views: 0, likes: 0, comments: 0, shares: 0 };
    try {
      const realStats = await fetchClipStats(clipUrl);
      fetchedStats = { views: realStats.views, likes: realStats.likes, comments: realStats.comments, shares: realStats.shares };
      console.log(`[OWNER-SUBMIT] Fetched real stats for ${clipUrl}: ${fetchedStats.views} views`);
    } catch (err: any) {
      console.log(`[OWNER-SUBMIT] Could not fetch stats for ${clipUrl}: ${err?.message} — starting with 0`);
    }

    // Create clip as APPROVED + initial stat with real views + tracking job (immediate)
    const clip = await db.$transaction(async (tx: any) => {
      const newClip = await tx.clip.create({
        data: {
          userId: targetUserId,
          campaignId,
          clipAccountId: targetAccountId,
          clipUrl,
          status: "APPROVED",
          note: note || "Owner override submission",
          isOwnerOverride: true,
          earnings: 0,
        },
      });

      await tx.clipStat.create({
        data: { clipId: newClip.id, views: fetchedStats.views, likes: fetchedStats.likes, comments: fetchedStats.comments, shares: fetchedStats.shares },
      });

      // Tracking job: first check in ~5 minutes (unaligned), subsequent checks align to full hours
      await tx.trackingJob.create({
        data: { clipId: newClip.id, campaignId, nextCheckAt: new Date(Date.now() + 5 * 60_000), checkIntervalMin: 120, isActive: true },
      });

      return newClip;
    });

    // Calculate earnings from real views (if any)
    if (fetchedStats.views > 0) {
      try {
        const fullCampaign = await db.campaign.findUnique({
          where: { id: campaignId },
          select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, ownerCpm: true, pricingModel: true, budget: true },
        });
        if (fullCampaign) {
          const breakdown = recalculateClipEarningsBreakdown({
            stats: [{ views: fetchedStats.views }],
            campaign: fullCampaign,
          });
          await db.clip.update({
            where: { id: clip.id },
            data: { earnings: breakdown.clipperEarnings, baseEarnings: breakdown.baseEarnings, bonusPercent: breakdown.bonusPercent, bonusAmount: breakdown.bonusAmount },
          });

          // Agency earnings for CPM_SPLIT
          if (fullCampaign.pricingModel === "CPM_SPLIT" && fullCampaign.ownerCpm) {
            const cCpm = fullCampaign.clipperCpm ?? fullCampaign.cpmRate ?? null;
            const ownerAmt = calculateOwnerEarnings(fetchedStats.views, fullCampaign.ownerCpm, breakdown.baseEarnings, cCpm);
            if (ownerAmt > 0) {
              try {
                await db.agencyEarning.create({ data: { campaignId, clipId: clip.id, amount: ownerAmt, views: fetchedStats.views } });
              } catch {}
            }
          }
          console.log(`[OWNER-SUBMIT] Earnings calculated: $${breakdown.clipperEarnings} for ${fetchedStats.views} views`);
        }
      } catch (earningsErr: any) {
        console.error(`[OWNER-SUBMIT] Earnings calc failed:`, earningsErr?.message);
      }
    }

    // Budget check info
    let budgetInfo = null;
    if (campaign.budget && campaign.budget > 0) {
      const { getCampaignBudgetStatus } = await import("@/lib/balance");
      budgetInfo = await getCampaignBudgetStatus(campaignId);
    }

    return NextResponse.json({
      ...clip,
      effectiveCpm,
      budgetRemaining: budgetInfo?.remaining ?? null,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Owner clip submit error:", err?.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
