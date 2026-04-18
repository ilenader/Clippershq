import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds, userHasCampaignCommunityAccess } from "@/lib/community";
import { checkRateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Reactions are constrained to a small accent-blue fixed set. Anything else → 400.
const ALLOWED_REACTIONS = new Set(["thumbsup", "heart", "fire", "clap", "eyes"]);

/**
 * POST /api/community/reactions { messageId, emoji }
 * Toggle-only semantics — existing (user, message, emoji) row → delete; absent → insert.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const emoji = typeof body.emoji === "string" ? body.emoji : "";
  if (!messageId || !emoji) return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
  if (!ALLOWED_REACTIONS.has(emoji)) return NextResponse.json({ error: "Unsupported reaction" }, { status: 400 });

  // 30 toggles per minute per user — generous enough for rapid taps, blocks abuse.
  const rl = checkRateLimit(`community-react:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  try {
    const message = await db.channelMessage.findUnique({
      where: { id: messageId },
      select: { id: true, channelId: true, channel: { select: { campaignId: true } } },
    });
    if (!message) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const campaignId = message.channel?.campaignId;
    if (!campaignId) return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
    const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await db.messageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: session.user.id, emoji } },
    });
    let action: "add" | "remove";
    if (existing) {
      await db.messageReaction.delete({ where: { id: existing.id } });
      action = "remove";
    } else {
      await db.messageReaction.create({
        data: { messageId, userId: session.user.id, emoji },
      });
      action = "add";
    }

    const subscribers = await getCampaignSubscriberIds(campaignId);
    publishToUsers(subscribers, "channel_reaction", {
      channelId: message.channelId,
      messageId,
      emoji,
      userId: session.user.id,
      action,
    }).catch(() => {});

    return NextResponse.json({ ok: true, action });
  } catch (err: any) {
    console.error("[COMMUNITY] reactions POST error:", err?.message);
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }
}
