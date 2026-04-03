import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET - list all teams (OWNER only) */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json([]);

  try {
    const teams = await db.team.findMany({
      include: {
        members: { include: { user: { select: { id: true, username: true, email: true, role: true, image: true } } } },
        campaigns: { include: { campaign: { select: { id: true, name: true, status: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(teams);
  } catch {
    return NextResponse.json([]);
  }
}

/** POST - create a team (OWNER only) */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const team = await db.team.create({
      data: { name: body.name.trim() },
    });

    await logAudit({
      userId: session.user.id,
      action: "CREATE_TEAM",
      targetType: "team",
      targetId: team.id,
      details: { name: team.name },
    });

    return NextResponse.json(team, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
