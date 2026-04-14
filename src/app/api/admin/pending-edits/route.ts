import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — list pending edits (OWNER sees all, ADMIN sees own) */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const where = role === "OWNER" ? {} : { requestedById: session.user.id };
    const edits = await db.pendingCampaignEdit.findMany({
      where,
      include: {
        campaign: { select: { name: true } },
        requestedBy: { select: { username: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(edits);
  } catch {
    return NextResponse.json([]);
  }
}

/** POST — admin submits an edit request */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins submit edit requests" }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.campaignId || !body.changes) {
    return NextResponse.json({ error: "campaignId and changes required" }, { status: 400 });
  }

  // Validate that changes only contain allowed fields
  const SAFE_EDIT_FIELDS = [
    "name", "description", "requirements", "examples", "soundLink", "assetLink",
    "imageUrl", "bannedContent", "captionRules", "hashtagRules",
    "videoLengthMin", "videoLengthMax", "budget", "minViews",
    "maxPayoutPerClip", "maxClipsPerUserPerDay", "clipperCpm", "ownerCpm", "agencyFee",
  ];
  let changesObj;
  try { changesObj = typeof body.changes === "string" ? JSON.parse(body.changes) : body.changes; } catch {
    return NextResponse.json({ error: "Invalid changes JSON" }, { status: 400 });
  }
  const invalidFields = Object.keys(changesObj).filter((k: string) => !SAFE_EDIT_FIELDS.includes(k));
  if (invalidFields.length > 0) {
    return NextResponse.json({ error: "Invalid fields: " + invalidFields.join(", ") }, { status: 400 });
  }

  // Verify admin has access to this campaign (creator, assigned, or team)
  try {
    const campaign = await db.campaign.findUnique({ where: { id: body.campaignId } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const isCreator = campaign.createdById === session.user.id;
    let hasAccess = isCreator;
    if (!hasAccess) {
      const directAssign = await db.campaignAdmin.findUnique({
        where: { userId_campaignId: { userId: session.user.id, campaignId: body.campaignId } },
      });
      hasAccess = !!directAssign;
    }
    if (!hasAccess) {
      const myTeams = await db.teamMember.findMany({
        where: { userId: session.user.id }, select: { teamId: true },
      });
      if (myTeams.length > 0) {
        const teamCampaign = await db.teamCampaign.findFirst({
          where: { campaignId: body.campaignId, teamId: { in: myTeams.map((t: any) => t.teamId) } },
        });
        hasAccess = !!teamCampaign;
      }
    }
    if (!hasAccess) {
      return NextResponse.json({ error: "You do not have access to this campaign" }, { status: 403 });
    }

    const edit = await db.pendingCampaignEdit.create({
      data: {
        campaignId: body.campaignId,
        requestedById: session.user.id,
        changes: JSON.stringify(body.changes),
      },
    });
    return NextResponse.json(edit, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create edit request" }, { status: 500 });
  }
}
