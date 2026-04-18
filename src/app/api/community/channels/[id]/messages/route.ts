import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds, userHasCampaignCommunityAccess } from "@/lib/community";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { sendCommunityAnnouncementEmail } from "@/lib/community-email";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function loadChannelWithCampaign(channelId: string) {
  if (!db) return null;
  return db.channel.findUnique({
    where: { id: channelId },
    include: { campaign: { select: { id: true, name: true } } },
  });
}

/**
 * GET /api/community/channels/[id]/messages?cursor=X&limit=50
 * Returns messages newest-first, paginated by cursor (message id).
 * Updates ChannelReadStatus for the requesting user.
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

  const { id: channelId } = await params;
  const channel = await loadChannelWithCampaign(channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, channel.campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100);
  const rawSearch = req.nextUrl.searchParams.get("search");
  // Content-ILIKE filter — only OWNER/ADMIN may search; enforced at the query layer
  // so a clipper can't leak non-visible content by crafting a search=foo param.
  const searchClause =
    rawSearch && (role === "OWNER" || role === "ADMIN") && rawSearch.trim().length >= 2
      ? { content: { contains: rawSearch.trim(), mode: "insensitive" as const } }
      : null;

  try {
    const messages = await db.channelMessage.findMany({
      where: { channelId, ...(searchClause || {}) },
      include: {
        user: { select: { id: true, username: true, role: true, image: true } },
        replyTo: { select: { id: true, content: true, user: { select: { username: true } }, isDeleted: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;

    // Filter deleted messages based on visibility rules.
    const isOwnerOrAdmin = role === "OWNER" || role === "ADMIN";
    const visible = page
      .map((m: any) => {
        if (!m.isDeleted) return m;
        if (isOwnerOrAdmin) return { ...m, _deleted: true };
        if (m.userId === session.user.id) {
          return { ...m, content: "This message was deleted by admin", _deleted: true };
        }
        return null; // hide completely for everyone else
      })
      .filter(Boolean);

    // Mark channel as read (fire-and-forget).
    db.channelReadStatus.upsert({
      where: { channelId_userId: { channelId, userId: session.user.id } },
      create: { channelId, userId: session.user.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    }).catch(() => {});

    return NextResponse.json({
      messages: visible,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err: any) {
    console.error("[COMMUNITY] messages GET error:", err?.message);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/**
 * POST /api/community/channels/[id]/messages { content }
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

  const { id: channelId } = await params;
  const channel = await loadChannelWithCampaign(channelId);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, channel.campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Channel-type gating.
  if (channel.type === "announcement" && role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can post announcements" }, { status: 403 });
  }
  if (channel.type === "leaderboard") {
    return NextResponse.json({ error: "Leaderboard is auto-generated" }, { status: 403 });
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
  if (content.length > 2000) {
    return NextResponse.json({ error: "Message is too long (max 2000 chars)" }, { status: 400 });
  }

  // Rate limit: 5 per 60s. Don't block — just delay a beat.
  const rl = checkRateLimit(`community-msg:${session.user.id}`, 5, 60_000);
  if (!rl.allowed) {
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Optional reply target. Verify it belongs to the same channel (no cross-channel replies).
  let replyToId: string | null = null;
  if (typeof body.replyToId === "string" && body.replyToId.length > 0) {
    const target = await db.channelMessage.findUnique({
      where: { id: body.replyToId },
      select: { channelId: true, isDeleted: true },
    });
    if (target && target.channelId === channelId && !target.isDeleted) {
      replyToId = body.replyToId;
    }
  }

  try {
    const message = await db.channelMessage.create({
      data: { channelId, userId: session.user.id, content, replyToId: replyToId || undefined },
      include: {
        user: { select: { id: true, username: true, role: true, image: true } },
        replyTo: { select: { id: true, content: true, user: { select: { username: true } }, isDeleted: true } },
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    const subscribers = await getCampaignSubscriberIds(channel.campaignId);
    publishToUsers(subscribers, "channel_message", {
      channelId,
      channelName: channel.name,
      messageId: message.id,
      userId: session.user.id,
      username: (message.user as any)?.username,
      content: message.content,
      createdAt: message.createdAt,
    }).catch(() => {});

    // Announcement: in-app notification + email to every subscriber who isn't muted.
    if (channel.type === "announcement") {
      const muted = await db.communityMute.findMany({
        where: { campaignId: channel.campaignId, userId: { in: subscribers } },
        select: { userId: true },
      });
      const mutedSet = new Set(muted.map((m: any) => m.userId));
      const recipients = subscribers.filter((id) => id !== session.user.id && !mutedSet.has(id));

      // Notifications (in-app bell)
      await Promise.all(
        recipients.map((uid) =>
          createNotification(
            uid,
            "CLIP_FLAGGED",
            `Announcement: ${channel.campaign?.name || "Campaign"}`,
            content.length > 140 ? content.slice(0, 137) + "…" : content,
            { channelId, campaignId: channel.campaignId },
          ).catch(() => {}),
        ),
      );

      // Emails (best-effort, fire-and-forget)
      (async () => {
        try {
          const recipientUsers = await db.user.findMany({
            where: { id: { in: recipients } },
            select: { email: true },
          });
          const senderName = (message.user as any)?.username || "Clippers HQ";
          const campaignName = channel.campaign?.name || "Campaign";
          await Promise.all(
            recipientUsers
              .filter((u: any) => !!u.email)
              .map((u: any) => sendCommunityAnnouncementEmail(u.email, campaignName, senderName, content)),
          );
        } catch (emailErr: any) {
          console.error("[COMMUNITY] Announcement email batch failed:", emailErr?.message);
        }
      })();
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err: any) {
    console.error("[COMMUNITY] messages POST error:", err?.message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

/**
 * PATCH /api/community/channels/[id]/messages  { messageId, isPinned }
 * OWNER/ADMIN only. Toggles the pinned flag on a message and broadcasts the change.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: channelId } = await params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });
  const isPinned = !!body.isPinned;

  try {
    const channel = await loadChannelWithCampaign(channelId);
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const target = await db.channelMessage.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!target || target.channelId !== channelId) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await db.channelMessage.update({ where: { id: messageId }, data: { isPinned } });

    const subscribers = await getCampaignSubscriberIds(channel.campaignId);
    publishToUsers(subscribers, "channel_message_pinned", { channelId, messageId, isPinned }).catch(() => {});

    return NextResponse.json({ ok: true, isPinned });
  } catch (err: any) {
    console.error("[COMMUNITY] messages PATCH error:", err?.message);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

/**
 * DELETE /api/community/channels/[id]/messages?messageId=X
 * Soft-delete by OWNER/ADMIN. The message row is kept; isDeleted=true + deletedBy set.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: channelId } = await params;
  const messageId = req.nextUrl.searchParams.get("messageId");
  if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });

  try {
    const channel = await loadChannelWithCampaign(channelId);
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    await db.channelMessage.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedBy: session.user.id },
    });

    const subscribers = await getCampaignSubscriberIds(channel.campaignId);
    publishToUsers(subscribers, "channel_message_deleted", { channelId, messageId }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[COMMUNITY] messages DELETE error:", err?.message);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
