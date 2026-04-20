/**
 * Shared helper: get the list of campaign IDs a user can access.
 * OWNER sees all. ADMIN sees created + assigned + team campaigns.
 * CLIPPER sees none (uses /mine endpoints).
 */
import { db } from "@/lib/db";

export async function getUserCampaignIds(userId: string, role: string): Promise<string[] | "ALL"> {
  if (role === "OWNER") return "ALL";
  if (role !== "ADMIN") return [];

  if (!db) return [];

  try {
    const [directAssignments, created, owned, teamMemberships] = await Promise.all([
      // Direct campaign assignments
      db.campaignAdmin.findMany({
        where: { userId },
        select: { campaignId: true },
      }),
      // Campaigns created by this user
      db.campaign.findMany({
        where: { createdById: userId },
        select: { id: true },
        take: 1000,
      }),
      // Campaigns where user is assigned owner
      db.campaign.findMany({
        where: { ownerUserId: userId },
        select: { id: true },
        take: 1000,
      }),
      // Team-based access: find user's teams, then find team campaigns
      db.teamMember.findMany({
        where: { userId },
        select: { teamId: true },
      }),
    ]);

    const ids = new Set<string>();
    for (const a of directAssignments) ids.add(a.campaignId);
    for (const c of created) ids.add(c.id);
    for (const o of owned) ids.add(o.id);

    // Get campaigns from all user's teams
    if (teamMemberships.length > 0) {
      const teamIds = teamMemberships.map((tm: any) => tm.teamId);
      const teamCampaigns = await db.teamCampaign.findMany({
        where: { teamId: { in: teamIds } },
        select: { campaignId: true },
      });
      for (const tc of teamCampaigns) ids.add(tc.campaignId);
    }

    const result = [...ids];
    return Array.isArray(result) ? result : [];
  } catch (err: any) {
    console.error(`[CAMPAIGN-ACCESS] Failed for user ${userId}:`, err?.message);
    return [];
  }
}
