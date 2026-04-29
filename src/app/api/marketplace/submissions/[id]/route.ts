import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
// Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate.
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
// Phase: launch-fix H7 — audit log completeness for forensics.
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOTES = 2000;
const VALID_PLATFORMS = new Set(["TIKTOK", "INSTAGRAM", "YOUTUBE"]);

type Params = { params: Promise<{ id: string }> };

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
 * GET /api/marketplace/submissions/[id]
 * Visible to: creator, listing owner, OR OWNER role.
 * Returns 404 (not 403) on access denial — leak prevention.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-get:${session.user.id}`, 120, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      include: {
        // Phase: launch-fix C3 — privacy: posters must not see creator emails
        creator: { select: { id: true, username: true } },
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
    "marketplace.submission.findOne",
  );

  if (!submission) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isCreator = submission.creatorId === session.user.id;
  const isListingOwner = submission.listing?.userId === session.user.id;
  if (!isOwnerRole && !isCreator && !isListingOwner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ submission });
}

/**
 * PATCH /api/marketplace/submissions/[id]
 * Creator-only edit while status === PENDING. OWNER role bypasses ownership.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-edit:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: { id: true, creatorId: true, status: true },
    }),
    "marketplace.submission.findForPatch",
  );
  if (!submission) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isCreator = submission.creatorId === session.user.id;
  if (!isOwnerRole && !isCreator) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (submission.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot edit a submission in status ${submission.status}.` },
      { status: 400 },
    );
  }

  const data: Record<string, any> = {};

  if (body.driveUrl !== undefined) {
    if (typeof body.driveUrl !== "string" || !isValidDriveUrl(body.driveUrl)) {
      return NextResponse.json(
        { error: "driveUrl must be a valid Google Drive or Docs URL." },
        { status: 400 },
      );
    }
    data.driveUrl = body.driveUrl;
  }

  if (body.platforms !== undefined) {
    if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
      return NextResponse.json({ error: "platforms must be a non-empty array." }, { status: 400 });
    }
    for (const p of body.platforms) {
      if (typeof p !== "string" || !VALID_PLATFORMS.has(p)) {
        return NextResponse.json(
          { error: "platforms must each be one of TIKTOK, INSTAGRAM, YOUTUBE." },
          { status: 400 },
        );
      }
    }
    data.platforms = body.platforms;
  }

  if (body.notes !== undefined) {
    if (body.notes === null || body.notes === "") {
      data.notes = null;
    } else if (typeof body.notes !== "string" || body.notes.length > MAX_NOTES) {
      return NextResponse.json({ error: `notes must be a string up to ${MAX_NOTES} characters.` }, { status: 400 });
    } else {
      data.notes = body.notes.trim();
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
  }

  const updated: any = await withDbRetry(
    () => db!.marketplaceSubmission.update({ where: { id }, data }),
    "marketplace.submission.update",
  );

  // Phase: launch-fix H7 — audit log completeness for forensics.
  try {
    await logAudit({
      userId: session.user.id,
      action: "MARKETPLACE_SUBMISSION_EDIT",
      targetType: "marketplace_submission",
      targetId: id,
      details: {
        submissionId: id,
        fieldsChanged: Object.keys(data),
      },
    });
  } catch {
    // swallow — audit drift is recoverable
  }

  return NextResponse.json({ submission: updated });
}

/**
 * DELETE /api/marketplace/submissions/[id]
 * Hard-delete while PENDING. Creator only; OWNER role bypasses ownership.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-submission-delete:${session.user.id}`, 10, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;

  const submission: any = await withDbRetry(
    () => db!.marketplaceSubmission.findUnique({
      where: { id },
      select: { id: true, creatorId: true, status: true },
    }),
    "marketplace.submission.findForDelete",
  );
  if (!submission) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isCreator = submission.creatorId === session.user.id;
  if (!isOwnerRole && !isCreator) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (submission.status !== "PENDING") {
    return NextResponse.json(
      { error: `Cannot delete a submission in status ${submission.status}.` },
      { status: 400 },
    );
  }

  await withDbRetry(
    () => db!.marketplaceSubmission.delete({ where: { id } }),
    "marketplace.submission.delete",
  );

  // Phase: launch-fix H7 — audit log completeness for forensics.
  try {
    await logAudit({
      userId: session.user.id,
      action: "MARKETPLACE_SUBMISSION_DELETE",
      targetType: "marketplace_submission",
      targetId: id,
      details: {
        submissionId: id,
        previousStatus: submission.status,
        creatorId: submission.creatorId,
      },
    });
  } catch {
    // swallow — audit drift is recoverable
  }

  return NextResponse.json({ ok: true });
}
