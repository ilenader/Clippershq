import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { createNotification } from "@/lib/notifications";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Helper: get Belgrade-time date boundaries for a given YYYY-MM-DD string.
 * Returns { start, end } as UTC Date objects representing 00:00 and 23:59:59 Belgrade time.
 */
function getBelgradeDayBounds(dateStr: string): { start: Date; end: Date } {
  // Belgrade is UTC+1 (CET) or UTC+2 (CEST). Use Intl to determine offset.
  const d = new Date(`${dateStr}T12:00:00`);
  const belgradeStr = d.toLocaleString("en-US", { timeZone: "Europe/Belgrade" });
  const belgradeMid = new Date(belgradeStr);
  const offsetMs = d.getTime() - belgradeMid.getTime();

  const start = new Date(`${dateStr}T00:00:00`);
  start.setTime(start.getTime() + offsetMs);
  const end = new Date(`${dateStr}T23:59:59`);
  end.setTime(end.getTime() + offsetMs);
  return { start, end };
}

/**
 * Generate available 15-min slots for a date in Belgrade time (8:00-19:45).
 */
function generateSlots(dateStr: string, bookedUtcTimes: Date[]): string[] {
  const slots: string[] = [];
  const now = Date.now();
  const minBookAhead = 10 * 60 * 60 * 1000; // 10 hours

  // Belgrade offset for this date
  const ref = new Date(`${dateStr}T12:00:00`);
  const belgradeStr = ref.toLocaleString("en-US", { timeZone: "Europe/Belgrade" });
  const belgradeMid = new Date(belgradeStr);
  const offsetMs = ref.getTime() - belgradeMid.getTime();

  const bookedSet = new Set(bookedUtcTimes.map((d) => d.getTime()));

  for (let h = 8; h < 20; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      // Convert Belgrade local time to UTC
      const localDate = new Date(`${dateStr}T${hh}:${mm}:00`);
      const utcTime = new Date(localDate.getTime() + offsetMs);

      // Skip if too soon
      if (utcTime.getTime() - now < minBookAhead) continue;
      // Skip if booked
      if (bookedSet.has(utcTime.getTime())) continue;

      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.scheduledCall) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const role = (session.user as any).role;

  // Available slots for a date
  if (req.nextUrl.searchParams.get("available") === "true") {
    const dateStr = req.nextUrl.searchParams.get("date");
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }

    // Must be within next 7 days
    const requestedDate = new Date(`${dateStr}T12:00:00Z`);
    const now = new Date();
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (requestedDate > maxDate) {
      return NextResponse.json({ error: "Date must be within the next 7 days." }, { status: 400 });
    }

    try {
      const { start, end } = getBelgradeDayBounds(dateStr);
      const booked = await db.scheduledCall.findMany({
        where: {
          scheduledAt: { gte: start, lte: end },
          status: { not: "CANCELLED" },
        },
        select: { scheduledAt: true },
      });
      const bookedTimes = booked.filter((b: any) => b.scheduledAt).map((b: any) => new Date(b.scheduledAt));
      const slots = generateSlots(dateStr, bookedTimes);
      return NextResponse.json({ date: dateStr, slots, timezone: "Europe/Belgrade" });
    } catch {
      return NextResponse.json({ error: "Failed to load slots." }, { status: 500 });
    }
  }

  // Clipper: my calls
  if (req.nextUrl.searchParams.get("my") === "true") {
    try {
      const calls = await db.scheduledCall.findMany({
        where: { userId: session.user.id },
        include: {
          payout: { select: { amount: true, finalAmount: true, campaign: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json(calls);
    } catch {
      return NextResponse.json([]);
    }
  }

  // Owner: all calls
  if (role === "OWNER") {
    try {
      const calls = await db.scheduledCall.findMany({
        include: {
          user: { select: { id: true, username: true, image: true } },
          payout: { select: { id: true, amount: true, finalAmount: true, campaign: { select: { name: true } } } },
        },
        orderBy: { scheduledAt: "asc" },
      });
      return NextResponse.json(calls);
    } catch {
      return NextResponse.json([]);
    }
  }

  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can request verification calls." }, { status: 403 });
  }

  if (!db || !db.scheduledCall) return NextResponse.json({ error: "Database unavailable. Server may need restart." }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { payoutId } = body;
  if (!payoutId) return NextResponse.json({ error: "Payout ID is required." }, { status: 400 });

  try {
    const payout = await db.payoutRequest.findUnique({
      where: { id: payoutId },
      select: { id: true, userId: true, amount: true, status: true },
    });
    if (!payout) return NextResponse.json({ error: "Payout not found." }, { status: 404 });

    // Check if call already exists
    const existing = await db.scheduledCall.findFirst({
      where: { payoutId, status: { not: "CANCELLED" } },
    });
    if (existing) {
      return NextResponse.json({ error: "A call is already scheduled for this payout.", existing: true }, { status: 400 });
    }

    // Create the call request
    await db.scheduledCall.create({
      data: {
        payoutId,
        userId: payout.userId,
      },
    });

    // Move payout to UNDER_REVIEW if REQUESTED
    if (payout.status === "REQUESTED") {
      await db.payoutRequest.update({
        where: { id: payoutId },
        data: { status: "UNDER_REVIEW" },
      });
    }

    // Notify clipper
    const formattedAmount = `$${Number(payout.amount).toFixed(2)}`;
    await createNotification(
      payout.userId,
      "PAYOUT_APPROVED", // reuse type for now
      "Verification call requested",
      `A verification call has been requested for your payout of ${formattedAmount}. Please select a time slot on your Payouts page.`,
      { payoutId },
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("POST /api/calls error:", err?.message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
