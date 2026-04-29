import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
// Phase 3b-3 — audit logging on pause/unpause.
import { logAudit } from "@/lib/audit";
// Phase: launch-fix C1 — feature-flag gate replaces OWNER hard-gate.
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
// Phase: launch-fix H8 — symmetry with create-flow ban check on mutation paths.
import { assertNotMarketplaceBannedStrict } from "@/lib/marketplace-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/listings/[id]/pause
 * Toggle pause/unpause. ACTIVE → PAUSED, PAUSED → ACTIVE. Other statuses → 400.
 * Listing owner or OWNER role only.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Phase: launch-fix C1 — feature-flag gate. Flag flip in Phase 11 opens this to all users.
  if (!isMarketplaceVisibleForUser(session.user as any)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Phase: launch-fix H8 — symmetry with create-flow ban check. Banned posters can't manipulate listings during ban.
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

  const rl = checkRoleAwareRateLimit(`mkt-listing-pause:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  const listing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    }),
    "marketplace.listing.findForPause",
  );
  if (!listing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isOwnerRole = role === "OWNER";
  const isListingOwner = listing.userId === session.user.id;
  if (!isOwnerRole && !isListingOwner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let nextStatus: "ACTIVE" | "PAUSED";
  let pausedAt: Date | null;
  if (listing.status === "ACTIVE") {
    nextStatus = "PAUSED";
    pausedAt = new Date();
  } else if (listing.status === "PAUSED") {
    nextStatus = "ACTIVE";
    pausedAt = null;
  } else {
    return NextResponse.json(
      { error: `Cannot pause/unpause a listing in status ${listing.status}.` },
      { status: 400 },
    );
  }

  const updated = await withDbRetry(
    () => db!.marketplacePosterListing.update({
      where: { id },
      data: { status: nextStatus, pausedAt },
    }),
    "marketplace.listing.pauseToggle",
  );

  // Phase 3b-3 — audit log pause/unpause toggles. Best-effort.
  try {
    await logAudit({
      userId: session.user.id,
      action:
        nextStatus === "PAUSED"
          ? "MARKETPLACE_LISTING_PAUSE"
          : "MARKETPLACE_LISTING_UNPAUSE",
      targetType: "marketplace_listing",
      targetId: id,
      details: {
        listingId: id,
        fromStatus: listing.status,
        toStatus: nextStatus,
      },
    });
  } catch {
    // swallow — audit drift is recoverable
  }

  return NextResponse.json({ listing: updated });
}
