import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const campaign = await db.campaign.findUnique({ where: { id } });
    if (campaign) return NextResponse.json(campaign);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }
}

const CAMPAIGN_FIELDS = [
  "name", "clientName", "platform", "status", "budget", "cpmRate",
  "payoutRule", "minViews", "maxPayoutPerClip", "description",
  "requirements", "examples", "soundLink", "assetLink", "imageUrl",
  "bannedContent", "captionRules", "hashtagRules", "videoLengthMin",
  "videoLengthMax", "reviewTiming", "startDate", "endDate",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const raw = await req.json();

    // ── ADMIN: must create pending edit, never direct save ──
    if (role === "ADMIN") {
      if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

      // Verify admin owns this campaign
      const campaign = await db.campaign.findUnique({
        where: { id },
        select: { createdById: true, name: true, clientName: true, platform: true, budget: true, cpmRate: true, minViews: true, maxPayoutPerClip: true, requirements: true, examples: true, soundLink: true, assetLink: true, imageUrl: true, captionRules: true, hashtagRules: true, payoutRule: true, startDate: true },
      });

      if (!campaign || campaign.createdById !== session.user.id) {
        return NextResponse.json({ error: "You can only edit campaigns you created" }, { status: 403 });
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
    if (data.endDate) data.endDate = new Date(data.endDate);
    if (data.budget !== undefined && data.budget !== null && data.budget !== "") data.budget = parseFloat(data.budget);
    if (data.cpmRate !== undefined && data.cpmRate !== null && data.cpmRate !== "") data.cpmRate = parseFloat(data.cpmRate);
    if (data.maxPayoutPerClip !== undefined && data.maxPayoutPerClip !== null && data.maxPayoutPerClip !== "") data.maxPayoutPerClip = parseFloat(data.maxPayoutPerClip);
    if (data.minViews !== undefined && data.minViews !== null && data.minViews !== "") data.minViews = parseInt(data.minViews);

    if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

    try {
      const campaign = await db.campaign.update({ where: { id }, data });
      return NextResponse.json(campaign);
    } catch {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
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
      return NextResponse.json({ success: true, message: "Campaign archived" });
    } catch (err: any) {
      console.error("Archive failed:", err?.message);
      return NextResponse.json({ error: "Failed to archive campaign" }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to archive campaign" }, { status: 500 });
  }
}
