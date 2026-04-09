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

    // Count clips for logging
    const clipCount = await db.clip.count({ where: { campaignId: id } });
    const agencyCount = await db.agencyEarning.count({ where: { campaignId: id } });

    // Delete in correct order to respect FK constraints
    // 1. AgencyEarnings (depend on Clips and Campaign)
    await db.agencyEarning.deleteMany({ where: { campaignId: id } });
    // 2. ClipStats (depend on Clips)
    await db.clipStat.deleteMany({ where: { clip: { campaignId: id } } });
    // 3. TrackingJobs (depend on Clips and Campaign)
    await db.trackingJob.deleteMany({ where: { campaignId: id } });
    // 4. PayoutRequests tied to this campaign
    await db.payoutRequest.deleteMany({ where: { campaignId: id } });
    // 5. PendingCampaignEdits
    await db.pendingCampaignEdit.deleteMany({ where: { campaignId: id } });
    // 6. CampaignAccounts (join table)
    await db.campaignAccount.deleteMany({ where: { campaignId: id } });
    // 7. CampaignAdmins
    await db.campaignAdmin.deleteMany({ where: { campaignId: id } });
    // 8. TeamCampaigns
    await db.teamCampaign.deleteMany({ where: { campaignId: id } });
    // 9. Notes
    await db.note.deleteMany({ where: { campaignId: id } });
    // 10. Notifications referencing clips from this campaign
    const clipIds = (await db.clip.findMany({ where: { campaignId: id }, select: { id: true } })).map((c: any) => c.id);
    if (clipIds.length > 0) {
      await db.notification.deleteMany({ where: { metadata: { path: ["clipId"], array_contains: clipIds } } }).catch(() => {});
    }
    // 11. Clips (now safe — all dependents deleted)
    await db.clip.deleteMany({ where: { campaignId: id } });
    // 12. Campaign itself
    await db.campaign.delete({ where: { id } });

    console.log(`[DELETE] Campaign ${campaign.name} (${id}) permanently deleted with ${clipCount} clips, ${agencyCount} agency earnings`);

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
    console.error("Permanent delete failed:", err?.message);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
