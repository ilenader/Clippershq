import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NICHE = 100;
const MAX_AUDIENCE = 2000;
const MAX_COUNTRY = 100;
const MAX_TIMEZONE = 100;

// Statuses where PATCH is allowed. Terminal-ish states block edits.
const PATCHABLE_STATUSES = new Set(["PENDING_APPROVAL", "ACTIVE", "PAUSED", "DELETION_REQUESTED"]);

type Params = { params: Promise<{ id: string }> };

async function loadListingForActor(id: string, sessionUserId: string, role: string) {
  if (!db) return { error: "db" as const };
  const listing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id },
      include: {
        clipAccount: { select: { id: true, username: true, platform: true } },
        campaign: { select: { id: true, name: true, status: true } },
        _count: { select: { submissions: true } },
      },
    }),
    "marketplace.listing.findById",
  );
  if (!listing) return { error: "notfound" as const };
  const isOwnerRole = role === "OWNER";
  const isListingOwner = listing.userId === sessionUserId;
  // 404 (not 403) for users who can't access — don't leak existence.
  if (!isOwnerRole && !isListingOwner) return { error: "notfound" as const };
  return { listing };
}

/**
 * GET /api/marketplace/listings/[id]
 * Single listing details. Visible to listing owner OR OWNER role; otherwise 404.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`mkt-listing-get:${session.user.id}`, 120, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  const result = await loadListingForActor(id, session.user.id, role);
  if (result.error === "notfound") return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ listing: result.listing });
}

/**
 * PATCH /api/marketplace/listings/[id]
 * Edit allowed fields. Listing owner or OWNER role only.
 * Rejects edits to terminal statuses; status changes go through pause/approve/reject/override.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`mkt-listing-edit:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  const result = await loadListingForActor(id, session.user.id, role);
  if (result.error === "notfound") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const listing = result.listing!;

  if (!PATCHABLE_STATUSES.has(listing.status)) {
    return NextResponse.json({ error: `Cannot edit a listing in status ${listing.status}.` }, { status: 400 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const update: Record<string, any> = {};

  if (body.niche !== undefined) {
    if (typeof body.niche !== "string" || body.niche.trim().length === 0 || body.niche.length > MAX_NICHE) {
      return NextResponse.json({ error: `niche must be 1-${MAX_NICHE} characters.` }, { status: 400 });
    }
    update.niche = body.niche.trim();
  }
  if (body.audienceDescription !== undefined) {
    if (typeof body.audienceDescription !== "string" || body.audienceDescription.trim().length === 0 || body.audienceDescription.length > MAX_AUDIENCE) {
      return NextResponse.json({ error: `audienceDescription must be 1-${MAX_AUDIENCE} characters.` }, { status: 400 });
    }
    update.audienceDescription = body.audienceDescription.trim();
  }
  if (body.dailySlotCount !== undefined) {
    if (typeof body.dailySlotCount !== "number" || !Number.isInteger(body.dailySlotCount) || body.dailySlotCount < 1 || body.dailySlotCount > 10) {
      return NextResponse.json({ error: "dailySlotCount must be an integer between 1 and 10." }, { status: 400 });
    }
    update.dailySlotCount = body.dailySlotCount;
  }
  if (body.country !== undefined) {
    if (body.country !== null && (typeof body.country !== "string" || body.country.length > MAX_COUNTRY)) {
      return NextResponse.json({ error: `country must be a string up to ${MAX_COUNTRY} characters.` }, { status: 400 });
    }
    update.country = body.country;
  }
  if (body.timezone !== undefined) {
    if (body.timezone !== null && (typeof body.timezone !== "string" || body.timezone.length > MAX_TIMEZONE)) {
      return NextResponse.json({ error: `timezone must be a string up to ${MAX_TIMEZONE} characters.` }, { status: 400 });
    }
    update.timezone = body.timezone;
  }

  // Reject any attempt to push status, approval, or override fields via PATCH.
  for (const forbidden of ["status", "approvedAt", "approvedBy", "followerOverride", "rejectionReason", "pausedAt", "deletionRequestedAt"]) {
    if (forbidden in body) {
      return NextResponse.json({ error: `Field "${forbidden}" cannot be set via PATCH. Use the dedicated endpoint.` }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  const updated = await withDbRetry(
    () => db!.marketplacePosterListing.update({ where: { id }, data: update }),
    "marketplace.listing.update",
  );
  return NextResponse.json({ listing: updated });
}

/**
 * DELETE /api/marketplace/listings/[id]
 * Soft delete: marks the listing DELETION_REQUESTED, owner approves the actual delete later.
 * Listing owner or OWNER role only. Audit-logged.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`mkt-listing-delete:${session.user.id}`, 5, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { id } = await params;
  const result = await loadListingForActor(id, session.user.id, role);
  if (result.error === "notfound") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const listing = result.listing!;

  if (listing.status === "DELETED" || listing.status === "DELETION_REQUESTED") {
    return NextResponse.json({ error: `Listing already in status ${listing.status}.` }, { status: 400 });
  }

  const updated = await withDbRetry(
    () => db!.marketplacePosterListing.update({
      where: { id },
      data: { status: "DELETION_REQUESTED", deletionRequestedAt: new Date() },
    }),
    "marketplace.listing.deleteRequest",
  );

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_LISTING_DELETE_REQUEST",
    targetType: "marketplace_listing",
    targetId: id,
    details: { previousStatus: listing.status },
  });

  return NextResponse.json({ listing: updated });
}
