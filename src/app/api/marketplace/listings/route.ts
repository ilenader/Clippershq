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
const MAX_FOLLOWERS = 1_000_000_000;

/**
 * POST /api/marketplace/listings
 * Create a new poster listing. OWNER-gated during hidden phase.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Owner only." }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`mkt-listing-create:${session.user.id}`, 10, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    clipAccountId,
    campaignId,
    niche,
    audienceDescription,
    followerCount,
    country,
    timezone,
    dailySlotCount,
  } = data;

  if (!clipAccountId || typeof clipAccountId !== "string") {
    return NextResponse.json({ error: "clipAccountId is required." }, { status: 400 });
  }
  if (!campaignId || typeof campaignId !== "string") {
    return NextResponse.json({ error: "campaignId is required." }, { status: 400 });
  }
  // niche is now optional in the request body — when omitted, the server fills
  // it in from ClipAccount.contentNiche below. If the client DOES send a value,
  // validate it as before so external callers (or a future UI revival) get the
  // same length cap behavior.
  if (niche !== undefined && niche !== null) {
    if (typeof niche !== "string" || niche.length > MAX_NICHE) {
      return NextResponse.json({ error: `niche must be a string up to ${MAX_NICHE} characters.` }, { status: 400 });
    }
  }
  if (typeof audienceDescription !== "string" || audienceDescription.trim().length === 0 || audienceDescription.length > MAX_AUDIENCE) {
    return NextResponse.json({ error: `audienceDescription is required and must be 1-${MAX_AUDIENCE} characters.` }, { status: 400 });
  }
  // followerCount is now optional — when omitted, the server fills it from
  // ClipAccount.followerCount below. If the client DOES send a value, validate.
  if (followerCount !== undefined && followerCount !== null) {
    if (typeof followerCount !== "number" || !Number.isInteger(followerCount) || followerCount < 0 || followerCount > MAX_FOLLOWERS) {
      return NextResponse.json({ error: "followerCount must be an integer between 0 and 1,000,000,000." }, { status: 400 });
    }
  }
  if (country !== undefined && country !== null && (typeof country !== "string" || country.length > MAX_COUNTRY)) {
    return NextResponse.json({ error: `country must be a string up to ${MAX_COUNTRY} characters.` }, { status: 400 });
  }
  if (timezone !== undefined && timezone !== null && (typeof timezone !== "string" || timezone.length > MAX_TIMEZONE)) {
    return NextResponse.json({ error: `timezone must be a string up to ${MAX_TIMEZONE} characters.` }, { status: 400 });
  }
  const slot = dailySlotCount === undefined || dailySlotCount === null ? 5 : dailySlotCount;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 1 || slot > 10) {
    return NextResponse.json({ error: "dailySlotCount must be an integer between 1 and 10." }, { status: 400 });
  }

  // Verify clipAccount: owned by session user, APPROVED, not deleted.
  // Also fetch contentNiche + followerCount so we can derive listing fields the
  // modal no longer asks the user for (modal cleanup).
  const clipAccount: any = await withDbRetry(
    () => db!.clipAccount.findFirst({
      where: { id: clipAccountId, userId: session.user.id, status: "APPROVED", deletedByUser: false },
      select: { id: true, contentNiche: true, followerCount: true },
    }),
    "marketplace.listing.findClipAccount",
  );
  if (!clipAccount) {
    return NextResponse.json({ error: "Clip account not found, not approved, or not owned by you." }, { status: 400 });
  }

  // Verify campaign: ACTIVE and not archived.
  const campaign: any = await withDbRetry(
    () => db!.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, isArchived: true },
    }),
    "marketplace.listing.findCampaign",
  );
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status !== "ACTIVE" || campaign.isArchived) {
    return NextResponse.json({ error: "Campaign is not active. Only active, non-archived campaigns can host marketplace listings." }, { status: 400 });
  }

  // Verify the clipAccount has joined the campaign (CampaignAccount must exist).
  const ca: any = await withDbRetry(
    () => db!.campaignAccount.findUnique({
      where: { clipAccountId_campaignId: { clipAccountId, campaignId } },
      select: { id: true },
    }),
    "marketplace.listing.findCampaignAccount",
  );
  if (!ca) {
    if (role !== "OWNER") {
      return NextResponse.json({ error: "This account is not approved for this campaign yet. Submit it via the normal account flow first." }, { status: 400 });
    }
    // OWNER bypass: auto-create the missing CampaignAccount row so the OWNER
    // can preview the marketplace without having to manually join the campaign
    // through the normal account flow first. Mirrors the existing owner-override
    // pattern in /api/clips/owner-submit, which also bypasses the join.
    // Audit-logged so this never happens silently.
    let newCampaignAccount: any = null;
    try {
      newCampaignAccount = await withDbRetry(
        () => db!.campaignAccount.create({
          data: { clipAccountId, campaignId },
        }),
        "marketplace.listing.autoJoinCampaign",
      );
    } catch (err: any) {
      // P2002 = a parallel request just created the same row. The unique
      // constraint guarantees the row exists now, so treat as success.
      if (err?.code !== "P2002") throw err;
    }
    if (newCampaignAccount) {
      await logAudit({
        userId: session.user.id,
        action: "MARKETPLACE_OWNER_AUTO_JOIN_CAMPAIGN",
        targetType: "campaign_account",
        targetId: newCampaignAccount.id,
        details: { clipAccountId, campaignId, reason: "owner-marketplace-listing" },
      });
    }
  }

  // Friendly pre-check for duplicate before relying on the unique constraint.
  const existing: any = await withDbRetry(
    () => db!.marketplacePosterListing.findUnique({
      where: { userId_clipAccountId_campaignId: { userId: session.user.id, clipAccountId, campaignId } },
      select: { id: true },
    }),
    "marketplace.listing.findExisting",
  );
  if (existing) {
    return NextResponse.json({ error: "You already have a listing for this account on this campaign." }, { status: 409 });
  }

  // Derive niche + followerCount when the client omitted them. The modal stopped
  // asking for these inputs since they duplicate properties already on ClipAccount.
  // External callers may still pass them, in which case they win (already validated above).
  const finalNiche =
    typeof niche === "string" && niche.trim().length > 0
      ? niche.trim()
      : (clipAccount.contentNiche ?? "");
  const finalFollowerCount =
    typeof followerCount === "number"
      ? followerCount
      : (clipAccount.followerCount ?? 0);

  try {
    const listing = await withDbRetry(
      () => db!.marketplacePosterListing.create({
        data: {
          userId: session.user.id,
          clipAccountId,
          campaignId,
          niche: finalNiche,
          audienceDescription: audienceDescription.trim(),
          followerCount: finalFollowerCount,
          country: country ?? null,
          timezone: timezone ?? null,
          dailySlotCount: slot,
        },
      }),
      "marketplace.listing.create",
    );
    return NextResponse.json({ listing }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You already have a listing for this account on this campaign." }, { status: 409 });
    }
    throw err;
  }
}

/**
 * GET /api/marketplace/listings
 * List current user's own listings. Authenticated + ban + rate-limited.
 * Scoped to userId === session.user.id, so during hidden phase only OWNER
 * (the only role with listings) gets data; everyone else gets [].
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`mkt-listing-list-mine:${session.user.id}`, 60, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable." }, { status: 500 });

  const listings = await withDbRetry(
    () => db!.marketplacePosterListing.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        clipAccount: { select: { id: true, username: true, platform: true } },
        campaign: { select: { id: true, name: true, status: true } },
      },
    }),
    "marketplace.listing.listMine",
  );

  return NextResponse.json({ listings });
}
