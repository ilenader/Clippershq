import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { createNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.scheduledCall) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id } = await params;
  const role = (session.user as any).role;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const call = await db.scheduledCall.findUnique({
      where: { id },
      include: { user: { select: { username: true } }, payout: { select: { amount: true } } },
    });
    if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

    // Owner can update status
    if (role === "OWNER" && body.status) {
      if (!["COMPLETED", "MISSED", "CANCELLED"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }

      await db.scheduledCall.update({
        where: { id },
        data: { status: body.status, notes: body.notes || null },
      });

      if (body.status === "CANCELLED") {
        await createNotification(
          call.userId,
          "PAYOUT_REJECTED",
          "Call cancelled",
          "Your scheduled verification call has been cancelled. A new time may be requested.",
          { callId: id },
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch (err: any) {
    console.error("PATCH /api/calls/[id] error:", err?.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
