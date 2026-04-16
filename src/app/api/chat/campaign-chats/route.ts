import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/campaign-chats
 *
 * For CLIPPERS: returns their joined campaigns with conversation info.
 * Each entry has the campaign details, whether a conversation exists,
 * the conversation id (if any), last message, and unread status.
 *
 * This powers the campaign-first chat list for clippers.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.campaignAccount) return NextResponse.json([]);

  const userId = session.user.id;
  const role = (session.user as any).role;

  if (role !== "CLIPPER" && role !== "CLIENT") {
    return NextResponse.json([], { status: 403 });
  }

  try {
    let uniqueCampaigns: any[];

    if (role === "CLIENT") {
      // CLIENT: get campaigns via CampaignClient assignments
      const assignments = await db.campaignClient.findMany({
        where: { userId },
        include: {
          campaign: {
            select: { id: true, name: true, platform: true, imageUrl: true, status: true, isArchived: true },
          },
        },
        take: 100,
      });
      uniqueCampaigns = assignments
        .map((a: any) => a.campaign)
        .filter((c: any) => c && !c.isArchived);
    } else {
      // CLIPPER: get campaigns via CampaignAccount joins
      const joins = await db.campaignAccount.findMany({
        where: { clipAccount: { userId } },
        include: {
          campaign: {
            select: { id: true, name: true, platform: true, imageUrl: true, status: true, isArchived: true },
          },
        },
      });

      const campaigns = joins
        .map((j: any) => j.campaign)
        .filter((c: any) => c && !c.isArchived);

      // Deduplicate by campaign id (clipper may have joined with multiple accounts)
      uniqueCampaigns = Array.from(
        new Map(campaigns.map((c: any) => [c.id, c])).values()
      );
    }

    // Find existing conversations for this clipper that are campaign-linked
    let existingConversations: any[] = [];
    try {
      existingConversations = await db.conversation.findMany({
        where: {
          campaignId: { in: uniqueCampaigns.map((c: any) => c.id) },
          participants: { some: { userId } },
        },
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, username: true, image: true, role: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
    } catch {
      // Conversations table may not exist yet — still return campaigns
    }

    // Build a map: campaignId -> conversation
    const convoByCampaign = new Map<string, any>();
    for (const c of existingConversations) {
      if (c.campaignId) convoByCampaign.set(c.campaignId, c);
    }

    // Build the result
    const result = uniqueCampaigns.map((campaign: any) => {
      const convo = convoByCampaign.get(campaign.id);
      const lastMessage = convo?.messages?.[0] || null;
      const myParticipant = convo?.participants?.find((p: any) => p.userId === userId);
      const hasUnread = myParticipant && lastMessage
        ? (new Date(lastMessage.createdAt) > new Date(myParticipant.lastReadAt) && lastMessage.senderId !== userId)
        : false;

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignPlatform: campaign.platform,
        campaignImage: campaign.imageUrl,
        campaignStatus: campaign.status,
        conversationId: convo?.id || null,
        lastMessage: lastMessage
          ? { id: lastMessage.id, content: lastMessage.content, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt }
          : null,
        hasUnread,
        needsHumanSupport: convo?.needsHumanSupport || false,
      };
    });

    // Sort: unread first, then by last message time, then alphabetically
    result.sort((a: any, b: any) => {
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.campaignName.localeCompare(b.campaignName);
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET /api/chat/campaign-chats error:", err?.message);
    return NextResponse.json([]);
  }
}
