import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/campaigns/[id]/destroy — Permanently delete an archived campaign
 * OWNER ONLY. Removes all related data (clips, stats, payouts, tracking jobs, etc.)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can permanently delete campaigns" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`campaign-destroy:${session.user.id}`, 5, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { id: campaignId } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Verify campaign exists and IS archived
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, isArchived: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.isArchived) {
      return NextResponse.json({ error: "Only archived campaigns can be permanently deleted" }, { status: 400 });
    }

    console.log(`[DESTROY] Starting delete for campaign: ${campaignId} (${campaign.name})`);

    await db.$transaction(async (tx: any) => {
      // 1. Get all clip IDs for this campaign
      const clipIds = (await tx.clip.findMany({ where: { campaignId }, select: { id: true } })).map((c: any) => c.id);
      console.log(`[DESTROY] Found ${clipIds.length} clips for campaign: ${campaignId}`);

      // 2. Delete clip-dependent records (deepest first)
      if (clipIds.length > 0) {
        console.log("[DESTROY] Deleting clipStat for campaign:", campaignId);
        await tx.clipStat.deleteMany({ where: { clipId: { in: clipIds } } });

        console.log("[DESTROY] Deleting trackingJob for campaign:", campaignId);
        await tx.trackingJob.deleteMany({ where: { clipId: { in: clipIds } } });

        console.log("[DESTROY] Deleting agencyEarning for campaign:", campaignId);
        await tx.agencyEarning.deleteMany({ where: { clipId: { in: clipIds } } });
      }

      // 3. Delete remaining campaign-level agency earnings (orphans)
      console.log("[DESTROY] Deleting remaining agencyEarning for campaign:", campaignId);
      await tx.agencyEarning.deleteMany({ where: { campaignId } });

      // 4. Delete clips
      console.log("[DESTROY] Deleting clips for campaign:", campaignId);
      await tx.clip.deleteMany({ where: { campaignId } });

      // 5. Delete campaign join tables
      console.log("[DESTROY] Deleting campaignAccount for campaign:", campaignId);
      await tx.campaignAccount.deleteMany({ where: { campaignId } });

      console.log("[DESTROY] Deleting campaignAdmin for campaign:", campaignId);
      await tx.campaignAdmin.deleteMany({ where: { campaignId } });

      console.log("[DESTROY] Deleting teamCampaign for campaign:", campaignId);
      await tx.teamCampaign.deleteMany({ where: { campaignId } });

      // 6. Delete pending campaign edits
      console.log("[DESTROY] Deleting pendingCampaignEdit for campaign:", campaignId);
      await tx.pendingCampaignEdit.deleteMany({ where: { campaignId } });

      // 7. Nullify payoutRequest campaignId (optional FK, no cascade)
      console.log("[DESTROY] Nullifying payoutRequest.campaignId for campaign:", campaignId);
      await tx.payoutRequest.updateMany({ where: { campaignId }, data: { campaignId: null } });

      // 8. Nullify note campaignId (optional FK, no cascade)
      console.log("[DESTROY] Nullifying note.campaignId for campaign:", campaignId);
      await tx.note.updateMany({ where: { campaignId }, data: { campaignId: null } });

      // 9. Delete conversations + participants + messages tied to this campaign
      console.log("[DESTROY] Deleting conversations for campaign:", campaignId);
      const convos = await tx.conversation.findMany({ where: { campaignId }, select: { id: true } });
      const convoIds = convos.map((c: any) => c.id);
      if (convoIds.length > 0) {
        console.log(`[DESTROY] Deleting ${convoIds.length} conversations (messages, participants) for campaign:`, campaignId);
        await tx.message.deleteMany({ where: { conversationId: { in: convoIds } } });
        await tx.conversationParticipant.deleteMany({ where: { conversationId: { in: convoIds } } });
        await tx.conversation.deleteMany({ where: { id: { in: convoIds } } });
      }

      // 10. Delete remaining tracking jobs tied to campaign (safety)
      console.log("[DESTROY] Deleting remaining trackingJob for campaign:", campaignId);
      await tx.trackingJob.deleteMany({ where: { campaignId } });

      // 11. Delete the campaign itself
      console.log("[DESTROY] Deleting campaign:", campaignId);
      await tx.campaign.delete({ where: { id: campaignId } });

      console.log(`[DESTROY] Campaign ${campaign.name} (${campaignId}) permanently deleted with ${clipIds.length} clips`);
    });

    // Audit log
    await logAudit({
      userId: session.user.id,
      action: "PERMANENT_DELETE_CAMPAIGN",
      targetType: "campaign",
      targetId: campaignId,
      details: { name: campaign.name },
    });

    return NextResponse.json({ success: true, message: "Campaign permanently deleted" });
  } catch (err: any) {
    console.error("[DESTROY] Failed:", err?.message, err?.code);
    return NextResponse.json({ error: err?.message || "Failed to delete campaign" }, { status: 500 });
  }
}
