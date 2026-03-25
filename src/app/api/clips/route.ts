import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const campaignId = req.nextUrl.searchParams.get("campaignId");
  // ?includeArchived=true for archive page stats
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";

  if (!db) return NextResponse.json([]);

  try {
    const where: any = {};
    if (status) where.status = status as any;
    if (campaignId) where.campaignId = campaignId;

    // Exclude clips from archived campaigns in live views
    if (!includeArchived) {
      where.campaign = { isArchived: false };
    }

    // ADMIN: only clips for their allowed campaigns
    if (role === "ADMIN") {
      const ids = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(ids)) {
        if (campaignId) {
          if (!ids.includes(campaignId)) {
            return NextResponse.json([]);
          }
        } else {
          where.campaignId = { in: ids };
        }
      }
    }

    const clips = await db.clip.findMany({
      where,
      include: {
        user: { select: { username: true, image: true, discordId: true } },
        campaign: { select: { name: true, platform: true, createdById: true, isArchived: true } },
        clipAccount: { select: { username: true, platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clips);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.campaignId || !data.clipAccountId || !data.clipUrl) {
    return NextResponse.json({ error: "Campaign, account, and clip URL are required" }, { status: 400 });
  }

  try { new URL(data.clipUrl); } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.findFirst({
      where: { id: data.clipAccountId, userId: session.user.id, status: "APPROVED" },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not approved or not found" }, { status: 400 });
    }

    const existing = await db.clip.findFirst({
      where: { clipUrl: data.clipUrl, campaignId: data.campaignId },
    });
    if (existing) {
      return NextResponse.json({ error: "This clip URL has already been submitted for this campaign" }, { status: 400 });
    }

    const existingOther = await db.clip.findFirst({
      where: { clipUrl: data.clipUrl, userId: session.user.id },
    });
    if (existingOther) {
      return NextResponse.json({ error: "This clip URL has already been submitted to another campaign" }, { status: 400 });
    }

    const clip = await db.clip.create({
      data: {
        userId: session.user.id,
        campaignId: data.campaignId,
        clipAccountId: data.clipAccountId,
        clipUrl: data.clipUrl,
        note: data.note || null,
      },
    });

    await db.clipStat.create({
      data: { clipId: clip.id, views: 0, likes: 0, comments: 0, shares: 0 },
    });

    return NextResponse.json(clip, { status: 201 });
  } catch (err: any) {
    console.error("DB clip create failed:", err?.message);
    return NextResponse.json({ error: "Failed to create clip" }, { status: 500 });
  }
}
