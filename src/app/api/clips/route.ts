import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { fetchClipStats, detectPlatform } from "@/lib/apify";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/** Detect platform from a clip URL */
function detectPlatformFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const campaignId = req.nextUrl.searchParams.get("campaignId");
  // ?includeArchived=true for archive page stats
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  if (!db) return NextResponse.json([]);

  try {
    const where: any = { isDeleted: false };
    if (status) where.status = status as any;
    if (campaignId) where.campaignId = campaignId;

    // Exclude clips from archived campaigns in live views
    if (!includeArchived) {
      where.campaign = { isArchived: false };
    }

    // ADMIN: only clips for their allowed campaigns
    if (role === "ADMIN") {
      const ids = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(ids)) {
        if (campaignId) {
          if (!ids.includes(campaignId)) {
            return NextResponse.json([]);
          }
        } else {
          where.campaignId = { in: ids };
        }
      }
    }

    const clips = await db.clip.findMany({
      where,
      include: {
        user: { select: { username: true, image: true, discordId: true, trustScore: true } },
        campaign: { select: { name: true, platform: true, createdById: true, isArchived: true } },
        clipAccount: { select: { username: true, platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 3 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clips);
  } catch (err: any) {
    console.error("GET /api/clips error:", err?.message);
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Only clippers can submit clips
  const role = (session.user as any).role;
  if (role !== "CLIPPER") {
    return NextResponse.json({ error: "You don't have permission to submit clips." }, { status: 403 });
  }

  // Rate limit: 10 clip submissions per hour per user
  const rl = checkRateLimit(`clip-submit:${session.user.id}`, 10, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.campaignId || !data.clipAccountId || !data.clipUrl) {
    return NextResponse.json({ error: "Campaign, account, and clip URL are required" }, { status: 400 });
  }

  try { new URL(data.clipUrl); } catch {
    return NextResponse.json({ error: "Please enter a valid URL (e.g. https://tiktok.com/...)." }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.findFirst({
      where: { id: data.clipAccountId, userId: session.user.id, status: "APPROVED" },
    });
    if (!account) {
      return NextResponse.json({ error: "Your account must be approved before submitting clips. Check your Accounts page." }, { status: 400 });
    }

    // ── RULE 0: Must have joined the campaign with this account ──
    const membership = await db.campaignAccount.findUnique({
      where: { clipAccountId_campaignId: { clipAccountId: data.clipAccountId, campaignId: data.campaignId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "You must join this campaign before submitting clips." }, { status: 403 });
    }

    // ── RULE: Max clips per user per day per campaign ──
    const campaign = await db.campaign.findUnique({
      where: { id: data.campaignId },
      select: { maxClipsPerUserPerDay: true, status: true, budget: true },
    });
    if (!campaign || (campaign.status !== "ACTIVE" && campaign.status !== "PAUSED")) {
      return NextResponse.json({ error: "This campaign is not available for submissions right now." }, { status: 400 });
    }

    // ── RULE: Budget cap — check if campaign budget is exhausted ──
    if (campaign.budget != null && campaign.budget > 0) {
      const { getCampaignBudgetStatus } = await import("@/lib/balance");
      const budgetStatus = await getCampaignBudgetStatus(data.campaignId);
      if (budgetStatus?.isOverBudget) {
        return NextResponse.json({ error: "This campaign's budget has been reached. Check out other active campaigns!" }, { status: 400 });
      }
    }
    const maxPerDay = campaign.maxClipsPerUserPerDay ?? 3;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayCount = await db.clip.count({
      where: {
        userId: session.user.id,
        campaignId: data.campaignId,
        createdAt: { gte: startOfDay },
        isDeleted: false,
      },
    });
    if (todayCount >= maxPerDay) {
      return NextResponse.json({
        error: "You reached the maximum number of uploaded clips for this campaign today.",
        remaining: 0,
        limit: maxPerDay,
      }, { status: 400 });
    }

    // ── RULE 1: Platform must match ──
    const urlPlatform = detectPlatformFromUrl(data.clipUrl);
    if (urlPlatform && account.platform !== urlPlatform) {
      return NextResponse.json({
        error: `Platform mismatch: your account is ${account.platform} but the clip URL is from ${urlPlatform}. Use a ${account.platform} clip URL.`,
      }, { status: 400 });
    }

    // ── RULE 2: Clip must be submitted within 2 hours of posting ──
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const platform = detectPlatform(data.clipUrl);

    // Store fetched stats so we can save them with the clip (not zeros)
    let fetchedStats: { views: number; likes: number; comments: number; shares: number } | null = null;

    if (platform === "tiktok" || platform === "instagram") {
      // Fetch REAL post time + stats from Apify — never trust user input
      try {
        const stats = await fetchClipStats(data.clipUrl);
        if (stats.createdAt) {
          const postedTime = new Date(stats.createdAt).getTime();
          if (Date.now() - postedTime > twoHoursMs) {
            return NextResponse.json({
              error: `This ${platform === "tiktok" ? "TikTok" : "Instagram"} clip was posted more than 2 hours ago and cannot be submitted.`,
            }, { status: 400 });
          }
        } else if (platform === "instagram") {
          // Instagram: block if we can't verify post time — no silent fallback
          return NextResponse.json({
            error: "We could not verify when this Instagram clip was posted. Please try again.",
          }, { status: 400 });
        } else {
          // TikTok: existing lenient behavior — allow if createdAt unavailable
          console.warn(`[Clip Submit] TikTok createdAt unavailable for ${data.clipUrl}, allowing submission`);
        }
        fetchedStats = { views: stats.views, likes: stats.likes, comments: stats.comments, shares: stats.shares };
      } catch (err: any) {
        if (platform === "instagram") {
          // Instagram: block on API failure — no silent fallback
          console.error(`[Clip Submit] Instagram verification failed for ${data.clipUrl}: ${err.message}`);
          return NextResponse.json({
            error: "We could not verify this Instagram clip right now. Please try again.",
          }, { status: 400 });
        }
        // TikTok: existing lenient behavior — allow if Apify fails
        console.warn(`[Clip Submit] Apify TikTok check failed for ${data.clipUrl}: ${err.message}`);
      }
    }

    const existing = await db.clip.findFirst({
      where: { clipUrl: data.clipUrl, campaignId: data.campaignId },
    });
    if (existing) {
      return NextResponse.json({ error: "This clip URL has already been submitted for this campaign." }, { status: 400 });
    }

    const existingOther = await db.clip.findFirst({
      where: { clipUrl: data.clipUrl, userId: session.user.id },
    });
    if (existingOther) {
      return NextResponse.json({ error: "You've already submitted this clip URL to another campaign." }, { status: 400 });
    }

    // Create clip, first snapshot, and tracking job atomically
    const clip = await db.$transaction(async (tx: any) => {
      const newClip = await tx.clip.create({
        data: {
          userId: session.user.id,
          campaignId: data.campaignId,
          clipAccountId: data.clipAccountId,
          clipUrl: data.clipUrl,
          note: data.note || null,
        },
      });

      await tx.clipStat.create({
        data: {
          clipId: newClip.id,
          views: fetchedStats?.views ?? 0,
          likes: fetchedStats?.likes ?? 0,
          comments: fetchedStats?.comments ?? 0,
          shares: fetchedStats?.shares ?? 0,
        },
      });

      // Create tracking job for trackable clips — schedule next check at the next round hour
      if (platform === "tiktok" || platform === "instagram") {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setMinutes(0, 0, 0);
        nextHour.setHours(nextHour.getHours() + 1);

        await tx.trackingJob.create({
          data: {
            clipId: newClip.id,
            campaignId: data.campaignId,
            nextCheckAt: nextHour,
            checkIntervalMin: 60, // Phase 1: every 1 hour
            isActive: true,
          },
        });
      }

      return newClip;
    });

    // Update clipper streak (non-blocking)
    import("@/lib/gamification").then(({ updateStreak }) => updateStreak(session.user.id)).catch(() => {});

    return NextResponse.json(clip, { status: 201 });
  } catch (err: any) {
    console.error("DB clip create failed:", err?.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
