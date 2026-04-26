import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds, validateChannelName } from "@/lib/community";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_CREATE_TYPES = ["general", "announcement", "private"] as const;

/**
 * POST /api/community/channels/create  { campaignId, name, type }
 * OWNER-only. Creates a new channel in a campaign with the next sortOrder and
 * broadcasts a `channel_created` Ably event so every subscriber's channel list
 * refreshes. Defaults (general / announcement / leaderboard) are provisioned
 * by `ensureCampaignChannels` — this endpoint is for additional channels.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can create channels" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`channel-create:${session.user.id}`, 5, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const rawName = typeof body.name === "string" ? body.name : "";
  const type = typeof body.type === "string" ? body.type : "general";

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }
  if (!ALLOWED_CREATE_TYPES.includes(type as any)) {
    return NextResponse.json({ error: "Invalid channel type" }, { status: 400 });
  }

  // Normalize the name the same way the UI does: lowercase, hyphens instead of spaces,
  // drop anything that isn't [a-z0-9-]. Then run through the shared validator.
  const normalized = rawName.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const validationError = validateChannelName(normalized);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    // Verify the campaign exists (defense-in-depth; foreign-key would catch it otherwise).
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Pick sortOrder = (current max) + 1 so new channels land at the end of the list.
    const maxRow = await db.channel.findFirst({
      where: { campaignId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const sortOrder = (maxRow?.sortOrder ?? -1) + 1;

    const channel = await db.channel.create({
      data: { campaignId, name: normalized, type, sortOrder },
    });

    // Broadcast so every subscriber's ChannelList refreshes without a poll.
    try {
      const subs = await getCampaignSubscriberIds(campaignId);
      publishToUsers(subs, "channel_created", {
        campaignId,
        channelId: channel.id,
        name: channel.name,
        type: channel.type,
      }).catch(() => {});
    } catch {}

    return NextResponse.json(channel, { status: 201 });
  } catch (err: any) {
    // Unique-constraint (campaignId + name) → friendly message.
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A channel with that name already exists" }, { status: 400 });
    }
    console.error("[COMMUNITY] channel create error:", err?.message);
    return NextResponse.json({ error: "Failed to create channel" }, { status: 500 });
  }
}
