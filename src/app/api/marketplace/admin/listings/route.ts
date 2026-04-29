import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_TAKE = 200;
const MAX_TAKE = 500;

const VALID_STATUSES = new Set([
  "PENDING_APPROVAL",
  "ACTIVE",
  "PAUSED",
  "DELETION_REQUESTED",
  "DELETED",
  "REJECTED",
  "BANNED",
]);

/**
 * GET /api/marketplace/admin/listings
 * OWNER-only. Cursor pagination over all listings.
 * Filters: ?status=, ?campaignId=, ?userId=. Limits: ?limit= (default 200, max 500). Cursor: ?cursor=<id>.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-admin-listings-list:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status");
  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
  const campaignId = searchParams.get("campaignId");
  const userId = searchParams.get("userId");
  const cursor = searchParams.get("cursor");

  const limitRaw = searchParams.get("limit");
  let take = DEFAULT_TAKE;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TAKE) {
      return NextResponse.json({ error: `limit must be an integer between 1 and ${MAX_TAKE}.` }, { status: 400 });
    }
    take = parsed;
  }

  const where: Record<string, any> = {};
  if (status) where.status = status;
  if (campaignId) where.campaignId = campaignId;
  if (userId) where.userId = userId;

  const rows: any[] = await withDbRetry(
    () => db!.marketplacePosterListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        // Phase: launch-fix H1 — privacy: don't expose poster emails to admin clients
        user: { select: { id: true, username: true } },
        clipAccount: { select: { id: true, username: true, platform: true, profileLink: true } },
        campaign: { select: { id: true, name: true, status: true } },
        _count: { select: { submissions: true } },
      },
    }),
    "marketplace.admin.listings.list",
  );

  let nextCursor: string | null = null;
  let listings = rows;
  if (rows.length > take) {
    listings = rows.slice(0, take);
    nextCursor = listings[listings.length - 1]?.id ?? null;
  }

  return NextResponse.json({ listings, nextCursor });
}
