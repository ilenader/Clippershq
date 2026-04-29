import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { assertNotMarketplaceBannedStrict } from "@/lib/marketplace-ban";
// Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate.
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
// Phase 9 — notify creator + fire email when a submission is approved.
import { createNotification } from "@/lib/notifications";
import { sendMarketplaceSubmissionApproved } from "@/lib/marketplace-email";
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

  const rl = checkRoleAwareRateLimit(`mkt-submission-action:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;

  // Phase 9 — fetch creator + listing display fields here so we can notify
  // after the update without a second round-trip.
  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        listingId: true,
        creatorId: true,
        creator: { select: { email: true, username: true } },
        listing: {
          select: {
            id: true,
            userId: true,
            clipAccount: { select: { username: true } },
            campaign: { select: { name: true } },
          },
        },
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

  // Phase 9 — notify creator (in-app) + email. In-app first so the bell
  // badge updates even when EMAIL_API_KEY is unset; email is fire-and-forget
  // in its own try/catch so Resend failures never break the approval.
  try {
    const accountUsername = submission.listing?.clipAccount?.username ?? "";
    const campaignName = submission.listing?.campaign?.name ?? "";
    const creatorUsername = submission.creator?.username ?? "creator";
    await createNotification(
      submission.creatorId,
      "MKT_SUBMISSION_APPROVED",
      "Your submission was approved!",
      `Your clip for ${campaignName} on @${accountUsername} was approved. Post within 24h.`,
      {
        submissionId: id,
        postDeadline: postDeadline.toISOString(),
        accountUsername,
      },
    );
    if (submission.creator?.email) {
      try {
        await sendMarketplaceSubmissionApproved({
          to: submission.creator.email,
          creatorUsername,
          accountUsername,
          campaignName,
          postDeadlineISO: postDeadline.toISOString(),
        });
      } catch {
        // swallow — email failure never breaks the parent action
      }
    }
  } catch {
    // swallow — notification side effects never break parent action
  }

  return NextResponse.json({ submission: updated });
}
