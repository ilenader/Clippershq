import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — list pending edits (OWNER sees all, ADMIN sees own) */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

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

  // Verify admin created this campaign
  try {
    const campaign = await db.campaign.findUnique({ where: { id: body.campaignId } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    if (campaign.createdById !== session.user.id) {
      return NextResponse.json({ error: "You can only edit your own campaigns" }, { status: 403 });
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
