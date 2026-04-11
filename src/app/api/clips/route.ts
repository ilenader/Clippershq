import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { fetchClipStats, detectPlatform } from "@/lib/apify";
import { roundToNextSlot } from "@/lib/tracking";
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

    // ── RULE 0: User must have joined the campaign with ANY of their accounts ──
    const userAccounts = await db.clipAccount.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const userAccountIds = userAccounts.map((a: any) => a.id);
    const membership = await db.campaignAccount.findFirst({
      where: { campaignId: data.campaignId, clipAccountId: { in: userAccountIds } },
    });
    if (!membership) {
      console.log(`[CLIPS] Join check failed: user=${session.user.id}, campaign=${data.campaignId}, account=${data.clipAccountId}, userAccountIds=${userAccountIds.join(",")}`);
      return NextResponse.json({ error: "You must join this campaign before submitting clips." }, { status: 403 });
    }

    // ── RULE: Max clips per user per day per campaign ──
    const campaign = await db.campaign.findUnique({
      where: { id: data.campaignId },
      select: { maxClipsPerUserPerDay: true, status: true, budget: true, platform: true },
    });
    if (!campaign || campaign.status === "DRAFT" || campaign.status === "COMPLETED") {
      return NextResponse.json({ error: "This campaign is not available for submissions right now." }, { status: 400 });
    }
    if (campaign.status === "PAUSED") {
      return NextResponse.json({ error: "This campaign is paused — budget limit reached. Check out other active campaigns!" }, { status: 400 });
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

    // ── RULE 1b: Clip platform must match campaign's allowed platforms ──
    if (urlPlatform && campaign.platform) {
      const allowed = campaign.platform.split(",").map((p: string) => p.trim().toLowerCase());
      if (!allowed.includes(urlPlatform.toLowerCase())) {
        return NextResponse.json({
          error: `This campaign only accepts ${campaign.platform} clips. Your link is from ${urlPlatform}.`,
        }, { status: 400 });
      }
    }

    // ── RULE 2: Clip must be submitted within 2 hours of posting ──
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const platform = detectPlatform(data.clipUrl);

    // Store fetched stats so we can save them with the clip (not zeros)
    let fetchedStats: { views: number; likes: number; comments: number; shares: number } | null = null;

    console.log(`[FRESHNESS] Platform: ${platform}, URL: ${data.clipUrl}`);

    if (platform === "tiktok" || platform === "instagram") {
      // Fetch REAL post time + stats from Apify — never trust user input
      try {
        console.log(`[CLIP-SUBMIT] Fetching stats for URL: ${data.clipUrl}`);
        const stats = await fetchClipStats(data.clipUrl);
        console.log(`[CLIP-SUBMIT] Stats result: views=${stats.views} likes=${stats.likes} comments=${stats.comments} shares=${stats.shares} createdAt=${stats.createdAt || "null"}`);
        console.log(`[FRESHNESS] ${platform} createdAt: ${stats.createdAt || "null"}`);
        if (stats.createdAt) {
          const postedTime = new Date(stats.createdAt).getTime();
          const diffMs = Date.now() - postedTime;
          const diffHours = Math.round(diffMs / 3600000 * 10) / 10;
          console.log(`[FRESHNESS] Posted ${diffHours}h ago (limit: 2h)`);
          if (diffMs > twoHoursMs) {
            console.log(`[FRESHNESS] REJECTED — ${platform} clip posted ${diffHours}h ago`);
            return NextResponse.json({
              error: `This ${platform === "tiktok" ? "TikTok" : "Instagram"} clip was posted more than 2 hours ago and cannot be submitted.`,
            }, { status: 400 });
          }
          console.log(`[FRESHNESS] PASSED — within 2h window`);
        } else if (platform === "instagram") {
          console.log(`[FRESHNESS] REJECTED — Instagram createdAt unavailable`);
          return NextResponse.json({
            error: "We could not verify when this Instagram clip was posted. Please try again.",
          }, { status: 400 });
        } else {
          console.warn(`[FRESHNESS] TikTok createdAt unavailable — allowing (lenient)`);
        }
        fetchedStats = { views: stats.views, likes: stats.likes, comments: stats.comments, shares: stats.shares };
        if (stats.views === 0 && stats.likes === 0 && stats.comments === 0 && stats.shares === 0) {
          console.warn(`[CLIP-SUBMIT] WARNING: Stats returned all zeros for URL: ${data.clipUrl}`);
        }
      } catch (err: any) {
        if (platform === "instagram") {
          console.error(`[FRESHNESS] Instagram API failed: ${err.message}`);
          return NextResponse.json({
            error: "We could not verify this Instagram clip right now. Please try again.",
          }, { status: 400 });
        }
        console.warn(`[FRESHNESS] TikTok API failed: ${err.message} — allowing (lenient)`);
      }
    } else if (platform === "youtube") {
      // YouTube: use YouTube Data API to check posting time
      try {
        const { getYouTubeVideoDetails } = await import("@/lib/youtube");
        const details = await getYouTubeVideoDetails(data.clipUrl);
        console.log(`[FRESHNESS] YouTube details: publishedAt=${details?.publishedAt || "null"}, views=${details?.views || 0}`);
        if (details) {
          if (details.publishedAt) {
            const postedTime = new Date(details.publishedAt).getTime();
            const diffMs = Date.now() - postedTime;
            const diffHours = Math.round(diffMs / 3600000 * 10) / 10;
            console.log(`[FRESHNESS] YouTube posted ${diffHours}h ago (limit: 2h)`);
            if (diffMs > twoHoursMs) {
              console.log(`[FRESHNESS] REJECTED — YouTube clip posted ${diffHours}h ago`);
              return NextResponse.json({
                error: `This YouTube clip was posted more than 2 hours ago and cannot be submitted.`,
              }, { status: 400 });
            }
            console.log(`[FRESHNESS] PASSED — within 2h window`);
          } else {
            console.log(`[FRESHNESS] REJECTED — YouTube publishedAt unavailable`);
            return NextResponse.json({
              error: "Could not verify when this YouTube clip was posted. Please try again.",
            }, { status: 400 });
          }
          fetchedStats = { views: details.views, likes: details.likes, comments: details.comments, shares: 0 };
        } else {
          console.log(`[FRESHNESS] REJECTED — YouTube API returned null (no API key or invalid URL)`);
          return NextResponse.json({
            error: "Could not verify this YouTube clip. Make sure YOUTUBE_API_KEY is configured and the URL is valid.",
          }, { status: 400 });
        }
      } catch (err: any) {
        console.error(`[FRESHNESS] YouTube API error: ${err.message}`);
        return NextResponse.json({
          error: "Could not verify this YouTube clip right now. Please try again.",
        }, { status: 400 });
      }
    } else {
      console.log(`[FRESHNESS] Unknown platform "${platform}" — rejecting`);
      return NextResponse.json({
        error: "Could not detect the platform from this URL. Please use a TikTok, Instagram, or YouTube clip link.",
      }, { status: 400 });
    }

    // Normalize URL for duplicate detection: strip query params, protocol, www
    const normalizedUrl = data.clipUrl.split("?")[0].toLowerCase().trim()
      .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

    const existingOnCampaign = await db.clip.findFirst({
      where: {
        campaignId: data.campaignId,
        clipUrl: { contains: normalizedUrl },
        status: { in: ["PENDING", "APPROVED"] },
        isDeleted: false,
      },
    });
    if (existingOnCampaign) {
      return NextResponse.json({ error: "This clip has already been submitted to this campaign." }, { status: 400 });
    }

    const existingByUser = await db.clip.findFirst({
      where: {
        userId: session.user.id,
        clipUrl: { contains: normalizedUrl },
        status: { in: ["PENDING", "APPROVED"] },
        isDeleted: false,
      },
    });
    if (existingByUser) {
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
        await tx.trackingJob.create({
          data: {
            clipId: newClip.id,
            campaignId: data.campaignId,
            nextCheckAt: roundToNextSlot(60),
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
