import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = (session.user as any).role;

    // CLIPPERs cannot see DRAFT campaigns
    if (role === "CLIPPER" && campaign.status === "DRAFT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // CLIPPERs: strip sensitive owner/agency fields
    if (role === "CLIPPER") {
      const { ownerCpm, agencyFee, clientName, aiKnowledge, bannedContent, captionRules, hashtagRules, ...publicFields } = campaign as any;
      return NextResponse.json(publicFields);
    }

    return NextResponse.json(campaign);
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
}

const CAMPAIGN_FIELDS = [
  "name", "clientName", "platform", "status", "budget",
  "clipperCpm", "ownerCpm", "agencyFee", "pricingModel",
  "payoutRule", "minViews", "maxPayoutPerClip",
  "description", "requirements", "examples", "soundLink", "assetLink",
  "imageUrl", "bannedContent", "captionRules", "hashtagRules",
  "videoLengthMin", "videoLengthMax", "reviewTiming", "aiKnowledge", "startDate", "endDate",
  "maxClipsPerUserPerDay",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 20 campaign edits per hour per user
  const rl = checkRateLimit(`campaign-edit:${session.user.id}`, 20, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  try {
    const { id } = await params;
    const raw = await req.json();

    // ── ADMIN: must create pending edit, never direct save ──
    if (role === "ADMIN") {
      if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

      // Verify admin has access to this campaign (creator OR assigned via CampaignAdmin/team)
      const campaign = await db.campaign.findUnique({
        where: { id },
        select: { createdById: true, name: true, clientName: true, platform: true, budget: true, clipperCpm: true, ownerCpm: true, agencyFee: true, pricingModel: true, minViews: true, maxPayoutPerClip: true, maxClipsPerUserPerDay: true, requirements: true, examples: true, soundLink: true, assetLink: true, imageUrl: true, captionRules: true, hashtagRules: true, aiKnowledge: true, payoutRule: true, startDate: true },
      });
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }

      // Allow if creator, directly assigned, or member of a team with this campaign
      const isCreator = campaign.createdById === session.user.id;
      let hasAccess = isCreator;
      if (!hasAccess) {
        const directAssign = await db.campaignAdmin.findUnique({
          where: { userId_campaignId: { userId: session.user.id, campaignId: id } },
        });
        hasAccess = !!directAssign;
      }
      if (!hasAccess) {
        // Check team-based access
        const myTeams = await db.teamMember.findMany({
          where: { userId: session.user.id },
          select: { teamId: true },
        });
        if (myTeams.length > 0) {
          const teamCampaign = await db.teamCampaign.findFirst({
            where: { campaignId: id, teamId: { in: myTeams.map((t: any) => t.teamId) } },
          });
          hasAccess = !!teamCampaign;
        }
      }
      if (!hasAccess) {
        return NextResponse.json({ error: "You do not have access to edit this campaign" }, { status: 403 });
      }

      // Build changes object with old/new values for diff display
      const changes: Record<string, { old: any; new: any }> = {};
      for (const key of CAMPAIGN_FIELDS) {
        if (key in raw && key !== "status") {
          const oldVal = (campaign as any)[key];
          const newVal = raw[key];
          // Only include actually changed fields
          if (String(oldVal ?? "") !== String(newVal ?? "")) {
            changes[key] = { old: oldVal, new: newVal };
          }
        }
      }

      if (Object.keys(changes).length === 0) {
        return NextResponse.json({ error: "No changes detected" }, { status: 400 });
      }

      // Create pending edit request
      const edit = await db.pendingCampaignEdit.create({
        data: {
          campaignId: id,
          requestedById: session.user.id,
          changes: JSON.stringify(changes),
        },
      });

      return NextResponse.json({ pendingEdit: true, editId: edit.id, message: "Changes submitted for owner review" });
    }

    // ── OWNER: direct save ──
    const data: Record<string, any> = {};
    for (const key of CAMPAIGN_FIELDS) {
      if (key in raw) data[key] = raw[key];
    }

    if (data.startDate) data.startDate = new Date(data.startDate);
    else if (data.startDate === "") data.startDate = null;
    if (data.endDate) data.endDate = new Date(data.endDate);
    else if (data.endDate === "") data.endDate = null;
    // Convert numeric fields: empty string → null, non-empty → parse
    for (const f of ["budget", "clipperCpm", "ownerCpm", "agencyFee", "maxPayoutPerClip"]) {
      if (f in data) data[f] = (data[f] !== "" && data[f] != null) ? parseFloat(data[f]) : null;
    }
    if ("minViews" in data) data.minViews = (data.minViews !== "" && data.minViews != null) ? parseInt(data.minViews) : null;
    if (data.maxClipsPerUserPerDay !== undefined && data.maxClipsPerUserPerDay !== null && data.maxClipsPerUserPerDay !== "") {
      const v = parseInt(data.maxClipsPerUserPerDay);
      data.maxClipsPerUserPerDay = Math.max(1, Math.min(6, isNaN(v) ? 3 : v));
    }

    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

    try {
      // Fetch current campaign for auto-resume check
      const oldCampaign = await db.campaign.findUnique({
        where: { id },
        select: { status: true, budget: true },
      });

      const campaign = await db.campaign.update({ where: { id }, data });

      // Auto-resume: if campaign was PAUSED and budget was increased past spent
      if (
        oldCampaign &&
        oldCampaign.status === "PAUSED" &&
        data.budget != null &&
        oldCampaign.budget != null &&
        data.budget > oldCampaign.budget
      ) {
        try {
          const { getCampaignBudgetStatus } = await import("@/lib/balance");
          const budgetStatus = await getCampaignBudgetStatus(id);
          if (budgetStatus && data.budget > budgetStatus.spent) {
            await db.campaign.update({
              where: { id },
              data: { status: "ACTIVE", lastBudgetPauseAt: new Date() },
            });
            // Reactivate tracking jobs
            const reactivated = await db.trackingJob.updateMany({
              where: { campaignId: id, isActive: false },
              data: { isActive: true },
            });
            console.log(`[BUDGET] Campaign ${id} auto-resumed — budget increased from $${oldCampaign.budget} to $${data.budget}, spent: $${budgetStatus.spent}. Reactivated ${reactivated.count} tracking jobs.`);
            // Re-fetch to return updated status
            const updated = await db.campaign.findUnique({ where: { id } });
            return NextResponse.json(updated);
          }
        } catch (resumeErr: any) {
          console.error(`[BUDGET] Auto-resume check failed for campaign ${id}:`, resumeErr?.message);
        }
      }

      return NextResponse.json(campaign);
    } catch (updateErr: any) {
      console.error(`PATCH campaign ${id} DB error:`, updateErr?.message, "data:", JSON.stringify(data).substring(0, 500));
      if (updateErr?.code === "P2025") {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to save campaign. Check field values." }, { status: 500 });
    }
  } catch (err: any) {
    console.error("PATCH /api/campaigns/[id] error:", err);
    return NextResponse.json({ error: err?.message || "Failed to update campaign" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck3 = checkBanStatus(session);
  if (banCheck3) return banCheck3;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can delete campaigns" }, { status: 403 });
  }

  try {
    const { id } = await params;

    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

    // Soft-delete ONLY: archive, never hard delete
    try {
      await db.campaign.update({
        where: { id },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archivedById: session.user.id,
          status: "PAUSED",
        },
      });

      // Deactivate all tracking jobs for this campaign
      const deactivated = await db.trackingJob.updateMany({
        where: { campaignId: id, isActive: true },
        data: { isActive: false },
      });
      console.log(`[ARCHIVE] Deactivated ${deactivated.count} tracking jobs for campaign:`, id);

      return NextResponse.json({ success: true, message: "Campaign archived" });
    } catch (err: any) {
      console.error("Archive failed:", err?.message);
      return NextResponse.json({ error: "Failed to archive campaign" }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to archive campaign" }, { status: 500 });
  }
}
