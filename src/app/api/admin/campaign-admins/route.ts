import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — list campaign admin assignments. OWNER sees all. ADMIN sees own. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const where = role === "OWNER" ? {} : { userId: session.user.id };
    const assignments = await db.campaignAdmin.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
    return NextResponse.json(assignments);
  } catch {
    return NextResponse.json([]);
  }
}

/** POST — assign an admin to a campaign. OWNER only. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can assign campaign admins" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { userId, campaignId } = body;
  if (!userId || !campaignId) {
    return NextResponse.json({ error: "userId and campaignId required" }, { status: 400 });
  }

  try {
    // Check user is ADMIN
    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "User must be an ADMIN" }, { status: 400 });
    }

    const assignment = await db.campaignAdmin.create({
      data: { userId, campaignId },
    });
    return NextResponse.json(assignment, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Already assigned" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to assign" }, { status: 500 });
  }
}

/** DELETE — remove campaign admin assignment. OWNER only. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck3 = checkBanStatus(session);
  if (banCheck3) return banCheck3;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can remove assignments" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { userId, campaignId } = body;
  try {
    await db.campaignAdmin.delete({
      where: { userId_campaignId: { userId, campaignId } },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
}
