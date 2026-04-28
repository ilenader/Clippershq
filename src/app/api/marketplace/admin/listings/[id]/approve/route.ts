import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
// Phase 9 — notify poster + fire email when an OWNER approves a listing.
import { createNotification } from "@/lib/notifications";
import { sendMarketplaceListingApproved } from "@/lib/marketplace-email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/admin/listings/[id]/approve
 * OWNER-only. Approves a PENDING_APPROVAL listing → ACTIVE.
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

  const rl = checkRoleAwareRateLimit(`mkt-admin-listing-action:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  // Phase 9 — fetch poster + display fields here so we can notify after
  // the update without a second round-trip.
  const listing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        userId: true,
        user: { select: { email: true, username: true } },
        clipAccount: { select: { username: true } },
        campaign: { select: { name: true } },
      },
    }),
    "marketplace.admin.listing.findForApprove",
  );
  if (!listing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (listing.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: `Cannot approve a listing in status ${listing.status}.` }, { status: 400 });
  }

  const updated = await withDbRetry(
    () => db!.marketplacePosterListing.update({
      where: { id },
      data: {
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedBy: session.user.id,
      },
    }),
    "marketplace.admin.listing.approve",
  );

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_LISTING_APPROVE",
    targetType: "marketplace_listing",
    targetId: id,
    details: { previousStatus: listing.status, newStatus: "ACTIVE" },
  });

  // Phase 9 — notify poster (in-app) + email. Wrapped so any failure leaves
  // the approval intact.
  try {
    const accountUsername = listing.clipAccount?.username ?? "";
    const campaignName = listing.campaign?.name ?? "";
    const posterUsername = listing.user?.username ?? "poster";
    await createNotification(
      listing.userId,
      "MKT_LISTING_APPROVED",
      "Your marketplace listing is live",
      `Your listing for @${accountUsername} on ${campaignName} is now active.`,
      { listingId: id, accountUsername, campaignName },
    );
    if (listing.user?.email) {
      try {
        await sendMarketplaceListingApproved({
          to: listing.user.email,
          posterUsername,
          accountUsername,
          campaignName,
        });
      } catch {
        // swallow — email failure never breaks the parent action
      }
    }
  } catch {
    // swallow — notification side effects never break parent action
  }

  return NextResponse.json({ listing: updated });
}
