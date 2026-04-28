import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { isUserMarketplaceBanned } from "@/lib/marketplace-ban";
import { detectPlatform } from "@/lib/apify";
import { createNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_URL_LEN = 500;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/submissions/[id]/post
 * Poster (or OWNER) reports the final clip URL for an APPROVED submission.
 * Creates a Clip with isMarketplaceClip=true, the MarketplaceClipPost link row,
 * a TrackingJob, and an initial zero-stat ClipStat — all atomically.
 *
 * The Clip lands as PENDING. OWNER must still approve it via the standard
 * /api/clips/[id]/review flow before earnings begin to accrue. Phase 6c forks
 * earnings calc on isMarketplaceClip to do the 60/30/10 split.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  // Marketplace-specific ban check — OWNER bypasses for testing/admin.
  // Activates for non-OWNER roles when Phase 11 widens the role gate above.
  if (role !== "OWNER") {
    const mktBan = await isUserMarketplaceBanned(session.user.id);
    if (mktBan.banned && mktBan.until) {
      return NextResponse.json(
        {
          error: `You are temporarily banned from the marketplace until ${mktBan.until.toISOString()}.`,
          bannedUntil: mktBan.until.toISOString(),
        },
        { status: 403 },
      );
    }
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-post:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawUrl = typeof body?.clipUrl === "string" ? body.clipUrl.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "clipUrl is required." }, { status: 400 });
  }
  if (rawUrl.length > MAX_URL_LEN) {
    return NextResponse.json({ error: `clipUrl must be at most ${MAX_URL_LEN} characters.` }, { status: 400 });
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "clipUrl must be an http(s) URL." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "clipUrl must be a valid URL." }, { status: 400 });
  }

  const { id } = await params;

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        postDeadline: true,
        postedAt: true,
        listingId: true,
        creatorId: true,
        platforms: true,
        listing: {
          select: {
            id: true,
            userId: true,
            campaignId: true,
            clipAccountId: true,
            clipAccount: { select: { id: true, username: true, platform: true } },
          },
        },
      },
    }),
    "marketplace.submission.findForPost",
  );
  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }

  // Poster gating — OWNER bypasses. 403 (not 404) per spec because the caller
  // is the listing owner who already knows the submission exists.
  const isListingOwner = submission.listing?.userId === session.user.id;
  if (role !== "OWNER" && !isListingOwner) {
    return NextResponse.json({ error: "Only the poster can mark this as posted." }, { status: 403 });
  }

  if (submission.status !== "APPROVED") {
    return NextResponse.json({ error: "Only approved submissions can be posted." }, { status: 400 });
  }
  if (submission.postedAt) {
    return NextResponse.json({ error: "This submission has already been posted." }, { status: 400 });
  }
  if (!submission.postDeadline || new Date() > new Date(submission.postDeadline)) {
    return NextResponse.json({ error: "Post deadline has passed." }, { status: 400 });
  }

  const detected = detectPlatform(rawUrl);
  if (detected === null) {
    return NextResponse.json({ error: "Could not detect platform from URL." }, { status: 400 });
  }
  const detectedUpper = detected.toUpperCase();
  if (!Array.isArray(submission.platforms) || !submission.platforms.includes(detectedUpper)) {
    const allowed = Array.isArray(submission.platforms) ? submission.platforms.join("/") : "";
    return NextResponse.json(
      { error: `Submission was approved for ${allowed}, but URL is ${detectedUpper}.` },
      { status: 400 },
    );
  }
  const accountPlatformLower = (submission.listing.clipAccount?.platform || "").toLowerCase();
  if (detected !== accountPlatformLower) {
    return NextResponse.json(
      { error: `Listing is for ${submission.listing.clipAccount?.platform}, but URL is ${detectedUpper}.` },
      { status: 400 },
    );
  }

  // URL normalization for duplicate detection — mirrors /api/clips:320-349.
  // Strip protocol, www, query, hash, trailing slash; lowercase.
  const normalizedUrl = rawUrl.toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "");

  const existingOnCampaign: any = await withDbRetry(
    () => db!.clip.findFirst({
      where: {
        campaignId: submission.listing.campaignId,
        clipUrl: { contains: normalizedUrl, mode: "insensitive" },
        status: { in: ["PENDING", "APPROVED"] },
        isDeleted: false,
      },
      select: { id: true },
    }),
    "marketplace.submission.post.findDuplicate",
  );
  if (existingOnCampaign) {
    return NextResponse.json(
      { error: "This clip URL has already been submitted to this campaign." },
      { status: 409 },
    );
  }

  // Atomic transaction — Clip + zero-stat seed + MarketplaceClipPost +
  // submission flip + listing counter + TrackingJob. All-or-nothing.
  let newClipId: string;
  try {
    const result: any = await db!.$transaction(async (tx: any) => {
      const newClip = await tx.clip.create({
        data: {
          userId: submission.listing.userId,
          campaignId: submission.listing.campaignId,
          clipAccountId: submission.listing.clipAccountId,
          clipUrl: rawUrl,
          status: "PENDING",
          isOwnerOverride: false,
          isMarketplaceClip: true,
          marketplaceSubmissionId: submission.id,
        },
        select: { id: true },
      });

      // Zero-stat seed so cron's first-tick growth calc has a baseline,
      // matching /api/clips and the Phase 4 YouTube backfill convention.
      await tx.clipStat.create({
        data: {
          clipId: newClip.id,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          isManual: false,
        },
      });

      await tx.marketplaceClipPost.create({
        data: {
          submissionId: submission.id,
          clipId: newClip.id,
          platform: detectedUpper,
          postedAt: new Date(),
        },
      });

      await tx.marketplaceSubmission.update({
        where: { id: submission.id },
        data: { status: "POSTED", postedAt: new Date() },
      });

      await tx.marketplacePosterListing.update({
        where: { id: submission.listing.id },
        data: { totalPosted: { increment: 1 } },
      });

      // TrackingJob — verbatim from /api/clips:374-386. Next :00 hour, 60min interval.
      const firstCheck = new Date();
      firstCheck.setMinutes(0, 0, 0);
      firstCheck.setHours(firstCheck.getHours() + 1);
      await tx.trackingJob.create({
        data: {
          clipId: newClip.id,
          campaignId: submission.listing.campaignId,
          nextCheckAt: firstCheck,
          checkIntervalMin: 60,
          isActive: true,
        },
      });

      return { clipId: newClip.id };
    });
    newClipId = result.clipId;
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "This clip URL has already been submitted to this campaign." },
        { status: 409 },
      );
    }
    console.error("[MKT-POST] Transaction failed:", err?.message || err);
    return NextResponse.json({ error: "Could not post this submission. Please try again." }, { status: 500 });
  }

  console.log(
    `[MKT-POST] User ${session.user.id} posted submission ${submission.id} as clip ${newClipId}`,
  );

  // Audit + notify — best-effort. Failures here must not fail the request;
  // the clip + tracking job are already committed.
  try {
    await logAudit({
      userId: session.user.id,
      action: "MARKETPLACE_SUBMISSION_POSTED",
      targetType: "marketplace_submission",
      targetId: submission.id,
      details: {
        clipId: newClipId,
        clipUrl: rawUrl,
        platform: detectedUpper,
        posterId: submission.listing.userId,
        creatorId: submission.creatorId,
        listingId: submission.listing.id,
      },
    });
  } catch (auditErr: any) {
    console.error("[MKT-POST] Audit log failed:", auditErr?.message);
  }

  try {
    await createNotification(
      submission.creatorId,
      "MKT_SUBMISSION_POSTED" as any,
      "Your clip was posted!",
      "Your clip is now live and being tracked.",
      {
        submissionId: submission.id,
        clipId: newClipId,
        clipUrl: rawUrl,
        platform: detectedUpper,
      },
    );
  } catch (notifErr: any) {
    console.error("[MKT-POST] Notification failed:", notifErr?.message);
  }

  return NextResponse.json(
    { success: true, clipId: newClipId, message: "Clip posted and tracking started." },
    { status: 201 },
  );
}
