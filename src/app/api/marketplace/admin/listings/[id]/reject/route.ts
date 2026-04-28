import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
// Phase 9 — notify poster + fire email when an OWNER rejects a listing.
import { createNotification } from "@/lib/notifications";
import { sendMarketplaceListingRejected } from "@/lib/marketplace-email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_REASON = 1000;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/admin/listings/[id]/reject
 * OWNER-only. Rejects a PENDING_APPROVAL listing with a reason → REJECTED.
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

  const rl = checkRoleAwareRateLimit(`mkt-admin-listing-action:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const reason = body?.reason;
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > MAX_REASON) {
    return NextResponse.json({ error: `reason is required and must be 1-${MAX_REASON} characters.` }, { status: 400 });
  }

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
    "marketplace.admin.listing.findForReject",
  );
  if (!listing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (listing.status !== "PENDING_APPROVAL") {
    return NextResponse.json({ error: `Cannot reject a listing in status ${listing.status}.` }, { status: 400 });
  }

  const updated = await withDbRetry(
    () => db!.marketplacePosterListing.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: reason.trim(),
      },
    }),
    "marketplace.admin.listing.reject",
  );

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_LISTING_REJECT",
    targetType: "marketplace_listing",
    targetId: id,
    details: { previousStatus: listing.status, newStatus: "REJECTED", reason: reason.trim() },
  });

  // Phase 9 — notify poster (in-app) + email. Bell preview truncates the
  // reason; full reason ships in the email panel.
  try {
    const accountUsername = listing.clipAccount?.username ?? "";
    const campaignName = listing.campaign?.name ?? "";
    const posterUsername = listing.user?.username ?? "poster";
    const trimmedReason = reason.trim();
    const reasonShort = trimmedReason.length > 200 ? trimmedReason.slice(0, 197) + "…" : trimmedReason;
    await createNotification(
      listing.userId,
      "MKT_LISTING_REJECTED",
      "Your listing was not approved",
      `Your listing for @${accountUsername} on ${campaignName} was rejected. Reason: ${reasonShort}`,
      { listingId: id, reason: trimmedReason, accountUsername },
    );
    if (listing.user?.email) {
      try {
        await sendMarketplaceListingRejected({
          to: listing.user.email,
          posterUsername,
          accountUsername,
          campaignName,
          reason: trimmedReason,
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
