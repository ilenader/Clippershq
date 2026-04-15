import { db } from "@/lib/db";

export async function logCampaignEvent(
  campaignId: string,
  type: string,
  description: string,
  metadata?: Record<string, any>,
  userId?: string,
) {
  try {
    if (!db) return;
    await db.campaignEvent.create({
      data: {
        campaignId,
        type,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        userId: userId || null,
      },
    });
  } catch (err: any) {
    console.error("[CAMPAIGN-EVENT] Failed to log:", err?.message);
  }
}
