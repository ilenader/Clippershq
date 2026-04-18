import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUser, publishToUsers } from "@/lib/ably";
import { createNotification } from "@/lib/notifications";
import { sendChatReplyEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function sameDay(a: Date | null | undefined, b: Date): boolean {
  if (!a) return false;
  const x = new Date(a);
  return x.getFullYear() === b.getFullYear() && x.getMonth() === b.getMonth() && x.getDate() === b.getDate();
}

/**
 * GET /api/community/tickets/[id]/messages?cursor=X&limit=50
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: ticketId } = await params;
  const ticket = await db.campaignTicket.findUnique({ where: { id: ticketId }, select: { userId: true } });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (role === "CLIPPER" && ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100);

  try {
    const messages = await db.ticketMessage.findMany({
      where: { ticketId },
      include: { user: { select: { id: true, username: true, role: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    // Mark all others' messages as read.
    db.ticketMessage.updateMany({
      where: { ticketId, userId: { not: session.user.id }, isRead: false },
      data: { isRead: true },
    }).catch(() => {});

    return NextResponse.json({
      messages: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err: any) {
    console.error("[COMMUNITY] ticket messages GET error:", err?.message);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/**
 * POST /api/community/tickets/[id]/messages { content }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: ticketId } = await params;
  const ticket = await db.campaignTicket.findUnique({
    where: { id: ticketId },
    include: { campaign: { select: { name: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (role === "CLIPPER" && ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (body.content != null && typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  const content = (typeof body.content === "string" ? body.content : "").trim();
  if (!content) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  if (content.length > 5000) return NextResponse.json({ error: "Message too long (max 5000 chars)" }, { status: 400 });

  try {
    const priorLastMessageAt = ticket.lastMessageAt;

    const message = await db.ticketMessage.create({
      data: { ticketId, userId: session.user.id, content },
      include: { user: { select: { id: true, username: true, role: true, image: true } } },
    });
    await db.campaignTicket.update({
      where: { id: ticketId },
      data: { lastMessageAt: new Date() },
    });

    if (role === "CLIPPER") {
      // Notify all owners/admins.
      const admins = await db.user.findMany({
        where: { role: { in: ["OWNER", "ADMIN"] } },
        select: { id: true },
      });
      const adminIds: string[] = admins.map((a: any) => a.id);
      publishToUsers(adminIds, "ticket_message", {
        ticketId,
        messageId: message.id,
        userId: session.user.id,
        campaignId: ticket.campaignId,
        campaignName: ticket.campaign?.name,
      }).catch(() => {});
      publishToUsers(adminIds, "notif_refresh", {}).catch(() => {});
      await Promise.all(
        adminIds.map((uid: string) =>
          createNotification(
            uid,
            "CLIP_FLAGGED",
            `Ticket message from ${(message.user as any)?.username || "clipper"}`,
            content.length > 140 ? content.slice(0, 137) + "…" : content,
            { ticketId, campaignId: ticket.campaignId },
          ).catch(() => {}),
        ),
      );
    } else {
      // OWNER/ADMIN reply → notify the clipper + email if first reply of the day.
      publishToUser(ticket.userId, "ticket_message", {
        ticketId,
        messageId: message.id,
        userId: session.user.id,
        campaignId: ticket.campaignId,
        campaignName: ticket.campaign?.name,
      }).catch(() => {});
      publishToUser(ticket.userId, "notif_refresh", {}).catch(() => {});
      await createNotification(
        ticket.userId,
        "CLIP_FLAGGED",
        `Reply on your ticket — ${ticket.campaign?.name || "Campaign"}`,
        content.length > 140 ? content.slice(0, 137) + "…" : content,
        { ticketId, campaignId: ticket.campaignId },
      ).catch(() => {});

      if (!sameDay(priorLastMessageAt ?? null, new Date())) {
        try {
          const clipper = await db.user.findUnique({
            where: { id: ticket.userId },
            select: { email: true, name: true, username: true },
          });
          if (clipper?.email) {
            await sendChatReplyEmail({
              to: clipper.email,
              recipientName: clipper.name || clipper.username || "there",
              senderName: (message.user as any)?.username || "Your account manager",
              messagePreview: content,
              conversationUrl: `https://clipershq.com/community?ticketId=${ticketId}`,
            });
          }
        } catch (emailErr: any) {
          console.error("[COMMUNITY] Ticket reply email failed:", emailErr?.message);
        }
      }
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err: any) {
    console.error("[COMMUNITY] ticket messages POST error:", err?.message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
