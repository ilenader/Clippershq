/**
 * Community system helpers — channel provisioning + subscriber resolution.
 */
import { db } from "@/lib/db";

/**
 * Ensure the three default channels (Announcements, General, Leaderboard) exist for a campaign.
 * No-op if any channel already exists for the campaign.
 */
export async function ensureCampaignChannels(campaignId: string): Promise<void> {
  const existing = await db.channel.count({ where: { campaignId } });
  if (existing > 0) return;
  await db.channel.createMany({
    data: [
      { campaignId, name: "Announcements", type: "announcement", sortOrder: 0 },
      { campaignId, name: "General", type: "general", sortOrder: 1 },
      { campaignId, name: "Leaderboard", type: "leaderboard", sortOrder: 2 },
    ],
  });
}

/**
 * Every user who should receive broadcasts for a campaign's community channels:
 * joined clippers (via CampaignAccount) + all OWNER/ADMIN users.
 */
export async function getCampaignSubscriberIds(campaignId: string): Promise<string[]> {
  const accounts = await db.campaignAccount.findMany({
    where: { campaignId },
    select: { clipAccount: { select: { userId: true } } },
  });
  const userIds = [...new Set(accounts.map((a: any) => a.clipAccount.userId))];
  const owners = await db.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] } },
    select: { id: true },
  });
  return [...new Set([...userIds, ...owners.map((o: any) => o.id)])];
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
