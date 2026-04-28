import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { isUserMarketplaceBanned } from "@/lib/marketplace-ban";
// Phase 9 — notify creator + fire email when a submission is rejected.
import { createNotification } from "@/lib/notifications";
import { sendMarketplaceSubmissionRejected } from "@/lib/marketplace-email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_REASON = 1000;
const MAX_NOTE = 1000;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/submissions/[id]/reject
 * Listing owner OR OWNER role can reject a PENDING submission.
 *
 * TODO (Phase 5): Cron will mark expired submissions; until then we check
 * `now > expiresAt` inline and reject expired ones with 400.
 * TODO (Phase 4b): When videoHash is set, increment MarketplaceVideoHash.rejectionCount.
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

  const rl = checkRoleAwareRateLimit(`mkt-submission-action:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const reason = body?.reason;
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > MAX_REASON) {
    return NextResponse.json(
      { error: `reason is required and must be 1-${MAX_REASON} characters.` },
      { status: 400 },
    );
  }
  const improvementNote = body?.improvementNote;
  if (improvementNote !== undefined && improvementNote !== null) {
    if (typeof improvementNote !== "string" || improvementNote.length > MAX_NOTE) {
      return NextResponse.json(
        { error: `improvementNote must be a string up to ${MAX_NOTE} characters.` },
        { status: 400 },
      );
    }
  }

  const { id } = await params;

  // Phase 9 — fetch creator + listing display fields so we can notify after
  // the update without a second round-trip.
  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        listingId: true,
        creatorId: true,
        videoHash: true,
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
    "marketplace.submission.findForReject",
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

  const updated: any = await withDbRetry(
    () => db!.marketplaceSubmission.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
        improvementNote:
          typeof improvementNote === "string" && improvementNote.trim().length > 0
            ? improvementNote.trim()
            : null,
      },
    }),
    "marketplace.submission.reject",
  );

  // Forward-prep for Phase 4b: increment video-hash rejection counter when present.
  // videoHash is null in 4a, so this block is a no-op now and starts working
  // automatically once Phase 4b begins writing hashes.
  if (typeof submission.videoHash === "string" && submission.videoHash.length > 0) {
    try {
      await withDbRetry(
        () => db!.marketplaceVideoHash.update({
          where: { hash: submission.videoHash },
          data: { rejectionCount: { increment: 1 } },
        }),
        "marketplace.submission.incrementHashRejection",
      );
    } catch {
      // hash row may not exist yet; ignore — Phase 4b will manage creation.
    }
  }

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_SUBMISSION_REJECT",
    targetType: "marketplace_submission",
    targetId: id,
    details: {
      previousStatus: submission.status,
      newStatus: "REJECTED",
      listingId: submission.listingId,
      reason: reason.trim(),
      hasImprovementNote:
        typeof improvementNote === "string" && improvementNote.trim().length > 0,
    },
  });

  // Phase 9 — notify creator (in-app) + email. Body truncates the reason at
  // 200 chars for the bell preview; full reason ships in the email body.
  // Both side effects wrapped so a failure never breaks the rejection.
  try {
    const accountUsername = submission.listing?.clipAccount?.username ?? "";
    const campaignName = submission.listing?.campaign?.name ?? "";
    const creatorUsername = submission.creator?.username ?? "creator";
    const trimmedReason = reason.trim();
    const trimmedNote =
      typeof improvementNote === "string" && improvementNote.trim().length > 0
        ? improvementNote.trim()
        : null;
    const reasonShort = trimmedReason.length > 200 ? trimmedReason.slice(0, 197) + "…" : trimmedReason;
    await createNotification(
      submission.creatorId,
      "MKT_SUBMISSION_REJECTED",
      "Your submission was not approved",
      `Your clip for ${campaignName} on @${accountUsername} was rejected. Reason: ${reasonShort}`,
      {
        submissionId: id,
        reason: trimmedReason,
        improvementNote: trimmedNote,
        accountUsername,
      },
    );
    if (submission.creator?.email) {
      try {
        await sendMarketplaceSubmissionRejected({
          to: submission.creator.email,
          creatorUsername,
          accountUsername,
          campaignName,
          reason: trimmedReason,
          improvementNote: trimmedNote,
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
