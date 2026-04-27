import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
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

  return NextResponse.json({ listing: updated });
}
