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

    // Delete in correct order to respect FK constraints
    // 1. ClipStats (depend on Clips)
    await db.clipStat.deleteMany({ where: { clip: { campaignId: id } } });
    // 2. TrackingJobs (depend on Clips and Campaign)
    await db.trackingJob.deleteMany({ where: { campaignId: id } });
    // 3. PayoutRequests tied to this campaign
    await db.payoutRequest.deleteMany({ where: { campaignId: id } });
    // 4. PendingCampaignEdits
    await db.pendingCampaignEdit.deleteMany({ where: { campaignId: id } });
    // 5. CampaignAccounts (join table)
    await db.campaignAccount.deleteMany({ where: { campaignId: id } });
    // 6. CampaignAdmins
    await db.campaignAdmin.deleteMany({ where: { campaignId: id } });
    // 7. TeamCampaigns
    await db.teamCampaign.deleteMany({ where: { campaignId: id } });
    // 8. Notes
    await db.note.deleteMany({ where: { campaignId: id } });
    // 9. Clips (now safe — stats and tracking already deleted)
    await db.clip.deleteMany({ where: { campaignId: id } });
    // 10. Campaign itself
    await db.campaign.delete({ where: { id } });

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
