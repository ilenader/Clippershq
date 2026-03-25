import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { computeBalance } from "@/lib/balance";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  // Only OWNER can view all payouts (admin is blocked)
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status");

  if (!db) return NextResponse.json([]);

  try {
    const where = status ? { status: status as any } : {};
    const payouts = await db.payoutRequest.findMany({
      where,
      include: {
        user: { select: { username: true, image: true, discordId: true } },
        campaign: { select: { name: true, platform: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(payouts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = parseFloat(data.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 });
  }
  if (amount < 10) {
    return NextResponse.json({ error: "Minimum payout is $10" }, { status: 400 });
  }
  if (!data.walletAddress?.trim()) {
    return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
  }
  if (!data.discordUsername?.trim()) {
    return NextResponse.json({ error: "Discord username is required" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  // ── Server-side balance validation ──
  // Fetch user's clips + payouts to compute real available balance
  let clips: any[] = [];
  let payouts: any[] = [];

  try {
    const [dbClips, dbPayouts] = await Promise.all([
      db.clip.findMany({
        where: { userId: session.user.id },
        select: { earnings: true, status: true },
      }),
      db.payoutRequest.findMany({
        where: { userId: session.user.id },
        select: { amount: true, status: true },
      }),
    ]);
    clips = dbClips;
    payouts = dbPayouts;
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  const balance = computeBalance({ clips, payouts });

  if (amount > balance.available) {
    return NextResponse.json(
      {
        error: "Insufficient available balance",
        available: balance.available,
        requested: amount,
      },
      { status: 400 }
    );
  }

  // ── Create payout (balance is sufficient) ──
  try {
    const payout = await db.payoutRequest.create({
      data: {
        userId: session.user.id,
        campaignId: data.campaignId || null,
        amount,
        walletAddress: data.walletAddress,
        discordUsername: data.discordUsername || null,
        proofNote: data.proofNote || null,
        proofFileUrl: data.proofFileUrl || null,
      },
    });
    return NextResponse.json(payout, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create payout request" }, { status: 500 });
  }
}
