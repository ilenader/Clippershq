import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

/**
 * GET /api/marketplace/browse
 * Creator-facing browse of ACTIVE listings owned by OTHER users.
 *
 * Privacy contract — never widen without review:
 *   - Poster info is { username } only. Never expose email, role, id.
 *   - clipAccount: { id, username, platform, profileLink, contentNiche, followerCount }.
 *   - campaign: { id, name }.
 *
 * OWNER-gated during hidden phase.
 * TODO (Phase 11): widen role gate when MARKETPLACE_ENABLED=true.
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

  const rl = checkRoleAwareRateLimit(`mkt-browse-listings:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const { searchParams } = new URL(req.url);

  const campaignId = searchParams.get("campaignId");
  const cursor = searchParams.get("cursor");
  const limitRaw = searchParams.get("limit");

  let take = DEFAULT_TAKE;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TAKE) {
      return NextResponse.json(
        { error: `limit must be an integer between 1 and ${MAX_TAKE}.` },
        { status: 400 },
      );
    }
    take = parsed;
  }

  const where: Record<string, any> = {
    status: "ACTIVE",
    userId: { not: session.user.id },
  };
  if (campaignId) where.campaignId = campaignId;

  const rows: any[] = await withDbRetry(
    () => db!.marketplacePosterListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        niche: true,
        audienceDescription: true,
        followerCount: true,
        followerOverride: true,
        country: true,
        timezone: true,
        dailySlotCount: true,
        averageRating: true,
        totalSubmissions: true,
        totalApproved: true,
        totalPosted: true,
        status: true,
        createdAt: true,
        // Poster: username ONLY. Do not widen this select without privacy review.
        user: { select: { username: true } },
        clipAccount: {
          select: {
            id: true,
            username: true,
            platform: true,
            profileLink: true,
            contentNiche: true,
            followerCount: true,
          },
        },
        campaign: { select: { id: true, name: true } },
      },
    }),
    "marketplace.browse.list",
  );

  let nextCursor: string | null = null;
  let listings = rows;
  if (rows.length > take) {
    listings = rows.slice(0, take);
    nextCursor = listings[listings.length - 1]?.id ?? null;
  }

  return NextResponse.json({ listings, nextCursor });
}
