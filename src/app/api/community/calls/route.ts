import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { userHasCampaignCommunityAccess, getCampaignSubscriberIds } from "@/lib/community";
import { publishToUsers } from "@/lib/ably";
import { createNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/calls?campaignId=X
 * Returns upcoming + past calls for the campaign, plus any isGlobal calls.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const statusParam = req.nextUrl.searchParams.get("status");
  const where: any = campaignId
    ? { OR: [{ campaignId }, { isGlobal: true }] }
    : { isGlobal: true };

  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) where.status = { in: statuses };
  }

  if (campaignId && role === "CLIPPER") {
    const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, campaignId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const calls = await db.scheduledVoiceCall.findMany({
    where,
    include: { createdBy: { select: { id: true, username: true, image: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 200,
  });

  // Status-filtered requests get a flat array; legacy callers still get {upcoming, past}.
  if (statusParam) return NextResponse.json(calls);

  const now = Date.now();
  const upcoming = calls.filter((c: any) => new Date(c.scheduledAt).getTime() >= now);
  const past = calls.filter((c: any) => new Date(c.scheduledAt).getTime() < now);

  return NextResponse.json({ upcoming, past });
}

/**
 * POST /api/community/calls { campaignId?, title, description?, scheduledAt, duration?, isGlobal? }
 * OWNER/ADMIN only. Sends an immediate in-app notification + Ably push to all subscribers.
 * The 48h/24h/12h/5h/start reminder emails are handled by a cron worker (not in this commit).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 200) {
    return NextResponse.json({ error: "Title is required (max 200 chars)" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.slice(0, 5000) : null;
  const scheduledAtRaw = body.scheduledAt;
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduledAt is invalid" }, { status: 400 });
  }

  const duration = typeof body.duration === "number" && body.duration > 0 ? Math.min(body.duration, 480) : 60;
  const isGlobal = !!body.isGlobal;
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
  if (!isGlobal && !campaignId) {
    return NextResponse.json({ error: "campaignId required unless isGlobal" }, { status: 400 });
  }

  try {
    const call = await db.scheduledVoiceCall.create({
      data: {
        campaignId: isGlobal ? null : campaignId,
        isGlobal,
        title,
        description,
        scheduledAt,
        duration,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { id: true, username: true, image: true } } },
    });

    // Announce to subscribers — all users for global, or campaign subscribers otherwise.
    const subscribers = isGlobal
      ? (await db.user.findMany({ where: { role: { in: ["CLIPPER", "OWNER", "ADMIN"] } }, select: { id: true } })).map((u: any) => u.id)
      : await getCampaignSubscriberIds(campaignId!);

    publishToUsers(subscribers, "voice_call_scheduled", {
      callId: call.id,
      title: call.title,
      scheduledAt: call.scheduledAt,
      campaignId: call.campaignId,
      isGlobal: call.isGlobal,
    }).catch(() => {});

    // In-app notifications (fire-and-forget batch).
    const notifyIds: string[] = subscribers.filter((uid: string) => uid !== session.user.id);
    (async () => {
      try {
        await Promise.all(
          notifyIds.map((uid: string) =>
            createNotification(
              uid,
              "CLIP_FLAGGED",
              `Voice call: ${title}`,
              `Scheduled for ${scheduledAt.toLocaleString()}`,
              { callId: call.id, campaignId },
            ).catch(() => {}),
          ),
        );
      } catch {}
    })();

    return NextResponse.json(call, { status: 201 });
  } catch (err: any) {
    console.error("[COMMUNITY] calls POST error:", err?.message);
    return NextResponse.json({ error: "Failed to schedule call" }, { status: 500 });
  }
}
