import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { canMessage } from "@/lib/chat-access";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/conversations
 * Returns conversations the current user can see, with last message and unread count.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.conversation) return NextResponse.json([]);

  const userId = session.user.id;
  const role = (session.user as any).role;

  try {
    let conversations;

    if (role === "OWNER") {
      // Owner sees all conversations
      conversations = await db.conversation.findMany({
        include: {
          campaign: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
      });
    } else {
      // Non-owner: only conversations they participate in
      conversations = await db.conversation.findMany({
        where: { participants: { some: { userId } } },
        include: {
          campaign: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    // For ADMIN, further filter: only conversations tied to campaigns they manage
    // or direct conversations they're explicitly part of
    if (role === "ADMIN") {
      const campaignIds = await getUserCampaignIds(userId, role);
      if (Array.isArray(campaignIds)) {
        const campaignSet = new Set(campaignIds);
        conversations = conversations.filter((c: any) => {
          if (c.campaignId) return campaignSet.has(c.campaignId);
          return c.participants.some((p: any) => p.userId === userId);
        });
      }
    }

    // Compute unread count for each conversation
    const result = conversations.map((c: any) => {
      const myParticipant = c.participants.find((p: any) => p.userId === userId);
      const lastMessage = c.messages[0] || null;
      const unreadCount = myParticipant && lastMessage
        ? (lastMessage.createdAt > myParticipant.lastReadAt && lastMessage.senderId !== userId ? 1 : 0)
        : 0;

      return {
        id: c.id,
        campaignId: c.campaignId,
        campaignName: c.campaign?.name || null,
        needsHumanSupport: c.needsHumanSupport || false,
        updatedAt: c.updatedAt,
        participants: c.participants.map((p: any) => ({
          userId: p.userId,
          ...p.user,
          lastReadAt: p.lastReadAt,
        })),
        lastMessage: lastMessage
          ? { id: lastMessage.id, content: lastMessage.content, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt }
          : null,
        hasUnread: unreadCount > 0,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET /api/chat/conversations error:", err?.message);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/chat/conversations
 *
 * Two modes:
 * 1. Campaign-based (clipper): { campaignId } — auto-resolves the responder
 * 2. Direct (admin/owner): { toUserId, campaignId? } — explicit target
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  if (!db || !db.conversation) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  // Rate limit: 30 new conversations per hour per user (prevents spam)
  const rl = checkRateLimit(`chat-convo:${session.user.id}`, 30, 60 * 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { toUserId, campaignId } = body;
  const fromUserId = session.user.id;
  const fromRole = (session.user as any).role;

  // Input validation
  if (campaignId != null && (typeof campaignId !== "string" || campaignId.length > 100)) {
    return NextResponse.json({ error: "Invalid campaignId" }, { status: 400 });
  }
  if (toUserId != null && (typeof toUserId !== "string" || toUserId.length > 100)) {
    return NextResponse.json({ error: "Invalid toUserId" }, { status: 400 });
  }
  if (!campaignId && !toUserId) {
    return NextResponse.json({ error: "toUserId or campaignId is required" }, { status: 400 });
  }

  // ── Mode 1: Campaign-based (clipper opens chat for a campaign) ──
  if (campaignId && !toUserId) {
    try {
      // Verify user has access to this campaign
      if (fromRole === "CLIPPER") {
        const membership = await db.campaignAccount.findFirst({
          where: { campaignId, clipAccount: { userId: fromUserId } },
        });
        if (!membership) {
          return NextResponse.json({ error: "You have not joined this campaign" }, { status: 403 });
        }
      } else if (fromRole === "CLIENT") {
        const clientAccess = await db.campaignClient.findUnique({
          where: { userId_campaignId: { userId: fromUserId, campaignId } },
        });
        if (!clientAccess) {
          return NextResponse.json({ error: "You don't have access to this campaign" }, { status: 403 });
        }
      }

      // Check for existing campaign conversation for this clipper
      const existing = await db.conversation.findFirst({
        where: {
          campaignId,
          participants: { some: { userId: fromUserId } },
        },
        include: {
          campaign: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
          },
        },
      });

      if (existing) {
        return NextResponse.json(existing);
      }

      // Resolve the responder: campaign creator first, then any assigned admin, then owner
      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
        select: { createdById: true },
      });

      let responderId: string | null = null;

      // 1. Try the campaign creator (if they're admin/owner)
      if (campaign?.createdById && campaign.createdById !== fromUserId) {
        const creator = await db.user.findUnique({
          where: { id: campaign.createdById },
          select: { role: true, status: true },
        });
        if (creator && (creator.role === "ADMIN" || creator.role === "OWNER") && creator.status === "ACTIVE") {
          responderId = campaign.createdById;
        }
      }

      // 2. Try directly assigned campaign admins
      if (!responderId) {
        const admins = await db.campaignAdmin.findMany({
          where: { campaignId },
          include: { user: { select: { id: true, role: true, status: true } } },
        });
        const activeAdmin = admins.find((a: any) => a.user.status === "ACTIVE" && a.userId !== fromUserId);
        if (activeAdmin) responderId = activeAdmin.userId;
      }

      // 3. Try team members who manage this campaign
      if (!responderId) {
        const teamCampaigns = await db.teamCampaign.findMany({
          where: { campaignId },
          select: { teamId: true },
        });
        if (teamCampaigns.length > 0) {
          const teamMembers = await db.teamMember.findMany({
            where: {
              teamId: { in: teamCampaigns.map((tc: any) => tc.teamId) },
              userId: { not: fromUserId },
            },
            include: { user: { select: { id: true, role: true, status: true } } },
          });
          const activeMember = teamMembers.find((m: any) => m.user.status === "ACTIVE");
          if (activeMember) responderId = activeMember.userId;
        }
      }

      // 4. Fallback to owner
      if (!responderId) {
        const owner = await db.user.findFirst({
          where: { role: "OWNER", status: "ACTIVE", id: { not: fromUserId } },
          select: { id: true },
        });
        if (owner) responderId = owner.id;
      }

      if (!responderId) {
        return NextResponse.json({ error: "No available support contact for this campaign" }, { status: 400 });
      }

      // Create conversation — set responder's lastReadAt to epoch so first message is detected as unread
      const epoch = new Date(0);
      const conversation = await db.conversation.create({
        data: {
          campaignId,
          participants: {
            create: [
              { userId: fromUserId },
              { userId: responderId, lastReadAt: epoch },
            ],
          },
        },
        include: {
          campaign: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
          },
        },
      });

      // Send welcome message from the responder
      try {
        await db.message.create({
          data: {
            conversationId: conversation.id,
            senderId: responderId,
            isAI: true,
            content: "Welcome! 👋 I'm here to help you with this campaign. Feel free to ask me anything — how to post, what content works best, payout questions, or anything else. If you need to speak with a real person, just say 'I want to talk to a human' and someone from the team will get back to you.",
          },
        });
        await db.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });
      } catch {}

      return NextResponse.json(conversation, { status: 201 });
    } catch (err: any) {
      console.error("POST /api/chat/conversations (campaign) error:", err?.message);
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }
  }

  // ── Mode 2: Direct user-to-user (admin/owner flow) ──
  if (!toUserId) return NextResponse.json({ error: "toUserId or campaignId is required" }, { status: 400 });

  const allowed = await canMessage(fromUserId, fromRole, toUserId);
  if (!allowed) {
    return NextResponse.json({ error: "You are not allowed to message this user" }, { status: 403 });
  }

  try {
    // Check for existing conversation between these two users
    const existingWhere: any = {
      AND: [
        { participants: { some: { userId: fromUserId } } },
        { participants: { some: { userId: toUserId } } },
      ],
    };
    // If campaign specified, scope to that campaign
    if (campaignId) existingWhere.campaignId = campaignId;

    const existing = await db.conversation.findFirst({
      where: existingWhere,
      include: {
        campaign: { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
        },
      },
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    // Set receiver's lastReadAt to epoch so first message is detected as unread
    const epoch = new Date(0);
    const conversation = await db.conversation.create({
      data: {
        campaignId: campaignId || null,
        participants: {
          create: [
            { userId: fromUserId },
            { userId: toUserId, lastReadAt: epoch },
          ],
        },
      },
      include: {
        campaign: { select: { id: true, name: true } },
        participants: {
          include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
        },
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/chat/conversations error:", err?.message);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
