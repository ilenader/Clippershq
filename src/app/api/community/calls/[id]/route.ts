import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUsers } from "@/lib/ably";
import { getCampaignSubscriberIds } from "@/lib/community";
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
  const call = await db.scheduledVoiceCall.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, username: true, image: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
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
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id } = await params;
  const call = await db.scheduledVoiceCall.findUnique({ where: { id } });
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });

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
