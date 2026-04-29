import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
// Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate.
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_STATUS_FILTER = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "POSTED",
  "POST_EXPIRED",
]);

/**
 * GET /api/marketplace/submissions/incoming
 * Poster view: submissions targeting any listing owned by the current user.
 * OWNER-gated during hidden phase.
 * TODO (post-launch): allow non-OWNER posters once marketplace flag flips.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate. Per-resource scoping below (where.listing.userId === session.user.id) keeps non-poster users from seeing each other's incoming submissions. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-list-incoming:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status && !VALID_STATUS_FILTER.has(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
  const listingId = searchParams.get("listingId");
  const cursor = searchParams.get("cursor");
  const limitRaw = searchParams.get("limit");
  let take = 50;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      return NextResponse.json({ error: "limit must be an integer between 1 and 200." }, { status: 400 });
    }
    take = parsed;
  }

  const where: Record<string, any> = {
    listing: { userId: session.user.id },
  };
  if (status) where.status = status;
  if (listingId) where.listingId = listingId;

  const rows: any[] = await withDbRetry(
    () => db!.marketplaceSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        // Phase: privacy — strip creator.email. Posters only need username
        // (display) and id (action callbacks). Email exposure across users
        // is a leak even within the OWNER-gated hidden phase.
        // Phase 7a — also surface creator's as-creator rep so posters can
        // judge before approving ("@joe · ★ 4.7 (12)").
        creator: {
          select: {
            id: true,
            username: true,
            marketplaceAvgAsCreator: true,
            marketplaceCountAsCreator: true,
          },
        },
        listing: {
          select: {
            id: true,
            userId: true,
            dailySlotCount: true,
            // Phase 7a — listing-level rep (poster's listing reputation as
            // judged by past creators). Posters viewing their own listings
            // could care about this; the incoming page is poster-side so we
            // include it for completeness without leaking anything cross-user.
            averageRating: true,
            ratingCount: true,
            clipAccount: { select: { id: true, username: true, platform: true, profileLink: true } },
            campaign: { select: { id: true, name: true } },
          },
        },
        // Phase: surface posted clip URL for POSTED submissions so the
        // poster-review page can render a "View posted clip" verification link
        // without an extra round-trip. Mirror of the same pattern in the
        // creator's GET /api/marketplace/submissions handler.
        posts: {
          select: { clip: { select: { clipUrl: true } } },
          orderBy: { postedAt: "desc" },
          take: 1,
        },
        // Phase 7a — surface existing ratings so the UI can swap the
        // "Rate creator" button for a "★ Rated 5/5" readout when the
        // current user has already rated. Privacy: scores and notes from
        // both directions are visible to both parties (public-comment
        // policy from D6/Q6).
        ratings: {
          select: {
            direction: true,
            score: true,
            note: true,
            posterId: true,
            creatorId: true,
            createdAt: true,
          },
        },
      },
    }),
    "marketplace.submission.listIncoming",
  );

  let nextCursor: string | null = null;
  let submissions = rows;
  if (rows.length > take) {
    submissions = rows.slice(0, take);
    nextCursor = submissions[submissions.length - 1]?.id ?? null;
  }

  // Phase: launch-fix H4 — collusion detection placeholder until Phase 4b videoHash ships.
  // Flag PENDING submissions whose driveUrl appears on another PENDING submission for the
  // same listing under a different creator. UI renders a soft warning chip when set.
  // Restricted to PENDING because that's the actionable review window — past PENDING the
  // signal is informational only and the review action is already past.
  try {
    const pendingRows = submissions.filter(
      (s: any) => s?.status === "PENDING" && typeof s?.driveUrl === "string" && s.driveUrl.length > 0,
    );
    if (pendingRows.length > 0) {
      const listingIds = Array.from(new Set(pendingRows.map((s: any) => s.listingId).filter(Boolean)));
      const driveUrls = Array.from(new Set(pendingRows.map((s: any) => s.driveUrl)));
      const dupCandidates: any[] = await withDbRetry(
        () => db!.marketplaceSubmission.findMany({
          where: {
            status: "PENDING",
            listingId: { in: listingIds },
            driveUrl: { in: driveUrls },
          },
          select: { id: true, listingId: true, driveUrl: true, creatorId: true },
          take: 2000,
        }),
        "marketplace.submission.incoming.dupScan",
      );
      const dupKeySet = new Set<string>();
      // Build (listingId, driveUrl) → set of creatorIds. >1 distinct creator = duplicate.
      const groupCreators = new Map<string, Set<string>>();
      for (const row of dupCandidates) {
        const key = `${row.listingId}::${row.driveUrl}`;
        let set = groupCreators.get(key);
        if (!set) { set = new Set<string>(); groupCreators.set(key, set); }
        set.add(row.creatorId);
      }
      for (const [key, creators] of groupCreators) {
        if (creators.size > 1) dupKeySet.add(key);
      }
      submissions = submissions.map((s: any) => {
        if (s?.status !== "PENDING" || !s?.driveUrl || !s?.listingId) {
          return { ...s, duplicateDriveUrl: false };
        }
        const k = `${s.listingId}::${s.driveUrl}`;
        return { ...s, duplicateDriveUrl: dupKeySet.has(k) };
      });
    } else {
      submissions = submissions.map((s: any) => ({ ...s, duplicateDriveUrl: false }));
    }
  } catch {
    // Soft-fail: never break the incoming response if dup detection errors out.
    submissions = submissions.map((s: any) => ({ ...s, duplicateDriveUrl: false }));
  }

  return NextResponse.json({ submissions, nextCursor });
}
