import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// Only these fields can be modified via pending edit approval
const SAFE_CAMPAIGN_FIELDS = [
  "name", "clientName", "platform", "budget", "cpmRate",
  "payoutRule", "minViews", "maxPayoutPerClip", "description",
  "requirements", "examples", "soundLink", "assetLink", "imageUrl",
  "captionRules", "hashtagRules", "startDate",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can review edits" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`pending-edit-review:${session.user.id}`, 10, 60 * 60_000, role, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { action, reviewNote } = body;
  if (!["APPROVED", "REJECTED"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const edit = await db.pendingCampaignEdit.findUnique({ where: { id } });
    if (!edit) return NextResponse.json({ error: "Edit not found" }, { status: 404 });
    if (edit.status !== "PENDING") {
      return NextResponse.json({ error: "Edit already reviewed" }, { status: 400 });
    }

    if (action === "APPROVED") {
      // Safe JSON parse with error handling
      let rawChanges: Record<string, any>;
      try {
        rawChanges = JSON.parse(edit.changes);
      } catch {
        return NextResponse.json({ error: "Corrupted edit data" }, { status: 400 });
      }

      // Whitelist: only apply safe fields
      const safeChanges: Record<string, any> = {};
      for (const key of SAFE_CAMPAIGN_FIELDS) {
        if (key in rawChanges) {
          // Handle diff format: { old: ..., new: ... }
          const val = rawChanges[key];
          safeChanges[key] = val && typeof val === "object" && "new" in val ? val.new : val;
        }
      }

      // Type conversions
      if (safeChanges.budget !== undefined) safeChanges.budget = safeChanges.budget ? parseFloat(safeChanges.budget) : null;
      if (safeChanges.cpmRate !== undefined) safeChanges.cpmRate = safeChanges.cpmRate ? parseFloat(safeChanges.cpmRate) : null;
      if (safeChanges.maxPayoutPerClip !== undefined) safeChanges.maxPayoutPerClip = safeChanges.maxPayoutPerClip ? parseFloat(safeChanges.maxPayoutPerClip) : null;
      if (safeChanges.minViews !== undefined) safeChanges.minViews = safeChanges.minViews ? parseInt(safeChanges.minViews) : null;
      if (safeChanges.startDate !== undefined) safeChanges.startDate = safeChanges.startDate ? new Date(safeChanges.startDate) : null;

      if (Object.keys(safeChanges).length > 0) {
        await db.campaign.update({
          where: { id: edit.campaignId },
          data: safeChanges,
        });
      }
    }

    await db.pendingCampaignEdit.update({
      where: { id },
      data: { status: action, reviewNote: reviewNote || null },
    });

    await logAudit({
      userId: session.user.id,
      action: `${action}_CAMPAIGN_EDIT`,
      targetType: "campaign",
      targetId: edit.campaignId,
      details: { editId: id, action, reviewNote },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Edit review failed:", err?.message);
    return NextResponse.json({ error: "Failed to review edit" }, { status: 500 });
  }
}
