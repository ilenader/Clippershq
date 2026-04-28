import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { isUserMarketplaceBanned } from "@/lib/marketplace-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const POST_DEADLINE_MS = 24 * 60 * 60 * 1000;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/submissions/[id]/approve
 * Listing owner OR OWNER role can approve a PENDING submission.
 *
 * TODO (Phase 5): Enforce listing.dailySlotCount per UTC day before approval.
 * TODO (Phase 5): Cron will mark expired submissions; until then we check
 * `now > expiresAt` inline and reject expired ones with 400.
 */
export async function POST(_req: NextRequest, { params }: Params) {
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

  const rl = checkRoleAwareRateLimit(`mkt-submission-action:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        listingId: true,
        listing: { select: { id: true, userId: true } },
      },
    }),
    "marketplace.submission.findForApprove",
  );
  if (!submission) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isListingOwner = submission.listing?.userId === session.user.id;
  if (!isOwnerRole && !isListingOwner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (submission.status !== "PENDING") {
    return NextResponse.json(
      { error: `Submission already ${submission.status}.` },
      { status: 400 },
    );
  }

  const now = Date.now();
  if (submission.expiresAt && new Date(submission.expiresAt).getTime() < now) {
    return NextResponse.json({ error: "Submission expired." }, { status: 400 });
  }

  const approvedAt = new Date();
  const postDeadline = new Date(approvedAt.getTime() + POST_DEADLINE_MS);

  const updated: any = await withDbRetry(
    () => db!.marketplaceSubmission.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt,
        postDeadline,
      },
    }),
    "marketplace.submission.approve",
  );

  // Atomic counter increment on the parent listing.
  try {
    await withDbRetry(
      () => db!.marketplacePosterListing.update({
        where: { id: submission.listingId },
        data: { totalApproved: { increment: 1 } },
      }),
      "marketplace.submission.incrementApprovedCounter",
    );
  } catch {
    // counter drift is recoverable; do not fail the request
  }

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_SUBMISSION_APPROVE",
    targetType: "marketplace_submission",
    targetId: id,
    details: {
      previousStatus: submission.status,
      newStatus: "APPROVED",
      listingId: submission.listingId,
      postDeadline: postDeadline.toISOString(),
    },
  });

  return NextResponse.json({ submission: updated });
}
