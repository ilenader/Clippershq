import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

/** PATCH — owner approves or rejects a pending edit */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can review edits" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { action, reviewNote } = body;
  if (!["APPROVED", "REJECTED"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const edit = await db.pendingCampaignEdit.findUnique({ where: { id } });
    if (!edit) return NextResponse.json({ error: "Edit not found" }, { status: 404 });
    if (edit.status !== "PENDING") {
      return NextResponse.json({ error: "Edit already reviewed" }, { status: 400 });
    }

    // If approved, apply the changes to the campaign
    if (action === "APPROVED") {
      const changes = JSON.parse(edit.changes);
      await db.campaign.update({
        where: { id: edit.campaignId },
        data: changes,
      });
    }

    await db.pendingCampaignEdit.update({
      where: { id },
      data: { status: action, reviewNote: reviewNote || null },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to review edit" }, { status: 500 });
  }
}
