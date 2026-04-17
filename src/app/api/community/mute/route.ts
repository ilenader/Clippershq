import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ campaignIds: [] }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  if (!db) return NextResponse.json({ campaignIds: [] });

  const mutes = await db.communityMute.findMany({
    where: { userId: session.user.id },
    select: { campaignId: true },
  });
  return NextResponse.json({ campaignIds: mutes.map((m: any) => m.campaignId) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  await db.communityMute.upsert({
    where: { campaignId_userId: { campaignId, userId: session.user.id } },
    create: { campaignId, userId: session.user.id },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });

  await db.communityMute.deleteMany({
    where: { campaignId, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
