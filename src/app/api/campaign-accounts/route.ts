import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// GET: List joined campaigns for user's accounts or for a specific campaign
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;
  const clipAccountId = req.nextUrl.searchParams.get("clipAccountId") || undefined;

  if (!db) return NextResponse.json([]);

  try {
    const where: any = {};
    if (campaignId) where.campaignId = campaignId;
    if (clipAccountId) where.clipAccountId = clipAccountId;
    // Only show user's own joins (unless admin)
    const role = (session.user as any).role;
    if (role !== "ADMIN" && role !== "OWNER") {
      where.clipAccount = { userId: session.user.id };
    }
    const joins = await db.campaignAccount.findMany({
      where,
      include: {
        clipAccount: { select: { id: true, username: true, platform: true, userId: true } },
        campaign: { select: { id: true, name: true, platform: true, status: true } },
      },
      orderBy: { joinedAt: "desc" },
    });
    return NextResponse.json(joins);
  } catch {
    return NextResponse.json([]);
  }
}

// POST: Join a campaign with an approved account
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { clipAccountId, campaignId } = body;
  if (!clipAccountId || !campaignId) {
    return NextResponse.json({ error: "Account and campaign are required" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  // Verify account belongs to user and is approved
  try {
    const account = await db.clipAccount.findFirst({
      where: { id: clipAccountId, userId: session.user.id, status: "APPROVED" },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found or not approved" }, { status: 400 });
    }

    const existing = await db.campaignAccount.findUnique({
      where: { clipAccountId_campaignId: { clipAccountId, campaignId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Already joined this campaign with this account" }, { status: 400 });
    }
    const join = await db.campaignAccount.create({
      data: { clipAccountId, campaignId },
    });
    return NextResponse.json(join, { status: 201 });
  } catch (err: any) {
    console.error("DB join failed:", err?.message);
    return NextResponse.json({ error: "Failed to join campaign" }, { status: 500 });
  }
}

// DELETE: Leave a campaign
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { clipAccountId, campaignId } = body;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    await db.campaignAccount.delete({
      where: { clipAccountId_campaignId: { clipAccountId, campaignId } },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to leave campaign" }, { status: 500 });
  }
}
