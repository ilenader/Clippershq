import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_CHANNEL_NAMES = ["announcements", "general", "leaderboard"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { id } = await params;
  const channel = await db.channel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 50);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const updated = await db.channel.update({ where: { id }, data: { name } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { id } = await params;
  const channel = await db.channel.findUnique({ where: { id } });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (DEFAULT_CHANNEL_NAMES.includes(channel.name.toLowerCase())) {
    return NextResponse.json({ error: "Cannot delete default channels" }, { status: 400 });
  }

  await db.channel.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
