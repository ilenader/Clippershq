/**
 * Community system helpers — channel provisioning + subscriber resolution.
 */
import { db } from "@/lib/db";

/** Allowed values for Channel.type. Anything outside this list is coerced to "general". */
export const VALID_CHANNEL_TYPES = ["general", "announcement", "leaderboard", "voice"] as const;
export type ChannelType = typeof VALID_CHANNEL_TYPES[number];

function isValidChannelType(t: string): t is ChannelType {
  return (VALID_CHANNEL_TYPES as readonly string[]).includes(t);
}

/**
 * Ensure the three default channels (Announcements, General, Leaderboard) exist for a campaign.
 * Wraps the count-then-create in a Serializable transaction so two concurrent first-visits
 * can't both slip past the count check and create duplicate channel sets.
 */
export async function ensureCampaignChannels(campaignId: string): Promise<void> {
  const seed = [
    { campaignId, name: "Announcements", type: "announcement" as const, sortOrder: 0 },
    { campaignId, name: "General",       type: "general"      as const, sortOrder: 1 },
    { campaignId, name: "Leaderboard",   type: "leaderboard"  as const, sortOrder: 2 },
  ].filter((c) => isValidChannelType(c.type)); // defense-in-depth against bad constants

  try {
    await db.$transaction(
      async (tx: any) => {
        const existing = await tx.channel.count({ where: { campaignId } });
        if (existing > 0) return;
        await tx.channel.createMany({ data: seed });
      },
      { isolationLevel: "Serializable" as any },
    );
  } catch (err: any) {
    // A concurrent transaction that created the channels first would cause either a
    // serialization failure (P2034) or a unique-constraint error — both are benign.
    const msg = err?.message || "";
    if (
      !msg.includes("Unique constraint") &&
      err?.code !== "P2034" &&
      !msg.includes("could not serialize")
    ) {
      console.error("[COMMUNITY] Failed to create channels:", msg);
    }
  }
}

/**
 * Every user who should receive broadcasts for a campaign's community channels:
 *   1. Joined clippers (via CampaignAccount → ClipAccount.userId)
 *   2. Admins on the campaign's teams (via TeamCampaign → Team → TeamMember.userId)
 *   3. Admins directly assigned via CampaignAdmin
 *   4. All OWNER-role users (they see everything)
 *
 * Deliberately does NOT include every OWNER/ADMIN globally — that was too broad.
 * Admins are only pulled in when they're actually attached to this campaign's team.
 */
export async function getCampaignSubscriberIds(campaignId: string): Promise<string[]> {
  // 1. Joined clippers
  const accounts = await db.campaignAccount.findMany({
    where: { campaignId },
    select: { clipAccount: { select: { userId: true } } },
  });
  const clipperIds = accounts.map((a: any) => a.clipAccount.userId).filter(Boolean);

  // 2. Team members on any team that has this campaign
  const teamCampaigns = await db.teamCampaign.findMany({
    where: { campaignId },
    select: {
      team: {
        select: {
          members: { select: { userId: true } },
        },
      },
    },
  });
  const teamMemberIds: string[] = [];
  for (const tc of teamCampaigns) {
    for (const m of tc.team?.members ?? []) {
      if (m.userId) teamMemberIds.push(m.userId);
    }
  }

  // 3. Direct campaign admins
  const directAdmins = await db.campaignAdmin.findMany({
    where: { campaignId },
    select: { userId: true },
  });
  const directAdminIds = directAdmins.map((a: any) => a.userId).filter(Boolean);

  // 4. All owners (they have global visibility on every campaign)
  const owners = await db.user.findMany({
    where: { role: "OWNER" },
    select: { id: true },
  });
  const ownerIds = owners.map((o: any) => o.id);

  return [...new Set([...clipperIds, ...teamMemberIds, ...directAdminIds, ...ownerIds])];
}

/**
 * Check if a clipper has access to a campaign's community (i.e. joined via CampaignAccount).
 * OWNER/ADMIN always pass. CLIENT always fails.
 */
export async function userHasCampaignCommunityAccess(
  userId: string,
  role: string,
  campaignId: string,
): Promise<boolean> {
  if (role === "CLIENT") return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  const membership = await db.campaignAccount.findFirst({
    where: { campaignId, clipAccount: { userId } },
    select: { id: true },
  });
  return !!membership;
}
