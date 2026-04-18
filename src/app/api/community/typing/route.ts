import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds, userHasCampaignCommunityAccess } from "@/lib/community";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/community/typing { channelId }
 *
 * Ephemeral typing signal — publishes a `typing` event to every subscriber of the
 * channel's campaign. No DB write. Heavily rate-limited (1 fire per 2s per user)
 * so a long keystroke burst doesn't spam the Ably channel.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  // Server-side throttle — the client debounces too, but don't trust it.
  const rl = checkRateLimit(`community-typing:${session.user.id}`, 1, 2_000);
  if (!rl.allowed) return NextResponse.json({ ok: true });

  const channel = await db.channel.findUnique({
    where: { id: channelId },
    select: { campaignId: true },
  });
  if (!channel) return NextResponse.json({ ok: false });

  const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, channel.campaignId);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const username = (session.user as any).username || (session.user as any).name || "user";
  const subscribers = await getCampaignSubscriberIds(channel.campaignId);
  publishToUsers(subscribers, "typing", {
    channelId,
    userId: session.user.id,
    username,
    campaignId: channel.campaignId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
