import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
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
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const ticket = await db.campaignTicket.upsert({
      where: { campaignId_userId: { campaignId, userId: session.user.id } },
      create: { campaignId, userId: session.user.id, status: "open" },
      update: {},
      include: { user: { select: { id: true, username: true, image: true } } },
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (err: any) {
    console.error("[COMMUNITY] tickets POST error:", err?.message);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
