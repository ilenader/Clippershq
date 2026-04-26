import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds, userHasCampaignCommunityAccess } from "@/lib/community";
import { withDbRetry } from "@/lib/db-retry";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["scheduled", "live", "completed", "cancelled", "ended"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id } = await params;
  const call = await withDbRetry(
    () => db.scheduledVoiceCall.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, username: true, image: true } },
        campaign: { select: { id: true, name: true } },
      },
    }),
    "voice.call.get",
  );
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  return NextResponse.json(call);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`voice-call-edit:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;
  const data: any = {};
  if (typeof body.status === "string") {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.recordingUrl !== undefined) {
    if (body.recordingUrl !== null && (typeof body.recordingUrl !== "string" || body.recordingUrl.length > 2000)) {
      return NextResponse.json({ error: "Invalid recordingUrl" }, { status: 400 });
    }
    data.recordingUrl = body.recordingUrl;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Per-campaign authorization for ADMIN. Global calls are OWNER-only to modify.
  const existing = await withDbRetry<{ campaignId: string | null; isGlobal: boolean } | null>(
    () => db.scheduledVoiceCall.findUnique({
      where: { id },
      select: { campaignId: true, isGlobal: true },
    }),
    "voice.call.authcheck",
  );
  if (!existing) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (existing.isGlobal && role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can modify global calls" }, { status: 403 });
  }
  if (!existing.isGlobal && existing.campaignId) {
    const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, existing.campaignId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const updated = await db.scheduledVoiceCall.update({ where: { id }, data });

    // Notify subscribers when the call's lifecycle status changes so clients
    // can auto-leave (ended) or auto-open the room (live).
    if (data.status) {
      try {
        const subs = updated.isGlobal
          ? (await db.user.findMany({
              where: { role: { in: ["CLIPPER", "OWNER", "ADMIN"] } },
              select: { id: true },
            })).map((u: any) => u.id)
          : updated.campaignId
            ? await getCampaignSubscriberIds(updated.campaignId)
            : [];
        publishToUsers(subs, "voice_call_status", {
          callId: updated.id,
          status: data.status,
          campaignId: updated.campaignId,
        }).catch(() => {});
      } catch {}
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error("[COMMUNITY] call PATCH error:", err?.message);
    return NextResponse.json({ error: "Failed to update call" }, { status: 500 });
  }
}

/**
 * DELETE /api/community/calls/[id]
 * Marks the call as "cancelled" (keeps the row) and notifies subscribers.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = checkRoleAwareRateLimit(`voice-call-edit:${session.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id } = await params;
  const call = await withDbRetry<any>(
    () => db.scheduledVoiceCall.findUnique({ where: { id } }),
    "voice.call.delcheck",
  );
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

  // Per-campaign authorization for ADMIN. Global calls are OWNER-only to cancel.
  if (call.isGlobal && role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can cancel global calls" }, { status: 403 });
  }
  if (!call.isGlobal && call.campaignId) {
    const hasAccess = await userHasCampaignCommunityAccess(session.user.id, role, call.campaignId);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await db.scheduledVoiceCall.update({ where: { id }, data: { status: "cancelled" } });

    const subscribers = call.isGlobal
      ? (await db.user.findMany({ where: { role: { in: ["CLIPPER", "OWNER", "ADMIN"] } }, select: { id: true } })).map((u: any) => u.id)
      : call.campaignId ? await getCampaignSubscriberIds(call.campaignId) : [];

    publishToUsers(subscribers, "voice_call_cancelled", { callId: id, title: call.title }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[COMMUNITY] call DELETE error:", err?.message);
    return NextResponse.json({ error: "Failed to cancel call" }, { status: 500 });
  }
}
