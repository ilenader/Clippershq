import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { createNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "CLIPPER") {
    return NextResponse.json({ error: "Only clippers can book call slots." }, { status: 403 });
  }

  if (!db || !db.scheduledCall) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { payoutId, date, time, discordUsername, clipperTimezone } = body;
  if (!payoutId || !date || !time || !discordUsername?.trim()) {
    return NextResponse.json({ error: "All fields are required: payout, date, time, and Discord username." }, { status: 400 });
  }

  try {
    // Verify payout belongs to user
    const payout = await db.payoutRequest.findUnique({
      where: { id: payoutId },
      select: { id: true, userId: true, amount: true },
    });
    if (!payout || payout.userId !== session.user.id) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    // Find pending call for this payout
    const call = await db.scheduledCall.findFirst({
      where: { payoutId, status: "PENDING" },
    });
    if (!call) {
      return NextResponse.json({ error: "No pending call request found for this payout." }, { status: 400 });
    }

    // Build UTC time from Belgrade time
    const ref = new Date(`${date}T12:00:00`);
    const belgradeStr = ref.toLocaleString("en-US", { timeZone: "Europe/Belgrade" });
    const belgradeMid = new Date(belgradeStr);
    const offsetMs = ref.getTime() - belgradeMid.getTime();
    const localDate = new Date(`${date}T${time}:00`);
    const utcTime = new Date(localDate.getTime() + offsetMs);

    // Validate: at least 10 hours from now
    if (utcTime.getTime() - Date.now() < 10 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Please select a time at least 10 hours from now." }, { status: 400 });
    }

    // Validate: within 7 days
    if (utcTime.getTime() - Date.now() > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Please select a date within the next 7 days." }, { status: 400 });
    }

    // Check hour is 8:00-19:45 Belgrade
    const hour = parseInt(time.split(":")[0]);
    if (hour < 8 || hour >= 20) {
      return NextResponse.json({ error: "Available hours are 8:00 AM to 8:00 PM." }, { status: 400 });
    }

    // Check slot not already booked
    const conflict = await db.scheduledCall.findFirst({
      where: {
        scheduledAt: utcTime,
        status: { not: "CANCELLED" },
        id: { not: call.id },
      },
    });
    if (conflict) {
      return NextResponse.json({ error: "This slot is no longer available. Please pick another time." }, { status: 400 });
    }

    // Update the call
    await db.scheduledCall.update({
      where: { id: call.id },
      data: {
        scheduledAt: utcTime,
        discordUsername: discordUsername.trim(),
        clipperTimezone: clipperTimezone || null,
        status: "CONFIRMED",
      },
    });

    // Format for notifications
    const displayDate = utcTime.toLocaleDateString("en-US", { timeZone: "Europe/Belgrade", weekday: "short", month: "short", day: "numeric" });
    const displayTime = utcTime.toLocaleTimeString("en-US", { timeZone: "Europe/Belgrade", hour: "2-digit", minute: "2-digit", hour12: true });

    // Notify owner
    const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
    for (const owner of owners) {
      await createNotification(
        owner.id,
        "PAYOUT_APPROVED",
        "Call confirmed",
        `📞 ${session.user.name || "A clipper"} booked a call for ${displayDate} at ${displayTime} . Discord: ${discordUsername.trim()}`,
        { payoutId, callId: call.id },
      );
    }

    // Notify clipper
    await createNotification(
      session.user.id,
      "PAYOUT_APPROVED",
      "Call confirmed",
      `Your call is confirmed for ${displayDate} at ${displayTime} . Make sure you're available on Discord!`,
      { payoutId, callId: call.id },
    );

    return NextResponse.json({ success: true, scheduledAt: utcTime.toISOString() });
  } catch (err: any) {
    console.error("POST /api/calls/book error:", err?.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
