import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/listings/[id]/cancel-delete
 * Phase 3b-3 — undoes a DELETION_REQUESTED state by flipping the listing
 * back to ACTIVE. Listing owner OR OWNER role only; 404 (not 403) on the
 * negative path to avoid leaking listing existence.
 *
 * Restore-to-ACTIVE rationale: we don't track "what status the listing was
 * before deletion was requested" (a poster can request delete from ACTIVE
 * or PAUSED — schema doesn't capture which). ACTIVE is the safe default
 * because it preserves discoverability; if the poster wanted PAUSED again
 * they can call /pause immediately afterwards. Documented here so future
 * eyes don't try to "fix" the restore destination.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase 3b-3 — same rate limit shape as pause (30/hr). Cancel-delete is
  // similarly low-risk and reversible.
  const rl = checkRoleAwareRateLimit(`mkt-listing-cancel-delete:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  const listing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    }),
    "marketplace.listing.findForCancelDelete",
  );
  if (!listing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isListingOwner = listing.userId === session.user.id;
  if (!isOwnerRole && !isListingOwner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (listing.status !== "DELETION_REQUESTED") {
    return NextResponse.json(
      { error: "Can only cancel a pending deletion." },
      { status: 400 },
    );
  }

  const updated: any = await withDbRetry(
    () => db!.marketplacePosterListing.update({
      where: { id },
      data: {
        status: "ACTIVE",
        deletionRequestedAt: null,
      },
    }),
    "marketplace.listing.cancelDelete",
  );

  // Phase 3b-3 — audit log. Best-effort.
  try {
    await logAudit({
      userId: session.user.id,
      action: "MARKETPLACE_LISTING_DELETE_REQUEST_CANCEL",
      targetType: "marketplace_listing",
      targetId: id,
      details: {
        listingId: id,
        fromStatus: "DELETION_REQUESTED",
        toStatus: "ACTIVE",
      },
    });
  } catch {
    // swallow — audit drift is recoverable
  }

  return NextResponse.json({
    success: true,
    listing: { id: updated.id, status: updated.status },
  });
}
