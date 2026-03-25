/**
 * Shared helper: get the list of campaign IDs a user can access.
 * OWNER sees all. ADMIN sees created + assigned. CLIPPER sees none (uses /mine endpoints).
 */
import { db } from "@/lib/db";

export async function getUserCampaignIds(userId: string, role: string): Promise<string[] | "ALL"> {
  if (role === "OWNER") return "ALL";
  if (role !== "ADMIN") return [];

  if (!db) return [];

  const [assignments, created] = await Promise.all([
    db.campaignAdmin.findMany({
      where: { userId },
      select: { campaignId: true },
    }),
    db.campaign.findMany({
      where: { createdById: userId },
      select: { id: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const a of assignments) ids.add(a.campaignId);
  for (const c of created) ids.add(c.id);
  return [...ids];
}
