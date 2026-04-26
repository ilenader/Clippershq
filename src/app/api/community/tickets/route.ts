import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/tickets?campaignId=X&status=open
 * OWNER/ADMIN see all tickets (optionally filtered by status).
 * CLIPPER sees only their own tickets for the campaign.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  const statusFilter = req.nextUrl.searchParams.get("status");
  const cursor = req.nextUrl.searchParams.get("cursor") || null;
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "30", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 30, 1), 100);

  try {
    const where: any = { campaignId };
    if (statusFilter) where.status = statusFilter;
    if (role === "CLIPPER") where.userId = session.user.id;

    // +1 trick to know if there's another page without a COUNT query.
    const tickets = await db.campaignTicket.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, image: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = tickets.length > limit;
    const page = hasMore ? tickets.slice(0, limit) : tickets;

    // Unread count per ticket — messages not authored by the requester that are isRead=false.
    const enriched = await Promise.all(
      page.map(async (t: any) => {
        const unread = await db.ticketMessage.count({
          where: { ticketId: t.id, userId: { not: session.user.id }, isRead: false },
        });
        return {
          ...t,
          unread,
          lastMessage: t.messages[0] || null,
        };
      }),
    );

    const nextCursor = hasMore ? enriched[enriched.length - 1].id : null;

    // For OWNER/ADMIN: also return clippers who haven't messaged yet
    if (role === "OWNER" || role === "ADMIN") {
      const campaignAccounts = await db.campaignAccount.findMany({
        where: { campaignId },
        select: { clipAccount: { select: { userId: true, user: { select: { id: true, username: true, name: true, image: true } } } } },
        take: 500,
      });
      const allTicketUsers = await db.campaignTicket.findMany({
        where: { campaignId },
        select: { userId: true },
      });
      const ticketUserIds = new Set(allTicketUsers.map((t: any) => t.userId));
      const seen = new Set<string>();
      const noConversation = [];
      for (const ca of campaignAccounts) {
        const u = ca.clipAccount?.user;
        if (u && !ticketUserIds.has(u.id) && !seen.has(u.id)) {
          seen.add(u.id);
          noConversation.push({
            id: `no-convo-${u.id}`,
            userId: u.id,
            campaignId,
            status: "no_conversation",
            notes: null,
            lastMessageAt: null,
            createdAt: null,
            user: { id: u.id, username: u.username || u.name || "Clipper", image: u.image },
            unread: 0,
            lastMessage: null,
          });
        }
      }
      return NextResponse.json({ tickets: enriched, noConversation, hasMore, nextCursor });
    }

    return NextResponse.json({ tickets: enriched, hasMore, nextCursor });
  } catch (err: any) {
    console.error("[COMMUNITY] tickets GET error:", err?.message);
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}

/**
 * POST /api/community/tickets { campaignId }
 * Creates a ticket if one doesn't exist for this user+campaign, else returns the existing one.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // No admin multiplier — clippers create tickets too. OWNER bypasses default.
  const rl = checkRoleAwareRateLimit(`ticket-create:${session.user.id}`, 10, 60 * 60_000, role, 1);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // OWNER/ADMIN can create a ticket for a specific clipper
  const targetUserId = (role === "OWNER" || role === "ADMIN") && typeof body.userId === "string" && body.userId
    ? body.userId
    : session.user.id;

  if (targetUserId !== session.user.id) {
    const membership = await db.campaignAccount.findFirst({
      where: { campaignId, clipAccount: { userId: targetUserId } },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "User is not in this campaign" }, { status: 400 });
  }

  try {
    const ticket = await db.campaignTicket.upsert({
      where: { campaignId_userId: { campaignId, userId: targetUserId } },
      create: { campaignId, userId: targetUserId, status: "open" },
      update: {},
      include: { user: { select: { id: true, username: true, image: true } } },
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (err: any) {
    console.error("[COMMUNITY] tickets POST error:", err?.message);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
