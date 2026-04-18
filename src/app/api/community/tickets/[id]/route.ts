import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { userHasCampaignCommunityAccess } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["open", "waiting", "resolved", "pending"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id } = await params;
  const ticket = await db.campaignTicket.findUnique({
    where: { id },
    include: { user: { select: { id: true, username: true, image: true } }, campaign: { select: { id: true, name: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // CLIPPER can only view their own ticket.
  if (role === "CLIPPER" && ticket.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(ticket);
}

/**
 * PATCH /api/community/tickets/[id] { status?, notes? }
 * OWNER/ADMIN only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const data: any = {};
  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 5000)) {
      return NextResponse.json({ error: "Notes too long (max 5000 chars)" }, { status: 400 });
    }
    data.notes = body.notes;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    // Scope ADMIN to their campaigns — OWNER always passes. Prevents an admin on
    // one team from updating status/notes on another team's tickets.
    const existing = await db.campaignTicket.findUnique({
      where: { id },
      select: { campaignId: true },
    });
    if (!existing) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, existing.campaignId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await db.campaignTicket.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("[COMMUNITY] ticket PATCH error:", err?.message);
    return NextResponse.json({ error: "Failed to update ticket" }, { status: 500 });
  }
}
