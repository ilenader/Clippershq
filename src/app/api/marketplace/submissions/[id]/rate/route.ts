import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { assertNotMarketplaceBannedStrict } from "@/lib/marketplace-ban";
// Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate.
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOTE = 1000;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/submissions/[id]/rate
 * Phase 7a — bidirectional rating create.
 *
 * Direction is derived server-side from the caller's identity:
 *   session.user.id === listing.userId      → POSTER_RATES_CREATOR
 *   session.user.id === submission.creatorId → CREATOR_RATES_POSTER
 *   anyone else                              → 403
 *
 * Cache columns (User.marketplaceAvg/CountAs* and Listing.averageRating /
 * ratingCount) are recomputed inside the same Serializable transaction as
 * the rating insert. Aggregates are tiny (one user's received ratings or one
 * listing's full set), so the recompute cost stays minimal even at scale.
 *
 * OWNER-only during the hidden phase, mirroring sister submission routes.
 * Phase 11 widens the role gate.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Phase: launch-fix H2 — fail-closed on ban check during mutations. DB blip should never accidentally let a banned user through.
  if (role !== "OWNER") {
    try {
      const mktBan = await assertNotMarketplaceBannedStrict(session.user.id);
      if (mktBan.banned && mktBan.until) {
        return NextResponse.json(
          {
            error: `You are temporarily banned from the marketplace until ${mktBan.until.toISOString()}.`,
            bannedUntil: mktBan.until.toISOString(),
          },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not verify marketplace status. Please try again." },
        { status: 503 },
      );
    }
  }

  const rl = checkRoleAwareRateLimit(`mkt-rating:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const score = body?.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
    return NextResponse.json({ error: "score must be an integer 1-5." }, { status: 400 });
  }
  const note = body?.note;
  if (note !== undefined && note !== null) {
    if (typeof note !== "string" || note.length > MAX_NOTE) {
      return NextResponse.json(
        { error: `note must be a string up to ${MAX_NOTE} characters.` },
        { status: 400 },
      );
    }
  }
  const noteTrim = typeof note === "string" ? note.trim() : "";

  const { id: submissionId } = await params;

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        creatorId: true,
        listingId: true,
        status: true,
        listing: { select: { id: true, userId: true } },
      },
    }),
    "marketplace.rating.findSubmission",
  );

  if (!submission) {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  if (submission.status !== "POSTED") {
    return NextResponse.json(
      { error: "Only posted submissions can be rated." },
      { status: 400 },
    );
  }

  const posterId: string = submission.listing.userId;
  const creatorId: string = submission.creatorId;

  // Phase 7a — direction derived from caller identity. posterId/creatorId
  // are role identifiers (see schema comment); the rater is whichever role
  // matches the session user.
  let direction: "POSTER_RATES_CREATOR" | "CREATOR_RATES_POSTER";
  let raterUserId: string;
  let ratedUserId: string;

  if (session.user.id === posterId) {
    direction = "POSTER_RATES_CREATOR";
    raterUserId = posterId;
    ratedUserId = creatorId;
  } else if (session.user.id === creatorId) {
    direction = "CREATOR_RATES_POSTER";
    raterUserId = creatorId;
    ratedUserId = posterId;
  } else {
    return NextResponse.json(
      { error: "Not authorized to rate this submission." },
      { status: 403 },
    );
  }

  try {
    const result: any = await withDbRetry(
      () => db!.$transaction(async (tx: any) => {
        // Phase 7a — composite unique on (submissionId, direction) blocks
        // duplicate ratings. P2002 on the create surfaces as 409 below.
        const rating = await tx.marketplaceRating.create({
          data: {
            submissionId,
            posterId,
            creatorId,
            direction,
            score,
            note: noteTrim.length > 0 ? noteTrim : null,
          },
        });

        if (direction === "POSTER_RATES_CREATOR") {
          // Recompute the creator's as-creator reputation across all ratings
          // they've received in this direction.
          const agg: any = await tx.marketplaceRating.aggregate({
            where: { creatorId, direction: "POSTER_RATES_CREATOR" },
            _avg: { score: true },
            _count: { _all: true },
          });
          await tx.user.update({
            where: { id: creatorId },
            data: {
              marketplaceAvgAsCreator: agg?._avg?.score ?? null,
              marketplaceCountAsCreator: agg?._count?._all ?? 0,
            },
          });
        } else {
          // Recompute the poster's as-poster reputation.
          const userAgg: any = await tx.marketplaceRating.aggregate({
            where: { posterId, direction: "CREATOR_RATES_POSTER" },
            _avg: { score: true },
            _count: { _all: true },
          });
          await tx.user.update({
            where: { id: posterId },
            data: {
              marketplaceAvgAsPoster: userAgg?._avg?.score ?? null,
              marketplaceCountAsPoster: userAgg?._count?._all ?? 0,
            },
          });
          // Recompute the listing-level rating across all CREATOR→POSTER
          // ratings on submissions belonging to this listing.
          const listingAgg: any = await tx.marketplaceRating.aggregate({
            where: {
              direction: "CREATOR_RATES_POSTER",
              submission: { listingId: submission.listingId },
            },
            _avg: { score: true },
            _count: { _all: true },
          });
          await tx.marketplacePosterListing.update({
            where: { id: submission.listingId },
            data: {
              averageRating: listingAgg?._avg?.score ?? null,
              ratingCount: listingAgg?._count?._all ?? 0,
            },
          });
        }

        return { rating };
      }, { isolationLevel: "Serializable" as any }),
      "marketplace.rating.createTx",
    );

    await logAudit({
      userId: raterUserId,
      action: "MARKETPLACE_RATING_CREATED",
      targetType: "marketplace_submission",
      targetId: submissionId,
      details: {
        submissionId,
        direction,
        score,
        raterUserId,
        ratedUserId,
        hasNote: noteTrim.length > 0,
      },
    });

    return NextResponse.json(
      {
        success: true,
        rating: {
          score: result.rating.score,
          note: result.rating.note,
          direction: result.rating.direction,
          createdAt: result.rating.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "You have already rated this submission." },
        { status: 409 },
      );
    }
    console.error("[MARKETPLACE-RATING-CREATE]", err?.message || err);
    return NextResponse.json(
      { error: "Could not save rating. Please try again." },
      { status: 500 },
    );
  }
}
