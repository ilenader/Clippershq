import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkCommunityAccess, getCampaignSubscriberIds } from "@/lib/community";
import { publishToUsers } from "@/lib/ably";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_DURATIONS = new Set([1, 5, 10, 60, 1440]);

/**
 * Staff-issued moderation mute for channel posting.
 * OWNER can mute any non-OWNER. ADMIN can mute any non-OWNER non-ADMIN in their campaigns.
 * Tickets/DMs are NOT affected — the mute only blocks channel POST endpoints.
 */

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const viewerRole = (session.user as any).role;
  if (viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`mute-issue:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const userId = typeof body.userId === "string" ? body.userId : "";
  const durationMinutes = Number(body.durationMinutes);
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;

  if (!campaignId || !userId) return NextResponse.json({ error: "campaignId and userId required" }, { status: 400 });
  if (!VALID_DURATIONS.has(durationMinutes)) {
    return NextResponse.json({ error: "durationMinutes must be 1, 5, 10, 60, or 1440" }, { status: 400 });
  }
  if (userId === session.user.id) {
    return NextResponse.json({ error: "Cannot mute yourself" }, { status: 400 });
  }

  const hasAccess = await checkCommunityAccess(session.user.id, viewerRole, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot mute the owner" }, { status: 403 });
  }
  if (target.role === "ADMIN" && viewerRole !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can mute an admin" }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);

  // Upsert so re-muting extends/replaces an existing mute.
  const mute = await db.communityModerationMute.upsert({
    where: { campaignId_userId: { campaignId, userId } },
    create: { campaignId, userId, mutedById: session.user.id, expiresAt, reason },
    update: { mutedById: session.user.id, expiresAt, reason },
  });

  // Notify all campaign subscribers so the muted user's UI can disable the input live.
  const subscribers = await getCampaignSubscriberIds(campaignId);
  publishToUsers(subscribers, "user_muted", { campaignId, userId, expiresAt: mute.expiresAt }).catch(() => {});

  return NextResponse.json(mute, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const viewerRole = (session.user as any).role;
  if (viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId") || "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const hasAccess = await checkCommunityAccess(session.user.id, viewerRole, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Return only active mutes. Lazy-clean expired rows along the way.
  const now = new Date();
  await db.communityModerationMute.deleteMany({ where: { campaignId, expiresAt: { lt: now } } });
  const mutes = await db.communityModerationMute.findMany({
    where: { campaignId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    take: 200,
  });
  return NextResponse.json(mutes);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const viewerRole = (session.user as any).role;
  if (viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const campaignId = req.nextUrl.searchParams.get("campaignId") || "";
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!campaignId || !userId) return NextResponse.json({ error: "campaignId and userId required" }, { status: 400 });

  const hasAccess = await checkCommunityAccess(session.user.id, viewerRole, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.communityModerationMute.deleteMany({ where: { campaignId, userId } });

  const subscribers = await getCampaignSubscriberIds(campaignId);
  publishToUsers(subscribers, "user_unmuted", { campaignId, userId }).catch(() => {});

  return NextResponse.json({ ok: true });
}
