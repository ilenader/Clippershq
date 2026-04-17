import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { broadcastCampaignAlert } from "@/lib/discord-bot";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;

  // CLIENTs must use /api/client/campaigns — this route returns sensitive fields (ownerCpm, agencyFee, aiKnowledge)
  if (role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      take: 200,
    });
    return NextResponse.json(campaigns);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Rate limit: 10 campaign creations per hour per user
  const rl = checkRateLimit(`campaign-create:${session.user.id}`, 10, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!data.name || !data.platform) {
    return NextResponse.json({ error: "Name and platform are required" }, { status: 400 });
  }

  // String length caps (defense vs. payload bombs)
  const stringCaps: Record<string, number> = {
    name: 200, clientName: 200, platform: 100, payoutRule: 500,
    description: 5000, requirements: 5000, examples: 5000,
    soundLink: 2000, assetLink: 2000, imageUrl: 2000,
    bannedContent: 5000, captionRules: 5000, hashtagRules: 5000,
    aiKnowledge: 20000, reviewTiming: 500,
  };
  for (const [field, cap] of Object.entries(stringCaps)) {
    const v = data[field];
    if (v != null && typeof v === "string" && v.length > cap) {
      return NextResponse.json({ error: `${field} is too long (max ${cap} chars)` }, { status: 400 });
    }
  }

  // Reject negative or NaN numeric inputs (budget must be >= 0 or absent for unlimited)
  for (const field of ["budget", "clipperCpm", "ownerCpm", "agencyFee", "maxPayoutPerClip", "minViews", "videoLengthMin", "videoLengthMax"]) {
    const v = data[field];
    if (v !== undefined && v !== null && v !== "") {
      const num = parseFloat(v);
      if (!isFinite(num) || num < 0) {
        return NextResponse.json({ error: `${field} must be a non-negative number` }, { status: 400 });
      }
    }
  }

  const campaignData = {
    name: data.name,
    clientName: data.clientName || null,
    platform: data.platform,
    budget: data.budget ? parseFloat(data.budget) : null,
    clipperCpm: data.clipperCpm ? parseFloat(data.clipperCpm) : null,
    pricingModel: data.pricingModel || "AGENCY_FEE",
    ownerCpm: data.ownerCpm ? parseFloat(data.ownerCpm) : null,
    agencyFee: data.agencyFee ? parseFloat(data.agencyFee) : null,
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
    aiKnowledge: data.aiKnowledge || null,
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
    // ADMIN-created campaigns go to DRAFT for owner review; OWNER campaigns go ACTIVE
    const createData: Record<string, any> = {
      name: campaignData.name,
      platform: campaignData.platform,
      status: role === "ADMIN" ? "DRAFT" : (campaignData.status || "ACTIVE"),
      createdById: session.user.id,
    };

    // Optional fields — only include if they have actual values
    if (campaignData.clientName) createData.clientName = campaignData.clientName;
    if (campaignData.budget) createData.budget = campaignData.budget;
    if (campaignData.clipperCpm) createData.clipperCpm = campaignData.clipperCpm;
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
    if (campaignData.aiKnowledge) createData.aiKnowledge = campaignData.aiKnowledge;
    if (campaignData.pricingModel) createData.pricingModel = campaignData.pricingModel;
    if (campaignData.ownerCpm) createData.ownerCpm = campaignData.ownerCpm;
    if (campaignData.agencyFee) createData.agencyFee = campaignData.agencyFee;
    if (campaignData.videoLengthMin) createData.videoLengthMin = campaignData.videoLengthMin;
    if (campaignData.videoLengthMax) createData.videoLengthMax = campaignData.videoLengthMax;
    if (campaignData.reviewTiming) createData.reviewTiming = campaignData.reviewTiming;
    if (campaignData.startDate) createData.startDate = new Date(campaignData.startDate);
    if (campaignData.endDate) createData.endDate = new Date(campaignData.endDate);
    // Max clips per user per day (validated 1-6, default 3)
    const maxClips = data.maxClipsPerUserPerDay ? parseInt(data.maxClipsPerUserPerDay) : 3;
    createData.maxClipsPerUserPerDay = Math.max(1, Math.min(6, isNaN(maxClips) ? 3 : maxClips));

    const campaign = await db.campaign.create({ data: createData });

    // Send campaign alerts to all active clippers (fire-and-forget)
    if (campaign.status === 'ACTIVE') {
      broadcastCampaignAlert(campaign.name, campaign.description || 'A new campaign is live! Start clipping now.').catch(() => {});
    }

    return NextResponse.json(campaign, { status: 201 });
  } catch (err: any) {
    console.error("DB campaign create failed:", err?.message, err);
    return NextResponse.json({ error: err?.message || "Failed to create campaign" }, { status: 500 });
  }
}
