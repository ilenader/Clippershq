import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
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

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Verify campaign exists and IS archived
    const campaign = await db.campaign.findUnique({
      where: { id },
      select: { id: true, name: true, isArchived: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (!campaign.isArchived) {
      return NextResponse.json({ error: "Only archived campaigns can be permanently deleted" }, { status: 400 });
    }

    console.log(`[DELETE] Attempting to delete campaign: ${id} (${campaign.name})`);

    await db.$transaction(async (tx: any) => {
      // 1. Get all clip IDs for this campaign
      const clipIds = (await tx.clip.findMany({ where: { campaignId: id }, select: { id: true } })).map((c: any) => c.id);

      // 2. Delete clip-dependent records
      if (clipIds.length > 0) {
        await tx.clipStat.deleteMany({ where: { clipId: { in: clipIds } } });
        await tx.trackingJob.deleteMany({ where: { clipId: { in: clipIds } } });
        await tx.agencyEarning.deleteMany({ where: { clipId: { in: clipIds } } });
      }

      // 3. Delete campaign-level agency earnings (safety — may have orphans)
      await tx.agencyEarning.deleteMany({ where: { campaignId: id } });

      // 4. Delete clips
      await tx.clip.deleteMany({ where: { campaignId: id } });

      // 5. Delete campaign join tables
      await tx.campaignAccount.deleteMany({ where: { campaignId: id } });
      await tx.campaignAdmin.deleteMany({ where: { campaignId: id } });
      await tx.teamCampaign.deleteMany({ where: { campaignId: id } });

      // 6. Delete campaign edits
      await tx.pendingCampaignEdit.deleteMany({ where: { campaignId: id } });

      // 7. Delete payouts tied to this campaign
      try { await tx.payoutRequest.deleteMany({ where: { campaignId: id } }); } catch {}

      // 8. Delete notes
      try { await tx.note.deleteMany({ where: { campaignId: id } }); } catch {}

      // 9. Delete conversations + participants + messages tied to this campaign
      try {
        const convos = await tx.conversation.findMany({ where: { campaignId: id }, select: { id: true } });
        const convoIds = convos.map((c: any) => c.id);
        if (convoIds.length > 0) {
          await tx.message.deleteMany({ where: { conversationId: { in: convoIds } } });
          await tx.conversationParticipant.deleteMany({ where: { conversationId: { in: convoIds } } });
          await tx.conversation.deleteMany({ where: { id: { in: convoIds } } });
        }
      } catch {}

      // 10. Delete tracking jobs tied to campaign (safety — some may not have clipId)
      try { await tx.trackingJob.deleteMany({ where: { campaignId: id } }); } catch {}

      // 11. Delete the campaign itself
      await tx.campaign.delete({ where: { id } });

      console.log(`[DELETE] Campaign ${campaign.name} (${id}) permanently deleted with ${clipIds.length} clips`);
    });

    // Audit log
    await logAudit({
      userId: session.user.id,
      action: "PERMANENT_DELETE_CAMPAIGN",
      targetType: "campaign",
      targetId: id,
      details: { name: campaign.name },
    });

    return NextResponse.json({ success: true, message: "Campaign permanently deleted" });
  } catch (err: any) {
    console.error("[DELETE] Failed:", err?.message, err?.code);
    return NextResponse.json({ error: err?.message || "Failed to delete campaign" }, { status: 500 });
  }
}
