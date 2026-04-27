import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_COUNTRY = 100;
const MAX_TIMEZONE = 100;
const MAX_FOLLOWERS = 1_000_000_000;

const VALID_STATUSES = new Set([
  "PENDING_APPROVAL",
  "ACTIVE",
  "PAUSED",
  "DELETION_REQUESTED",
  "DELETED",
  "REJECTED",
  "BANNED",
]);

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/marketplace/admin/listings/[id]/override
 * OWNER-only. Owner can force-set: followerOverride, country, timezone, dailySlotCount, status.
 * Other fields use the regular PATCH. Audit-logged with before/after snapshot.
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

  const update: Record<string, any> = {};
  const fieldsTouched: string[] = [];

  if (body.followerOverride !== undefined) {
    if (body.followerOverride === null) {
      update.followerOverride = null;
    } else if (typeof body.followerOverride !== "number" || !Number.isInteger(body.followerOverride) || body.followerOverride < 0 || body.followerOverride > MAX_FOLLOWERS) {
      return NextResponse.json({ error: "followerOverride must be an integer between 0 and 1,000,000,000, or null to clear." }, { status: 400 });
    } else {
      update.followerOverride = body.followerOverride;
    }
    fieldsTouched.push("followerOverride");
  }
  if (body.country !== undefined) {
    if (body.country !== null && (typeof body.country !== "string" || body.country.length > MAX_COUNTRY)) {
      return NextResponse.json({ error: `country must be a string up to ${MAX_COUNTRY} characters, or null.` }, { status: 400 });
    }
    update.country = body.country;
    fieldsTouched.push("country");
  }
  if (body.timezone !== undefined) {
    if (body.timezone !== null && (typeof body.timezone !== "string" || body.timezone.length > MAX_TIMEZONE)) {
      return NextResponse.json({ error: `timezone must be a string up to ${MAX_TIMEZONE} characters, or null.` }, { status: 400 });
    }
    update.timezone = body.timezone;
    fieldsTouched.push("timezone");
  }
  if (body.dailySlotCount !== undefined) {
    if (typeof body.dailySlotCount !== "number" || !Number.isInteger(body.dailySlotCount) || body.dailySlotCount < 1 || body.dailySlotCount > 10) {
      return NextResponse.json({ error: "dailySlotCount must be an integer between 1 and 10." }, { status: 400 });
    }
    update.dailySlotCount = body.dailySlotCount;
    fieldsTouched.push("dailySlotCount");
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "status must be a valid MarketplaceListingStatus value." }, { status: 400 });
    }
    update.status = body.status;
    fieldsTouched.push("status");
  }

  if (fieldsTouched.length === 0) {
    return NextResponse.json({ error: "No override fields provided." }, { status: 400 });
  }

  const { id } = await params;
  const before: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        followerOverride: true,
        country: true,
        timezone: true,
        dailySlotCount: true,
      },
    }),
    "marketplace.admin.listing.findForOverride",
  );
  if (!before) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const updated: any = await withDbRetry(
    () => db!.marketplacePosterListing.update({ where: { id }, data: update }),
    "marketplace.admin.listing.override",
  );

  const after: Record<string, any> = {};
  for (const f of fieldsTouched) after[f] = (updated as any)[f];

  await logAudit({
    userId: session.user.id,
    action: "MARKETPLACE_LISTING_OVERRIDE",
    targetType: "marketplace_listing",
    targetId: id,
    details: {
      fields: fieldsTouched,
      before: Object.fromEntries(fieldsTouched.map((f) => [f, (before as any)[f]])),
      after,
    },
  });

  return NextResponse.json({ listing: updated });
}
