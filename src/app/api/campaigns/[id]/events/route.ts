import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json([]);

  const { id } = await params;

  try {
    const events = await db.campaignEvent.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Fetch user info for events with userId
    const userIds = [...new Set(events.filter((e: any) => e.userId).map((e: any) => e.userId))];
    const users = userIds.length > 0
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, name: true, image: true } })
      : [];
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const enriched = events.map((e: any) => ({
      ...e,
      user: e.userId ? userMap.get(e.userId) || null : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json([]);
  }
}
