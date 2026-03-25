import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const scope = req.nextUrl.searchParams.get("scope");
  // ?archived=true → owner-only: show only archived campaigns
  const showArchived = req.nextUrl.searchParams.get("archived") === "true";

  if (!db) return NextResponse.json([]);

  try {
    const where: any = status ? { status: status as any } : {};

    if (showArchived) {
      // Only owner can see archived campaigns
      if (role !== "OWNER") return NextResponse.json([]);
      where.isArchived = true;
    } else {
      // Exclude archived from all live views
      where.isArchived = false;
    }

    if (scope === "manage" && role === "ADMIN") {
      const ids = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(ids)) {
        where.id = { in: ids };
      }
    } else if (role === "CLIPPER") {
      if (!status) {
        where.status = { in: ["ACTIVE", "PAUSED"] };
      }
    }

    const campaigns = await db.campaign.findMany({
      where,
      include: {
        _count: { select: { clips: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(campaigns);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.name || !data.platform) {
    return NextResponse.json({ error: "Name and platform are required" }, { status: 400 });
  }

  const campaignData = {
    name: data.name,
    clientName: data.clientName || null,
    platform: data.platform,
    budget: data.budget ? parseFloat(data.budget) : null,
    cpmRate: data.cpmRate ? parseFloat(data.cpmRate) : null,
    payoutRule: data.payoutRule || null,
    minViews: data.minViews ? parseInt(data.minViews) : null,
    maxPayoutPerClip: data.maxPayoutPerClip ? parseFloat(data.maxPayoutPerClip) : null,
    description: data.description || null,
    requirements: data.requirements || null,
    examples: data.examples || null,
    soundLink: data.soundLink || null,
    assetLink: data.assetLink || null,
    imageUrl: data.imageUrl || null,
    bannedContent: data.bannedContent || null,
    captionRules: data.captionRules || null,
    hashtagRules: data.hashtagRules || null,
    videoLengthMin: data.videoLengthMin ? parseInt(data.videoLengthMin) : null,
    videoLengthMax: data.videoLengthMax ? parseInt(data.videoLengthMax) : null,
    reviewTiming: data.reviewTiming || null,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    status: data.status || "ACTIVE",
  };

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Build clean create data — only include non-null values
    const createData: Record<string, any> = {
      name: campaignData.name,
      platform: campaignData.platform,
      status: campaignData.status || "ACTIVE",
      createdById: session.user.id,
    };

    // Optional fields — only include if they have actual values
    if (campaignData.clientName) createData.clientName = campaignData.clientName;
    if (campaignData.budget) createData.budget = campaignData.budget;
    if (campaignData.cpmRate) createData.cpmRate = campaignData.cpmRate;
    if (campaignData.payoutRule) createData.payoutRule = campaignData.payoutRule;
    if (campaignData.minViews) createData.minViews = campaignData.minViews;
    if (campaignData.maxPayoutPerClip) createData.maxPayoutPerClip = campaignData.maxPayoutPerClip;
    if (campaignData.description) createData.description = campaignData.description;
    if (campaignData.requirements) createData.requirements = campaignData.requirements;
    if (campaignData.examples) createData.examples = campaignData.examples;
    if (campaignData.soundLink) createData.soundLink = campaignData.soundLink;
    if (campaignData.assetLink) createData.assetLink = campaignData.assetLink;
    if (campaignData.imageUrl) createData.imageUrl = campaignData.imageUrl;
    if (campaignData.bannedContent) createData.bannedContent = campaignData.bannedContent;
    if (campaignData.captionRules) createData.captionRules = campaignData.captionRules;
    if (campaignData.hashtagRules) createData.hashtagRules = campaignData.hashtagRules;
    if (campaignData.videoLengthMin) createData.videoLengthMin = campaignData.videoLengthMin;
    if (campaignData.videoLengthMax) createData.videoLengthMax = campaignData.videoLengthMax;
    if (campaignData.reviewTiming) createData.reviewTiming = campaignData.reviewTiming;
    if (campaignData.startDate) createData.startDate = new Date(campaignData.startDate);
    if (campaignData.endDate) createData.endDate = new Date(campaignData.endDate);

    const campaign = await db.campaign.create({ data: createData });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err: any) {
    console.error("DB campaign create failed:", err?.message, err);
    return NextResponse.json({ error: err?.message || "Failed to create campaign" }, { status: 500 });
  }
}
