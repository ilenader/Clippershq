import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOTES = 2000;
const VALID_PLATFORMS = new Set(["TIKTOK", "INSTAGRAM", "YOUTUBE"]);
const SUBMISSION_TTL_MS = 24 * 60 * 60 * 1000;
const VALID_STATUS_FILTER = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "POSTED",
  "POST_EXPIRED",
]);

function isValidDriveUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "drive.google.com" ||
      host.endsWith(".drive.google.com") ||
      host === "docs.google.com" ||
      host.endsWith(".docs.google.com")
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/marketplace/submissions
 * Creator submits a Drive link for review against an ACTIVE listing.
 * OWNER-gated during hidden phase.
 * TODO (post-launch): allow non-OWNER creators once marketplace flag flips.
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

  const rl = checkRoleAwareRateLimit(`mkt-submission-create:${session.user.id}`, 20, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { listingId, driveUrl, platforms, notes } = data;

  if (!listingId || typeof listingId !== "string") {
    return NextResponse.json({ error: "listingId is required." }, { status: 400 });
  }
  if (typeof driveUrl !== "string" || !isValidDriveUrl(driveUrl)) {
    return NextResponse.json(
      { error: "driveUrl must be a valid Google Drive or Docs URL." },
      { status: 400 },
    );
  }
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return NextResponse.json({ error: "platforms must be a non-empty array." }, { status: 400 });
  }
  for (const p of platforms) {
    if (typeof p !== "string" || !VALID_PLATFORMS.has(p)) {
      return NextResponse.json(
        { error: "platforms must each be one of TIKTOK, INSTAGRAM, YOUTUBE." },
        { status: 400 },
      );
    }
  }
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== "string" || notes.length > MAX_NOTES) {
      return NextResponse.json({ error: `notes must be a string up to ${MAX_NOTES} characters.` }, { status: 400 });
    }
  }

  // Verify listing exists, is ACTIVE, and is not owned by the submitter.
  const listing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id: listingId },
      select: { id: true, userId: true, status: true },
    }),
    "marketplace.submission.findListing",
  );
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }
  if (listing.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Listing is not active. Only ACTIVE listings accept submissions." },
      { status: 400 },
    );
  }
  if (listing.userId === session.user.id) {
    return NextResponse.json(
      { error: "You cannot submit to your own listing." },
      { status: 400 },
    );
  }

  // Block active duplicate by same creator with same Drive URL still PENDING.
  const dup: any = await withDbRetry(
    () => db!.marketplaceSubmission.findFirst({
      where: { creatorId: session.user.id, driveUrl, status: "PENDING" },
      select: { id: true },
    }),
    "marketplace.submission.findActiveDuplicate",
  );
  if (dup) {
    return NextResponse.json(
      { error: "You already have a pending submission with this Drive link." },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + SUBMISSION_TTL_MS);

  // videoHash stays null in Phase 4a — Phase 4b will compute and write it.
  let submission: any;
  try {
    submission = await withDbRetry(
      () => db!.marketplaceSubmission.create({
        data: {
          creatorId: session.user.id,
          listingId,
          driveUrl,
          platforms,
          notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
          expiresAt,
          videoHash: null,
        },
      }),
      "marketplace.submission.create",
    );
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "Duplicate submission detected." },
        { status: 409 },
      );
    }
    throw err;
  }

  // Atomic counter increment; safe under concurrency. Best-effort — if it
  // fails the submission still exists and the counter can be reconciled later.
  try {
    await withDbRetry(
      () => db!.marketplacePosterListing.update({
        where: { id: listingId },
        data: { totalSubmissions: { increment: 1 } },
      }),
      "marketplace.submission.incrementListingCounter",
    );
  } catch {
    // swallow — counter drift is recoverable; do not fail the request
  }

  return NextResponse.json({ submission }, { status: 201 });
}

/**
 * GET /api/marketplace/submissions
 * Returns the current user's own submissions (creator view), cursor-paginated.
 * Supports ?status= filter.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-list-mine:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status && !VALID_STATUS_FILTER.has(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
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

  const where: Record<string, any> = { creatorId: session.user.id };
  if (status) where.status = status;

  const rows: any[] = await withDbRetry(
    () => db!.marketplaceSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        listing: {
          select: {
            id: true,
            userId: true,
            clipAccount: { select: { id: true, username: true, platform: true, profileLink: true } },
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    }),
    "marketplace.submission.listMine",
  );

  let nextCursor: string | null = null;
  let submissions = rows;
  if (rows.length > take) {
    submissions = rows.slice(0, take);
    nextCursor = submissions[submissions.length - 1]?.id ?? null;
  }

  return NextResponse.json({ submissions, nextCursor });
}
