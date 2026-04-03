/**
 * Chat permission logic.
 *
 * CLIPPER  — can message OWNER or the ADMIN(s) managing campaigns they participate in.
 * ADMIN   — can message clippers who belong to campaigns the admin manages, plus OWNER.
 * OWNER   — can message anyone and see all conversations.
 *
 * All checks are server-side; the frontend only displays what the API returns.
 */
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";

/**
 * Check whether `fromUserId` (with `fromRole`) is allowed to start or
 * participate in a conversation with `toUserId`.
 */
export async function canMessage(
  fromUserId: string,
  fromRole: string,
  toUserId: string,
): Promise<boolean> {
  if (!db) return false;
  if (fromUserId === toUserId) return false;

  // OWNER can message anyone
  if (fromRole === "OWNER") return true;

  const targetUser = await db.user.findUnique({
    where: { id: toUserId },
    select: { role: true },
  });
  if (!targetUser) return false;

  // Anyone can message the OWNER
  if (targetUser.role === "OWNER") return true;

  if (fromRole === "CLIPPER") {
    // Clipper can only message ADMIN/OWNER who manages one of their campaigns
    if (targetUser.role !== "ADMIN") return false;
    return await sharesCampaign(fromUserId, "CLIPPER", toUserId, "ADMIN");
  }

  if (fromRole === "ADMIN") {
    // Admin can only message CLIPPERs in campaigns they manage
    if (targetUser.role !== "CLIPPER") return false;
    return await sharesCampaign(toUserId, "CLIPPER", fromUserId, "ADMIN");
  }

  return false;
}

/**
 * Check if a clipper and admin share at least one campaign.
 * clipper has joined via CampaignAccount; admin manages via getUserCampaignIds.
 */
async function sharesCampaign(
  clipperId: string,
  _clipperRole: string,
  adminId: string,
  adminRole: string,
): Promise<boolean> {
  if (!db) return false;

  const [clipperCampaigns, adminCampaignIds] = await Promise.all([
    db.campaignAccount.findMany({
      where: { clipAccount: { userId: clipperId } },
      select: { campaignId: true },
    }),
    getUserCampaignIds(adminId, adminRole),
  ]);

  if (adminCampaignIds === "ALL") return clipperCampaigns.length > 0;

  const adminSet = new Set(adminCampaignIds);
  return clipperCampaigns.some((ca: { campaignId: string }) => adminSet.has(ca.campaignId));
}

/**
 * Check whether a user can access (view / send messages in) a conversation.
 */
export async function canAccessConversation(
  userId: string,
  role: string,
  conversationId: string,
): Promise<boolean> {
  if (!db || !db.conversationParticipant) return false;

  // OWNER sees all
  if (role === "OWNER") return true;

  // Must be a participant
  const participant = await db.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return !!participant;
}

/**
 * Returns the list of users the current user is allowed to message.
 * Used by the frontend "new conversation" flow.
 */
export async function getMessageableUsers(
  userId: string,
  role: string,
): Promise<{ id: string; name: string | null; username: string; image: string | null; role: string }[]> {
  if (!db) return [];

  if (role === "OWNER") {
    // Owner can message all non-owner users
    return db.user.findMany({
      where: { id: { not: userId }, status: "ACTIVE" },
      select: { id: true, name: true, username: true, image: true, role: true },
      orderBy: { username: "asc" },
    });
  }

  if (role === "CLIPPER") {
    // Can message OWNER + ADMINs who manage campaigns clipper has joined
    const owners = await db.user.findMany({
      where: { role: "OWNER", id: { not: userId }, status: "ACTIVE" },
      select: { id: true, name: true, username: true, image: true, role: true },
    });

    // Find campaigns clipper has joined
    const clipperJoins = await db.campaignAccount.findMany({
      where: { clipAccount: { userId } },
      select: { campaignId: true },
    });
    const clipperCampaignIds = clipperJoins.map((j: { campaignId: string }) => j.campaignId);

    if (clipperCampaignIds.length === 0) return owners;

    // Find admins who manage these campaigns (direct assignment, created, or team)
    const [directAdmins, creators, teamCampaigns] = await Promise.all([
      db.campaignAdmin.findMany({
        where: { campaignId: { in: clipperCampaignIds } },
        select: { userId: true },
      }),
      db.campaign.findMany({
        where: { id: { in: clipperCampaignIds }, createdById: { not: null } },
        select: { createdById: true },
      }),
      db.teamCampaign.findMany({
        where: { campaignId: { in: clipperCampaignIds } },
        select: { teamId: true },
      }),
    ]);

    const adminIds = new Set<string>();
    for (const a of directAdmins) adminIds.add(a.userId);
    for (const c of creators) if (c.createdById) adminIds.add(c.createdById);

    if (teamCampaigns.length > 0) {
      const teamMembers = await db.teamMember.findMany({
        where: { teamId: { in: teamCampaigns.map((tc: { teamId: string }) => tc.teamId) } },
        select: { userId: true },
      });
      for (const tm of teamMembers) adminIds.add(tm.userId);
    }

    adminIds.delete(userId);

    const admins = adminIds.size > 0
      ? await db.user.findMany({
          where: { id: { in: [...adminIds] }, role: "ADMIN", status: "ACTIVE" },
          select: { id: true, name: true, username: true, image: true, role: true },
        })
      : [];

    return [...owners, ...admins];
  }

  if (role === "ADMIN") {
    // Can message OWNER + CLIPPERs in campaigns admin manages
    const owners = await db.user.findMany({
      where: { role: "OWNER", id: { not: userId }, status: "ACTIVE" },
      select: { id: true, name: true, username: true, image: true, role: true },
    });

    const adminCampaignIds = await getUserCampaignIds(userId, role);
    if (adminCampaignIds === "ALL" || adminCampaignIds.length === 0) return owners;

    // Find clippers who joined these campaigns
    const joins = await db.campaignAccount.findMany({
      where: { campaignId: { in: adminCampaignIds } },
      select: { clipAccount: { select: { userId: true } } },
    });

    const clipperIds = new Set<string>();
    for (const j of joins) clipperIds.add(j.clipAccount.userId);
    clipperIds.delete(userId);

    const clippers = clipperIds.size > 0
      ? await db.user.findMany({
          where: { id: { in: [...clipperIds] }, role: "CLIPPER", status: "ACTIVE" },
          select: { id: true, name: true, username: true, image: true, role: true },
        })
      : [];

    return [...owners, ...clippers];
  }

  return [];
}
